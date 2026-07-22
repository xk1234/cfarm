import { clean, isRecord } from "@/lib/guards"
import {
  automationTemplateSchemaToRuntime,
  type AutomationTemplateRecord,
} from "@/lib/automation-templates"
import type { StoredImageCollection } from "@/lib/image-collections"
import {
  collectionAliases,
  storedToCollection,
} from "@/lib/realfarm-collections"
import {
  automationCollectionId,
  automationFormatSection,
  automationHooks,
  automationTone,
  type AutomationFormatSection,
  type AutomationSchema,
  type AutomationTextItem,
} from "@/lib/realfarm-automation"
import {
  normalizeSocialPostMetadata,
  socialPostMetadataPromptLines,
  socialPostMetadataSchemaProperties,
} from "@/lib/social-post-metadata"

export type TempSlideSectionId = "hook" | "content" | "cta"

export type TempSlideImage = {
  id: string
  imageUrl: string
  description: string
}

export type TempSlideImageCollection = {
  id: string
  aliases: string[]
  title: string
  images: TempSlideImage[]
}

export type TempSlideTextPlaceholder = {
  id: string
  itemId: string
  section: TempSlideSectionId
  slideId: string
  label: string
  contentDirection: string
  wordLengthMin: number
  wordLengthMax: number
  textMode: "prompt" | "static"
  staticText: string
  font: string
  fontSize: string
  textStyle: string
  textPosition: string
  textItemWidth: string
  textAlign: string
  textAnchor: string
  textVerticalAnchor: string
}

export type TempSlideSpec = {
  id: string
  index: number
  section: TempSlideSectionId
  title: string
  aspectRatio: string
  imageGrid: string
  overlay: boolean
  aiImageSelection?: boolean
  displayText: boolean
  collectionId: string
  overlayImage?: {
    enabled: boolean
    collectionId: string
    height: number
  }
  textItems: TempSlideTextPlaceholder[]
}

export type TempSlideTestingAutomation = {
  id: string
  name: string
  theme: string
  hooks: string[]
  tone: string
  style: string
  imageCollectionIds: {
    hook: string
    content: string
    cta: string
  }
  slides: TempSlideSpec[]
}

export type TempSlideStructuredOutput = {
  title: string
  caption: string
  hashtags: string
  text: Record<string, string>
}

export const defaultTempSlideSystemPrompt =
  "You fill metadata and text placeholders for TikTok slideshow ads. The selected hook defines the slideshow topic, and each placeholder's content direction defines what that text box must say about the hook. These requirements outrank automation names, global style, tone, examples, and legacy template language. Use global style and tone only for voice or formatting; ignore any part that changes the topic or conflicts with the selected hook or content direction. Return only JSON that matches the provided schema. Do not add visual parameters, image prompts, commentary, markdown, or extra keys."

export const defaultTempSlideUserInstructions =
  "Generate a concise slideshow title, a short social caption, and broad niche hashtags. Fill every non-hook placeholder text box. Use the fixed hook as context only and do not rewrite it. Every body slide must directly develop the exact subject and claim in the selected hook while following its own content direction. Body slides should be specific to the hook, not merely the automation category. Return slide text only in the schema's text object."

export type TempSlidePromptInput = {
  automationName: string
  hook: string
  tone: string
  style: string
  promptInstructions: string
  placeholders: TempSlideTextPlaceholder[]
  avoidSimilarOutputs?: string[]
  performanceMemory?: {
    provenPatterns: string[]
    avoidPatterns: string[]
  }
}

