import "server-only"

import {
  automationTemplateRecordToSchema,
  groupAutomationTemplateExampleRunsByTemplateId,
  listAutomationTemplateExampleRuns,
  listAutomationTemplateRecords,
} from "@/lib/automation-templates"
import {
  linkedInArchetypes,
  linkedInFormatRules,
  linkedInHookStyles,
  linkedInVoicePresets,
  LINKEDIN_PRESET_VERSION,
} from "@/lib/linkedin-post-presets"
import { automationTemplateToTempSlideTestingAutomation } from "@/lib/temp-slide-testing"
import { videoAutomationTemplatePresets } from "@/lib/video-automation-templates"
import {
  hookStylesForPlatform,
  platformRules,
  threadsPostArchetypes,
  voicePresets,
  xPostArchetypes,
} from "@/lib/x-post-presets"

import {
  AutomationTemplateCatalog,
  type AssetTemplateCatalogItem,
  type AssetTemplateDirection,
} from "./automation-template-catalog"

export async function SlideshowAutomationTemplateAssets() {
  const result = await loadSlideshowTemplateItems()
  if ("error" in result) {
    return <TemplateCatalogError error={result.error} />
  }

  return (
    <AutomationTemplateCatalog
      items={result.items}
      emptyMessage="No slideshow automation templates are available in the catalog."
    />
  )
}

async function loadSlideshowTemplateItems(): Promise<
  { items: AssetTemplateCatalogItem[] } | { error: unknown }
> {
  try {
    const [records, exampleRuns] = await Promise.all([
      listAutomationTemplateRecords(),
      listAutomationTemplateExampleRuns(),
    ])
    const examplesByTemplate =
      groupAutomationTemplateExampleRunsByTemplateId(exampleRuns)
    const items = records
      .filter((record) => record.automationKind !== "video")
      .map<AssetTemplateCatalogItem>((record) => {
        const automation =
          automationTemplateToTempSlideTestingAutomation(record)
        const examples = (examplesByTemplate[record.id] ?? []).flatMap(
          (run, runIndex) => {
            const slides = (run.plan?.slides ?? []).flatMap(
              (slide, slideIndex) => {
                const imageUrl = slide.imageUrl?.trim()
                if (!imageUrl) return []
                return [
                  {
                    id: `${run.id}-${slide.id ?? slideIndex}`,
                    imageUrl,
                    text:
                      slide.text?.trim() || slide.imageCaption?.trim() || "",
                    aspectRatio:
                      slide.aspectRatio ||
                      automation.slides[
                        Math.min(slideIndex, automation.slides.length - 1)
                      ]?.aspectRatio ||
                      automation.slides[0]?.aspectRatio,
                  },
                ]
              }
            )
            return slides.length > 0
              ? [
                  {
                    id: run.id,
                    label: `Example slideshow ${runIndex + 1}`,
                    slides,
                  },
                ]
              : []
          }
        )
        const aspectRatios = [
          ...new Set(automation.slides.map((slide) => slide.aspectRatio)),
        ]
        const schema = automationTemplateRecordToSchema(record)
        const tone = schema.tone.preset || "Custom"

        return {
          id: record.id,
          name: record.name,
          eyebrow: `${record.theme || "General"} slideshow`,
          description: `${record.name} is a ${tone.toLowerCase()} slideshow automation with ${automation.slides.length} configured slide slots. Its catalog definition supplies the hooks, media collections, text constraints, and publishing-ready runtime settings copied into a new automation.`,
          styleBrief:
            schema.prompt_formatting.style ||
            `Use the ${tone.toLowerCase()} tone while keeping every slide specific to its selected hook.`,
          metadata: [
            `${automation.slides.length} slides`,
            tone,
            aspectRatios.join(" / "),
            `${examples.length} example${examples.length === 1 ? "" : "s"}`,
          ],
          sectionsLabel: "Slide content directions",
          sections: automation.slides.map((slide) => ({
            id: slide.id,
            title: slide.title,
            description: [
              slide.aspectRatio,
              slide.imageGrid === "none"
                ? "single image"
                : `${slide.imageGrid} image grid`,
              slide.overlay ? "dark overlay" : "no dark overlay",
              slide.collectionId
                ? `collection ${slide.collectionId}`
                : "collection chosen at runtime",
            ].join(" · "),
            directions: slide.textItems.map((item, index) => ({
              label: item.label || `Text ${index + 1}`,
              description:
                item.textMode === "static"
                  ? item.staticText || "Static text"
                  : item.contentDirection ||
                    "Write text that develops the selected hook.",
              constraint: `${item.wordLengthMin}–${item.wordLengthMax} words · ${item.textPosition} · ${item.textStyle}`,
            })),
          })),
          examples,
          settings: serializable({
            catalog: {
              id: record.id,
              sourceAutomationId: record.sourceAutomationId,
              sourceUrl: record.sourceUrl,
              name: record.name,
              theme: record.theme,
              updatedAt: record.updatedAt,
            },
            definition: "schema" in record ? record.schema : record.template,
            runtimeSchema: schema,
          }),
        }
      })

    return { items }
  } catch (error) {
    return { error }
  }
}

