import { clean, isRecord } from "@/lib/guards"
import type {
  AutomationTemplateFormat,
  AutomationTemplateRecord,
  AutomationTemplateTextItem,
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
    "- title: write an AI-generated title for the slideshow, 3-8 words, specific to the hook/topic.",
    "- caption: write a short TikTok/Instagram-style post caption for the slideshow, one sentence, specific to the hook/topic, no hashtags.",
    "- hashtags: give me 3-5 broad hashtags related to the topic/niche of the content, all lowercase, nothing else other than 3-5 hashtags.",
    "Prompt instructions:",
    input.promptInstructions,
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

export function styleRequestsLowercase(style: string | undefined) {
  return /lower\s*case|all\s*lowercase/i.test(style ?? "")
}

function strictOutputRuleLines(style: string | undefined) {
  const lines = [
    "Strict output rules:",
    "- Fill EVERY field. Never return an empty string for title, caption, hashtags, or any placeholder.",
    "- Keep each placeholder within the exact word range stated for it; count words before answering.",
    "- hashtags must be 3-5 tags, each starting with '#', separated by single spaces (e.g. '#focus #wellness #mindset').",
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

type RawImageCollectionIds = {
  first_slide?: {
    collection?: unknown
  }
  all_slides?: unknown
  cta_slide?: {
    cta_collection_id?: unknown
    check?: unknown
  }
}

export function automationTemplateToTempSlideTestingAutomation(
  record: AutomationTemplateRecord
): TempSlideTestingAutomation {
  const imageCollectionIds = parseTemplateImageCollectionIds(
    record.template.image_collection_ids
  )
  const format = record.template.format

  return {
    id: record.id,
    name: record.name,
    theme: record.theme,
    hooks: record.template.hooks,
    tone: format.tone ?? "Custom",
    style:
      format.custom_tone ||
      format.tone ||
      "Use the automation's native slideshow style.",
    imageCollectionIds,
    slides: [
      buildSlideSpec({
        section: "hook",
        index: 0,
        title: "Hook",
        collectionId: imageCollectionIds.hook,
        templateSection: format.hook,
      }),
      ...Array.from({ length: contentSlideCount(format) }, (_, index) =>
        buildSlideSpec({
          section: "content",
          index: index + 1,
          title: `Content ${index + 1}`,
          collectionId: imageCollectionIds.content,
          templateSection: format.content,
        })
      ),
      ...(format.cta.enabled ||
      parseTemplateCtaSlideCheck(record.template.image_collection_ids)
        ? [
            buildSlideSpec({
              section: "cta",
              index: contentSlideCount(format) + 1,
              title: "CTA",
              collectionId: imageCollectionIds.cta,
              templateSection: format.cta,
            }),
          ]
        : []),
    ],
  }
}

export function automationSchemaToTempSlideTestingAutomation(
  schema: AutomationSchema,
  id = "main-app-automation"
): TempSlideTestingAutomation {
  const hook = automationFormatSection(schema, "hook")
  const content = automationFormatSection(schema, "content")
  const cta = automationFormatSection(schema, "cta")
  const ctaEnabled = cta.slideCount > 0

  return {
    id,
    name: schema.title,
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
        description: placeholderDescription(placeholder),
      },
    ])
  )

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: {
        type: "string",
        description:
          "AI-generated slideshow title, 3-8 words, specific to the hook/topic.",
      },
      caption: {
        type: "string",
        description:
          "Short TikTok/Instagram-style post caption for the slideshow, one sentence, specific to the hook/topic, no hashtags.",
      },
      hashtags: {
        type: "string",
        description:
          "Give me 3-5 broad hashtags related to the topic/niche of the content, all lowercase, nothing else other than 3-5 hashtags.",
      },
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
  return {
    title: maybeLower(clean(isRecord(output) ? output.title : "")),
    caption: maybeLower(clean(isRecord(output) ? output.caption : "")),
    hashtags: normalizeHashtags(clean(isRecord(output) ? output.hashtags : "")),
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

function normalizeHashtags(value: string) {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim().toLowerCase().replace(/^#+/, ""))
    .filter((tag) => tag.length > 0)
    .map((tag) => `#${tag}`)
    .slice(0, 5)
    .join(" ")
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

function buildSlideSpec(input: {
  section: TempSlideSectionId
  index: number
  title: string
  collectionId: string
  templateSection: {
    aspect_ratio: string
    image_grid: string
    overlay: boolean
    display_text: boolean
    overlay_image?: {
      enabled: boolean
      collection_id?: string
      height: number
    }
    text_items: AutomationTemplateTextItem[]
  }
}): TempSlideSpec {
  const slideId = `${input.section}-${input.index + 1}`
  const textItems = templateSectionTextItems(input)

  return {
    id: slideId,
    index: input.index,
    section: input.section,
    title: input.title,
    aspectRatio: input.templateSection.aspect_ratio,
    imageGrid: input.templateSection.image_grid,
    overlay: input.templateSection.overlay,
    aiImageSelection: false,
    displayText: input.templateSection.display_text,
    collectionId: input.collectionId,
    overlayImage: input.templateSection.overlay_image?.enabled
      ? {
          enabled: true,
          collectionId: clean(
            input.templateSection.overlay_image.collection_id
          ),
          height: input.templateSection.overlay_image.height,
        }
      : undefined,
    textItems: textItems.map((textItem, index) =>
      templateTextItemToPlaceholder({
        textItem,
        slideId,
        section: input.section,
        index,
      })
    ),
  }
}

function templateTextItemToPlaceholder(input: {
  textItem: AutomationTemplateTextItem
  slideId: string
  section: TempSlideSectionId
  index: number
}): TempSlideTextPlaceholder {
  return {
    id: `${input.slideId}__${input.textItem.id}`,
    itemId: input.textItem.id,
    section: input.section,
    slideId: input.slideId,
    label: `${input.section} text ${input.index + 1}`,
    contentDirection: clean(input.textItem.content_direction),
    wordLengthMin: input.textItem.word_length_min,
    wordLengthMax: input.textItem.word_length_max,
    textMode: input.textItem.text_mode,
    staticText: clean(input.textItem.static_text),
    font: input.textItem.font,
    fontSize: input.textItem.font_size,
    textStyle: input.textItem.text_style,
    textPosition: input.textItem.text_position,
    textItemWidth: input.textItem.text_item_width,
    textAlign: input.textItem.text_align,
    textAnchor: input.textItem.text_anchor,
    textVerticalAnchor: "padded",
  }
}

function contentSlideCount(format: AutomationTemplateFormat) {
  const exactSlideCount = exactTotalSlideCount(format.custom_tone)
  if (exactSlideCount) {
    return Math.max(1, exactSlideCount - 1 - (format.cta.enabled ? 1 : 0))
  }

  if (format.content.slide_count_mode === "static") {
    return clampSlideCount(format.content.slide_count)
  }

  const min = clampSlideCount(format.content.slide_count_min)
  const max = clampSlideCount(format.content.slide_count_max)
  return Math.max(1, Math.round((min + max) / 2))
}

function clampSlideCount(value: unknown) {
  const numericValue =
    typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 3
  return Math.min(12, Math.max(1, numericValue))
}

function exactTotalSlideCount(style: string) {
  const match = style.match(/\bexactly\s+(\d+)\s+slides?\b/i)
  if (!match) {
    return null
  }

  return clampSlideCount(Number(match[1]))
}

function templateSectionTextItems(input: {
  section: TempSlideSectionId
  templateSection: {
    display_text: boolean
    text_items: AutomationTemplateTextItem[]
  }
}) {
  if (
    input.section === "hook" &&
    input.templateSection.display_text &&
    input.templateSection.text_items.length === 0
  ) {
    return [fallbackHookTextItem()]
  }

  return input.templateSection.text_items
}

function fallbackHookTextItem(): AutomationTemplateTextItem {
  return {
    id: "fixed-hook",
    font: "TikTok Display Medium",
    font_size: "10px",
    text_style: "background",
    text_position: "center",
    text_item_width: "60%",
    word_length_min: 5,
    word_length_max: 10,
    content_direction: "fixed hook text from the automation",
    text_mode: "prompt",
    static_text: "",
    text_align: "center",
    text_anchor: "padded",
  }
}

function parseTemplateImageCollectionIds(
  value: string
): TempSlideTestingAutomation["imageCollectionIds"] {
  const parsed = parseJsonRecord(value) as RawImageCollectionIds | null
  const content = clean(parsed?.all_slides)
  const hook = clean(parsed?.first_slide?.collection) || content
  const cta = clean(parsed?.cta_slide?.cta_collection_id) || content || hook

  return {
    hook,
    content,
    cta,
  }
}

function parseTemplateCtaSlideCheck(value: string): boolean {
  const parsed = parseJsonRecord(value) as RawImageCollectionIds | null
  return parsed?.cta_slide?.check === true
}

function parseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
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