export function buildTempSlideUserPrompt(input: TempSlidePromptInput) {
  const placeholderLines = input.placeholders.map((placeholder) => {
    return `- ${placeholder.id}: ${placeholder.slideId}, ${placeholder.section}, ${placeholderRequirement(placeholder)}`
  })

  return [
    `Automation: ${input.automationName}`,
    `Hook: ${input.hook}`,
    `Tone: ${input.tone}`,
    `Style: ${input.style}`,
    "Metadata requirements:",
    ...socialPostMetadataPromptLines("slideshow"),
    "Prompt instructions:",
    input.promptInstructions,
    ...performanceMemoryLines(input.performanceMemory),
    "Hook-to-content coherence rules:",
    "- The selected Hook above is the source of truth for this one slideshow. First identify its exact subject, people/sign/product, and claim or question.",
    "- Every body slide must directly answer, explain, support, exemplify, or continue that exact hook. Reuse the hook's specific subject where needed so the connection is unmistakable.",
    "- Do not switch to a different concept, stock framework, or theme just because it appears in the automation name, style, or an example inside a content direction.",
    "- Follow each placeholder's content direction about the selected hook. If a direction specifies format (for example heading, explanation, list item), treat it as format—not as permission to change topics.",
    "- Text boxes sharing the same slide id are one unit: later text boxes must explain or support the first text box on that slide, never introduce an unrelated point.",
    "- Across body slides, create a logical progression without repeating the same point.",
    ...avoidSimilarOutputLines(input.avoidSimilarOutputs),
    ...strictOutputRuleLines(input.style),
    "Placeholders:",
    ...placeholderLines,
  ].join("\n")
}

function performanceMemoryLines(
  memory: TempSlidePromptInput["performanceMemory"]
) {
  const proven = (memory?.provenPatterns ?? []).map(clean).filter(Boolean)
  const avoid = (memory?.avoidPatterns ?? []).map(clean).filter(Boolean)
  if (proven.length === 0 && avoid.length === 0) return []
  return [
    "Performance memory from prior scored posts:",
    ...proven.map((value) => `- Proven: ${value}`),
    ...avoid.map((value) => `- Avoid: ${value}`),
    "Use this only as strategic guidance; the selected hook and field directions still control the topic.",
  ]
}

export function styleRequestsLowercase(style: string | undefined) {
  return /lower\s*case|all\s*lowercase/i.test(style ?? "")
}

function strictOutputRuleLines(style: string | undefined) {
  const lines = [
    "Strict output rules:",
    "- Fill EVERY field. Never return an empty string for title, caption, hashtags, or any placeholder.",
    "- Keep each placeholder within the exact word range stated for it; count words before answering.",
    "- hashtags must be a JSON array of 3-5 tags, each starting with '#' (e.g. ['#focus', '#wellness', '#mindset']).",
  ]
  if (styleRequestsLowercase(style)) {
    lines.push(
      "- Write EVERY value — title, caption, hashtags, and all slide text — in all lowercase with no capital letters anywhere."
    )
  }
  return lines
}

function avoidSimilarOutputLines(outputs: string[] | undefined) {
  const values = (outputs ?? []).map(clean).filter(Boolean).slice(0, 5)
  if (values.length === 0) {
    return []
  }
  return [
    "Avoid making the title, caption, or body slide text substantially similar to these prior outputs:",
    ...values.map((value) => `- ${value}`),
  ]
}

export function promptPreviewHook(automation: TempSlideTestingAutomation) {
  return (
    automation.hooks.map(clean).find(Boolean) ??
    "Create a high-performing TikTok slideshow."
  )
}

/**
 * A hook like "3 things a Gemini will never tell you" promises exactly N body
 * slides. Returns that leading count (1-10) so the plan can size content
 * slides to match, or null when the hook makes no numeric promise. Numbers
 * that are not at the start (e.g. "Demon each zodiac sign part 3") are
 * labels, not counts, and are ignored.
 */
export function hookImpliedSlideCount(hook: string): number | null {
  const match = clean(hook).match(/^(\d{1,2})\s+[a-zA-Z]/)
  if (!match) {
    return null
  }
  const count = Number(match[1])
  return count >= 1 && count <= 10 ? count : null
}

export function automationTemplateToTempSlideTestingAutomation(
  record: AutomationTemplateRecord
): TempSlideTestingAutomation {
  return {
    ...automationSchemaToTempSlideTestingAutomation(
      automationTemplateSchemaToRuntime(record),
      { id: record.id, name: record.name }
    ),
    name: record.name,
    theme: record.theme,
  }
}