export function VideoAutomationTemplateAssets() {
  const items = videoAutomationTemplatePresets.map<AssetTemplateCatalogItem>(
    (preset) => {
      const format = preset.buildFormat()
      const globalDirections = format.globalTextItems.map(textDirection)
      const sections = [
        ...(globalDirections.length > 0
          ? [
              {
                id: `${preset.id}-global`,
                title: "Global text overlay",
                description:
                  "Text remains available across the video rather than belonging to one segment.",
                directions: globalDirections,
              },
            ]
          : []),
        ...format.segments.map((segment) => ({
          id: segment.id,
          title: segment.label,
          description: [
            segment.guidance,
            `${segment.mediaSource.replaceAll("_", " ")} ${segment.mediaKind}`,
            segment.playFullVideo
              ? "plays the selected media in full"
              : `${segment.clipCount} clip${segment.clipCount === 1 ? "" : "s"} × ${(segment.clipDurationMs / 1000).toFixed(1)}s`,
            `${segment.transition} transition`,
          ].join(" · "),
          directions: segment.textItems.map(textDirection),
        })),
      ]

      return {
        id: preset.id,
        name: preset.name,
        eyebrow: "Video automation",
        description: preset.description,
        styleBrief: preset.tagline,
        metadata: [
          `${format.segments.length} segment${format.segments.length === 1 ? "" : "s"}`,
          `${format.globalTextItems.length + format.segments.reduce((total, segment) => total + segment.textItems.length, 0)} text direction${format.globalTextItems.length === 1 ? "" : "s"}`,
          format.hookPlacement.replaceAll("_", " "),
        ],
        sectionsLabel: "Segments and content directions",
        sections,
        settings: {
          id: preset.id,
          name: preset.name,
          tagline: preset.tagline,
          description: preset.description,
          format,
        },
      }
    }
  )

  return <AutomationTemplateCatalog items={items} />
}

export function OtherAutomationTemplateAssets() {
  const items: AssetTemplateCatalogItem[] = [
    socialTemplateItem({
      id: "x-posts",
      name: "X post automation",
      eyebrow: "Social text automation",
      description:
        "Generates either a single X post or an educational thread by selecting a weighted archetype, compatible hook style, and reusable voice preset before deterministic validation.",
      styleBrief:
        "Front-load the value, remain inside X character limits, and use proof-gated structures only when evidence is supplied.",
      archetypes: xPostArchetypes,
      settings: {
        platform: "x",
        archetypes: xPostArchetypes,
        hookStyles: hookStylesForPlatform("x"),
        voicePresets,
        rules: platformRules.x,
      },
    }),
    socialTemplateItem({
      id: "threads-posts",
      name: "Threads post automation",
      eyebrow: "Social text automation",
      description:
        "Generates short, identity-led Threads posts from a weighted mix of callouts, questions, analogies, micro-stories, credibility claims, and community-code humor.",
      styleBrief:
        "Keep the output to a few conversational lines with intentional blank-line rhythm, limited emoji, and no invented first-person proof.",
      archetypes: threadsPostArchetypes,
      settings: {
        platform: "threads",
        archetypes: threadsPostArchetypes,
        hookStyles: hookStylesForPlatform("threads"),
        voicePresets,
        rules: platformRules.threads,
      },
    }),
    socialTemplateItem({
      id: "linkedin-posts",
      name: "LinkedIn post automation",
      eyebrow: "Social text automation",
      description:
        "Builds structured LinkedIn posts from production-tested archetypes, hook formulas, proof-aware voices, and strict output validation for length and unsupported claims.",
      styleBrief:
        "Use practitioner-level specificity, one idea per line, and concrete artifacts or examples. First-person outcomes are allowed only when proof is present.",
      archetypes: linkedInArchetypes,
      settings: {
        version: LINKEDIN_PRESET_VERSION,
        platform: "linkedin",
        archetypes: linkedInArchetypes,
        hookStyles: linkedInHookStyles,
        voicePresets: linkedInVoicePresets,
        rules: linkedInFormatRules,
      },
    }),
  ]

  return <AutomationTemplateCatalog items={items} />
}

function socialTemplateItem(input: {
  id: string
  name: string
  eyebrow: string
  description: string
  styleBrief: string
  archetypes: Array<{
    id: string
    label: string
    structure: string
    slots: Array<{
      key: string
      description: string
      minWords: number
      maxWords: number
      optional?: boolean
    }>
  }>
  settings: unknown
}): AssetTemplateCatalogItem {
  return {
    id: input.id,
    name: input.name,
    eyebrow: input.eyebrow,
    description: input.description,
    styleBrief: input.styleBrief,
    metadata: [
      `${input.archetypes.length} archetypes`,
      "weighted selection",
      "deterministic validation",
    ],
    sectionsLabel: "Post structures and content directions",
    sections: input.archetypes.map((archetype) => ({
      id: archetype.id,
      title: archetype.label,
      description: archetype.structure,
      directions: archetype.slots.map((slot) => ({
        label: slot.key,
        description: slot.description,
        constraint: `${slot.minWords}–${slot.maxWords} words${slot.optional ? " · optional" : ""}`,
      })),
    })),
    settings: input.settings,
  }
}

function textDirection(
  item: {
    contentDirection: string
    textMode: "prompt" | "static"
    staticText: string
    wordLengthMin: number
    wordLengthMax: number
    textPosition: string
    textStyle: string
  },
  index: number
): AssetTemplateDirection {
  return {
    label: `Text ${index + 1}`,
    description:
      item.textMode === "static"
        ? item.staticText || "Static text"
        : item.contentDirection || "Generate text for this segment.",
    constraint: `${item.wordLengthMin}–${item.wordLengthMax} words · ${item.textPosition} · ${item.textStyle}`,
  }
}

function serializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function TemplateCatalogError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Unknown error"
  return (
    <div className="not-prose my-8 rounded-xl border border-destructive/30 bg-destructive/10 p-5">
      <p className="text-sm font-semibold text-foreground">
        The slideshow template catalog could not be loaded.
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        Start the shared Appwrite stack and reload this page. {message}
      </p>
    </div>
  )
}