export function automationSchemaToTempSlideTestingAutomation(
  schema: AutomationSchema,
  metadata: { id: string; name: string } = {
    id: "main-app-automation",
    name: "Automation",
  }
): TempSlideTestingAutomation {
  const hook = automationFormatSection(schema, "hook")
  const content = automationFormatSection(schema, "content")
  const cta = automationFormatSection(schema, "cta")
  const ctaEnabled =
    cta.slideCount > 0 || schema.image_collection_ids.cta_slide.check

  return {
    id: metadata.id,
    name: metadata.name,
    theme: "automation",
    hooks: automationHooks(schema),
    tone: automationTone(schema),
    style:
      schema.prompt_formatting.style ||
      "Use the automation's native slideshow style.",
    imageCollectionIds: {
      hook: automationCollectionId(schema, "hook"),
      content: automationCollectionId(schema, "content"),
      cta: automationCollectionId(schema, "cta"),
    },
    slides: [
      buildAutomationSlideSpec({
        section: "hook",
        index: 0,
        title: "Hook",
        collectionId: automationCollectionId(schema, "hook"),
        formatSection: hook,
      }),
      ...Array.from({ length: Math.max(1, content.slideCount) }, (_, index) =>
        buildAutomationSlideSpec({
          section: "content",
          index: index + 1,
          title: `Content ${index + 1}`,
          collectionId:
            content.imageOverrides?.find(
              (override) => override.slideIndex === index + 1
            )?.collectionId || automationCollectionId(schema, "content"),
          formatSection: contentSectionForSlide(content, index + 1),
        })
      ),
      ...(ctaEnabled
        ? Array.from({ length: Math.max(1, cta.slideCount || 1) }, (_, index) =>
            buildAutomationSlideSpec({
              section: "cta",
              index: Math.max(1, content.slideCount) + index + 1,
              title: `CTA ${index + 1}`,
              collectionId: automationCollectionId(schema, "cta"),
              formatSection: cta,
            })
          )
        : []),
    ],
  }
}

function contentSectionForSlide(
  section: AutomationFormatSection,
  slideIndex: number
): AutomationFormatSection {
  const direction = clean(
    section.slideOverrides?.find(
      (override) => override.slideIndex === slideIndex
    )?.contentDirection
  )
  if (!direction) return section
  const textItems = section.textItems.length
    ? section.textItems.map((item, index) =>
        index === 0 ? { ...item, contentDirection: direction } : item
      )
    : section.textItems
  return { ...section, textItems }
}

export function storedCollectionsToTempSlideCollections(
  collections: StoredImageCollection[]
) {
  return collections.map((collection): TempSlideImageCollection => {
    const normalized = storedToCollection(collection)
    return {
      id: normalized.id,
      aliases: collectionAliases(normalized),
      title: normalized.title,
      images: normalized.images.map((image, index) => ({
        id: image.id || `${normalized.id}-${index}`,
        imageUrl: image.imageUrl,
        description: image.description ?? image.title ?? "",
      })),
    }
  })
}

export function buildTempSlideStructuredOutputSchema(
  placeholders: TempSlideTextPlaceholder[]
) {
  const promptPlaceholders = placeholders.filter(
    (placeholder) => placeholder.textMode === "prompt"
  )
  const properties = Object.fromEntries(
    promptPlaceholders.map((placeholder) => [
      placeholder.id,
      {
        type: "string",
        minLength: 1,
        description: placeholderDescription(placeholder),
      },
    ])
  )

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      ...socialPostMetadataSchemaProperties("slideshow"),
      text: {
        type: "object",
        additionalProperties: false,
        properties,
        required: promptPlaceholders.map((placeholder) => placeholder.id),
      },
    },
    required: ["title", "caption", "hashtags", "text"],
  }
}

export function getTempSlidePromptPlaceholders(
  automation: TempSlideTestingAutomation
) {
  return automation.slides.flatMap((slide) =>
    slide.displayText
      ? slide.textItems.filter(
          (textItem) =>
            textItem.textMode === "prompt" && textItem.section !== "hook"
        )
      : []
  )
}

export function normalizeTempSlideStructuredOutput(
  output: unknown,
  placeholders: TempSlideTextPlaceholder[],
  options: { lowercase?: boolean } = {}
): TempSlideStructuredOutput {
  const textRecord =
    isRecord(output) && isRecord(output.text) ? output.text : {}
  const maybeLower = (value: string) =>
    options.lowercase ? value.toLowerCase() : value
  const metadata = normalizeSocialPostMetadata(output, options)
  return {
    title: metadata.title,
    caption: metadata.caption,
    hashtags: metadata.hashtags.join(" "),
    text: Object.fromEntries(
      placeholders.map((placeholder) => [
        placeholder.id,
        maybeLower(
          clean(
            typeof textRecord[placeholder.id] === "string"
              ? textRecord[placeholder.id]
              : ""
          )
        ),
      ])
    ),
  }
}

function buildAutomationSlideSpec(input: {
  section: TempSlideSectionId
  index: number
  title: string
  collectionId: string
  formatSection: AutomationFormatSection
}): TempSlideSpec {
  const slideId = `${input.section}-${input.index + 1}`

  return {
    id: slideId,
    index: input.index,
    section: input.section,
    title: input.title,
    aspectRatio: input.formatSection.aspect_ratio,
    imageGrid: input.formatSection.imageGrid,
    overlay: input.formatSection.overlay,
    aiImageSelection: input.formatSection.aiImageSelection === true,
    displayText: !input.formatSection.noText,
    collectionId: input.collectionId,
    overlayImage: input.formatSection.overlayImage?.enabled
      ? {
          enabled: true,
          collectionId: clean(input.formatSection.overlayImage.collectionId),
          height: input.formatSection.overlayImage.padding,
        }
      : undefined,
    textItems: input.formatSection.textItems.map((textItem, index) =>
      automationTextItemToPlaceholder({
        textItem,
        slideId,
        section: input.section,
        index,
      })
    ),
  }
}

function automationTextItemToPlaceholder(input: {
  textItem: AutomationTextItem
  slideId: string
  section: TempSlideSectionId
  index: number
}): TempSlideTextPlaceholder {
  return {
    id: `${input.slideId}__${input.textItem.id || `text-${input.index}`}`,
    itemId: input.textItem.id || `text-${input.index}`,
    section: input.section,
    slideId: input.slideId,
    label: `${input.section} text ${input.index + 1}`,
    contentDirection: clean(
      input.textItem.contentDirection || input.textItem.text
    ),
    wordLengthMin: input.textItem.wordLengthMin,
    wordLengthMax: input.textItem.wordLengthMax,
    textMode: input.textItem.textMode,
    staticText: clean(input.textItem.staticText),
    font: input.textItem.font,
    fontSize: input.textItem.fontSize,
    textStyle: input.textItem.textStyle,
    textPosition: input.textItem.textPosition,
    textItemWidth: input.textItem.textItemWidth,
    textAlign: input.textItem.textAlign,
    textAnchor: input.textItem.textAnchor,
    textVerticalAnchor: input.textItem.textVerticalAnchor ?? "padded",
  }
}

function placeholderDescription(placeholder: TempSlideTextPlaceholder) {
  return `${placeholder.label}. ${placeholderRequirement(placeholder)}.`
}

function placeholderRequirement(placeholder: TempSlideTextPlaceholder) {
  const direction =
    placeholder.contentDirection || "Fill this slideshow text box."
  const normalizedDirection = direction.trim().replace(/[.。]+$/, "")
  const wordRange = `${placeholder.wordLengthMin}-${placeholder.wordLengthMax} words`
  return mentionsWordRange(normalizedDirection)
    ? normalizedDirection
    : `${normalizedDirection}. ${wordRange}`
}

function mentionsWordRange(value: string) {
  return /\b\d+\s*[-–—+]\s*\d*\s*words?\b/i.test(value)
}
