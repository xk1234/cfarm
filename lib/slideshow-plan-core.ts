import { createHash } from "node:crypto"

import { clean } from "@/lib/guards"
import { applyResolvedHookCase } from "@/lib/hook-casing"
import type { SlideshowTextItem } from "@/lib/slideshow-renderer"

type HookItem = {
  id: string
  text: string
  enabled: boolean
  bodySlideCount?: number
  tone?: string
  contentDirection?: string
  content?: string
  source?: {
    provider: string
    projectId?: string
    projectTitle?: string
    hookId?: string
    scriptId?: string
    importedAt?: string
  }
  createdAt?: string
  updatedAt?: string
}

type TextItem = Record<string, unknown> & {
  id?: string
  itemId?: string
  textMode?: string
  staticText?: string
  textPosition?: string
  textAlign?: string
  textAnchor?: string
  textVerticalAnchor?: string
  textItemWidth?: string
  fontSize?: string
  textStyle?: string
  font?: string
  positionX?: number
  positionY?: number
  fontWeight?: number
  backgroundMode?: string
  backgroundRadius?: number
}

type FormatSection = Record<string, unknown> & {
  id?: string
  aspect_ratio?: string
  imageGrid?: string
  overlay?: boolean
  aiImageSelection?: boolean
  noText?: boolean
  slideCount?: number
  slideCountMode?: string
  slideCountMin?: number
  slideCountMax?: number
  slideOverrides?: Array<{
    slideIndex?: number
    contentDirection?: string
  }>
  imageOverrides?: Array<{ slideIndex?: number; collectionId?: string }>
  overlayImage?: {
    enabled?: boolean
    collectionId?: string
    padding?: number
  }
  textItems?: TextItem[]
}

type PlanSchema = {
  hooks?: unknown
  formatting?: FormatSection[]
  aspect_ratio?: string
  font?: string
  prompt_formatting?: { style?: string }
  image_collection_ids?: {
    all_slides?: string
    first_slide?: { collection?: string }
    cta_slide?: { check?: boolean; cta_collection_id?: string }
  }
  tiktok_post_settings?: {
    caption?: PostTextSetting
    description?: PostTextSetting
  }
}

type PostTextSetting = {
  mode?: string
  static_text?: string
  prompt_text?: string
  resolution?: "generated" | "hook"
}

export function slideshowRunId(automationId: string, scheduledFor: string) {
  return `arun${createHash("sha256")
    .update(`${automationId}:${scheduledFor}`)
    .digest("hex")
    .slice(0, 32)}`
}

export function automationHooks(schema: Pick<PlanSchema, "hooks">) {
  return automationHookItems(schema)
    .filter((item) => item.enabled)
    .map((item) => item.text)
}

export function automationHookItems(
  schema: Pick<PlanSchema, "hooks">
): HookItem[] {
  const source = Array.isArray(schema.hooks) ? schema.hooks : []
  const seen = new Set<string>()
  return source.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return []
    const item = raw as Record<string, unknown>
    const text = clean(item.text)
    if (!text || isHookInstruction(text)) return []
    const normalized = text.toLowerCase().replace(/\s+/g, " ")
    if (seen.has(normalized)) return []
    seen.add(normalized)
    return [
      {
        id: clean(item.id) || hookId(text),
        text,
        enabled: item.enabled !== false,
        ...(validBodySlideCount(item.bodySlideCount) !== undefined
          ? { bodySlideCount: validBodySlideCount(item.bodySlideCount) }
          : {}),
        ...(clean(item.tone) ? { tone: clean(item.tone) } : {}),
        ...(clean(item.contentDirection)
          ? { contentDirection: clean(item.contentDirection).slice(0, 5_000) }
          : {}),
        ...(clean(item.content)
          ? { content: clean(item.content).slice(0, 20_000) }
          : {}),
        ...(normalizeHookSource(item.source)
          ? { source: normalizeHookSource(item.source) }
          : {}),
        createdAt: clean(item.createdAt) || new Date(0).toISOString(),
        ...(clean(item.updatedAt) ? { updatedAt: clean(item.updatedAt) } : {}),
      },
    ]
  })
}

function normalizeHookSource(value: unknown): HookItem["source"] | undefined {
  if (!value || typeof value !== "object") return undefined
  const source = value as Record<string, unknown>
  const provider = clean(source.provider)
  if (!provider) return undefined
  return {
    provider,
    ...(clean(source.projectId) ? { projectId: clean(source.projectId) } : {}),
    ...(clean(source.projectTitle)
      ? { projectTitle: clean(source.projectTitle) }
      : {}),
    ...(clean(source.hookId) ? { hookId: clean(source.hookId) } : {}),
    ...(clean(source.scriptId) ? { scriptId: clean(source.scriptId) } : {}),
    ...(clean(source.importedAt)
      ? { importedAt: clean(source.importedAt) }
      : {}),
  }
}

function validBodySlideCount(value: unknown) {
  const count = Number(value)
  return Number.isInteger(count) && count >= 1 && count <= 100
    ? count
    : undefined
}

export function slideshowMetadataPromptInstructions(schema: PlanSchema) {
  const caption = schema.tiktok_post_settings?.caption
  const hashtags = schema.tiktok_post_settings?.description
  return [
    postTextPromptLine("Caption", caption),
    postTextPromptLine("Hashtags", hashtags),
  ]
    .filter(Boolean)
    .join("\n")
}

export function slideshowStructurePromptInstructions(schema: PlanSchema) {
  const style = clean(schema.prompt_formatting?.style)
  return style
    ? `Structural style rules (govern organization and format only; Tone still controls register, diction, rhythm, and casing):\n${style}`
    : ""
}

export function resolveSlideshowCaption(input: {
  setting?: PostTextSetting
  generated: string
  hook: string
}) {
  const setting = input.setting
  if (setting?.mode === "static") {
    return clean(setting.static_text) || clean(input.generated)
  }
  const prompt = clean(setting?.prompt_text)
  let caption = captionUsesHook(setting)
    ? clean(input.hook)
    : clean(input.generated)
  if (/lower\s*case|all\s*lowercase/i.test(prompt)) {
    caption = caption.toLowerCase()
  }
  return caption
}

export function resolveSlideshowHashtags(input: {
  setting?: PostTextSetting
  generated: string
}) {
  return input.setting?.mode === "static"
    ? clean(input.setting.static_text) || clean(input.generated)
    : clean(input.generated)
}

function postTextPromptLine(label: string, setting?: PostTextSetting) {
  if (!setting) return ""
  const value =
    setting.mode === "static"
      ? clean(setting.static_text)
      : clean(setting.prompt_text)
  if (
    label === "Caption" &&
    setting.mode !== "static" &&
    captionUsesHook(setting)
  ) {
    return "Caption requirement: return exactly the selected Hook text above; this policy is also enforced deterministically after generation."
  }
  if (!value) return ""
  return setting.mode === "static"
    ? `${label} requirement: return exactly ${JSON.stringify(value)}.`
    : `${label} requirement: ${value}`
}

export function captionUsesHook(setting?: PostTextSetting) {
  return (
    setting?.resolution === "hook" ||
    /same exact text as (?:the )?(?:first text item|hook)/i.test(
      clean(setting?.prompt_text)
    )
  )
}

export function isHookInstruction(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return true
  if (
    [
      "hook text",
      "hook text, all lowercase",
      "fixed hook text from the automation",
      "create a concise slideshow narrative for the selected topic.",
    ].includes(normalized)
  ) {
    return true
  }
  return (
    normalized.startsWith("hook text") ||
    [
      "lowercase numbered list introduction",
      "numbered list concept introduction",
      "numbered heading",
    ].some((marker) => normalized.startsWith(marker)) ||
    normalized.includes("using narratives") ||
    normalized.includes("content varies based on narrative") ||
    normalized.includes("e.g.")
  )
}

export function applyHookCase(
  text: string,
  promptFormatting?: { hook_case?: string; style?: string }
) {
  return applyResolvedHookCase(
    clean(text),
    promptFormatting?.hook_case === "lowercase" ||
      promptFormatting?.hook_case === "uppercase" ||
      promptFormatting?.hook_case === "title" ||
      promptFormatting?.hook_case === "sentence"
      ? promptFormatting.hook_case
      : "mixed"
  )
}

export function slideSpecs(
  schema: PlanSchema,
  hook: string,
  bodySlideCount: number
) {
  const hookSection = formatSection(schema, "hook")
  const content = formatSection(schema, "content")
  const cta = formatSection(schema, "cta")
  const hookCount = Math.max(0, Math.round(Number(hookSection.slideCount) || 0))
  const configuredContentCount = Math.max(
    0,
    Math.round(Number(bodySlideCount) || Number(content.slideCount) || 0)
  )
  const contentCount = configuredContentCount
  const ctaCount =
    Number(cta.slideCount) > 0 || schema.image_collection_ids?.cta_slide?.check
      ? Math.max(1, Number(cta.slideCount) || 1)
      : 0
  return [
    ...Array.from({ length: hookCount }, (_, index) =>
      specForSection(schema, hookSection, "hook", index)
    ),
    ...Array.from({ length: contentCount }, (_, index) => {
      const override = content.slideOverrides?.find(
        (item) => Number(item.slideIndex) === index + 1
      )
      const imageOverride = content.imageOverrides?.find(
        (item) => Number(item.slideIndex) === index + 1
      )
      return specForSection(
        schema,
        {
          ...content,
          ...(override
            ? {
                textItems: (content.textItems ?? []).map((item, itemIndex) =>
                  itemIndex === 0
                    ? { ...item, contentDirection: override.contentDirection }
                    : item
                ),
              }
            : {}),
        },
        "content",
        hookCount + index,
        imageOverride?.collectionId
      )
    }),
    ...Array.from({ length: ctaCount }, (_, index) =>
      specForSection(schema, cta, "cta", hookCount + contentCount + index)
    ),
  ]
}

export function selectedBodySlideCount(schema: PlanSchema, seedValue: number) {
  void seedValue
  const content = formatSection(schema, "content")
  return Math.max(0, Math.round(Number(content.slideCount) || 0))
}

export function specForSection(
  schema: PlanSchema,
  section: FormatSection,
  role: "hook" | "content" | "cta",
  index: number,
  collectionOverride?: string
) {
  const slideId = `${role}-${index + 1}`
  return {
    id: slideId,
    section: role,
    index,
    collectionId:
      clean(collectionOverride) || automationCollectionId(schema, role),
    aspectRatio: section.aspect_ratio || schema.aspect_ratio || "9:16",
    imageGrid: section.imageGrid || "none",
    overlay: section.overlay === true,
    aiImageSelection: section.aiImageSelection === true,
    displayText: !section.noText,
    overlayImage: section.overlayImage?.enabled
      ? {
          collectionId: clean(section.overlayImage.collectionId),
          padding: Math.max(0, Number(section.overlayImage.padding) || 0),
        }
      : undefined,
    textItems: (section.textItems ?? []).map((item, itemIndex) => ({
      ...item,
      id: `${slideId}__${item.id || `text-${itemIndex}`}`,
      itemId: item.id || `text-${itemIndex}`,
      slideId,
      section: role,
    })),
  }
}

export function textItemsForSpec(input: {
  spec: ReturnType<typeof specForSection>
  hook: string
  generated: { text?: Record<string, unknown> }
  schema: PlanSchema
}) {
  const { spec, hook, generated, schema } = input
  if (!spec.displayText) return []
  if (spec.section === "hook") {
    const hookItems: TextItem[] = spec.textItems.length ? spec.textItems : [{}]
    return hookItems.map((item, index) =>
      slideshowTextItem(
        item,
        index === 0
          ? hook
          : item.textMode === "static"
            ? clean(item.staticText) || hook
            : clean(item.id ? generated.text?.[item.id] : "") || hook,
        schema,
        spec.section
      )
    )
  }
  if (!spec.textItems.length) {
    throw new Error(`${spec.id} displays text but has no configured text items`)
  }
  return spec.textItems.map((item) => {
    const text =
      item.textMode === "static"
        ? clean(item.staticText)
        : clean(generated.text?.[item.id])
    if (!text) {
      throw new Error(
        `${item.textMode === "static" ? "Static" : "Generated"} text is missing for ${item.id}`
      )
    }
    return slideshowTextItem(item, text, schema, spec.section)
  })
}

export function slideshowTextItem(
  item: TextItem,
  text: string,
  schema: Pick<PlanSchema, "font">,
  role: "hook" | "content" | "cta"
): SlideshowTextItem {
  const placement =
    item.textPosition === "bottom" || item.textPosition === "center"
      ? item.textPosition
      : "top"
  const textAlign =
    item.textAlign === "left" || item.textAlign === "right"
      ? item.textAlign
      : "center"
  const textAnchor = item.textAnchor || "padded"
  const y = placement === "bottom" ? 82 : placement === "center" ? 45 : 16
  const positionX = numericPercent(item.positionX)
  const positionY = numericPercent(item.positionY)
  return {
    id:
      clean(item.itemId) ||
      clean(item.id) ||
      `text-${hash(`${role}:${text}`, 12)}`,
    text,
    fontSize: item.fontSize || "10px",
    textSize: {
      width: textWidth(item.textItemWidth, text),
      height: 18,
    },
    textStyle: item.textStyle || "outline",
    textAlign,
    textAnchor,
    textVerticalAnchor: item.textVerticalAnchor || "padded",
    textPlacement:
      positionX === undefined || positionY === undefined
        ? placement
        : undefined,
    textPosition: {
      x: positionX ?? textPositionX(textAlign, textAnchor),
      y: positionY ?? (role === "hook" && placement === "center" ? 45 : y),
    },
    font: item.font || schema.font,
    fontWeight: numericValue(item.fontWeight, 800),
    backgroundMode: item.backgroundMode === "block" ? "block" : "line",
    backgroundRadius: numericValue(item.backgroundRadius, 6),
  }
}

function numericPercent(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, number))
    : undefined
}

function numericValue(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function automationFormatSection(
  schema: PlanSchema,
  role: "hook" | "content" | "cta"
) {
  const id = role === "content" ? "body" : role
  const section = (schema.formatting ?? []).find((item) => item.id === id)
  if (!section) {
    throw new Error(
      `The automation database record is missing ${id} formatting`
    )
  }
  return section
}

const formatSection = automationFormatSection

function automationCollectionId(
  schema: PlanSchema,
  role: "hook" | "content" | "cta"
) {
  if (role === "hook") {
    return clean(schema.image_collection_ids?.first_slide?.collection)
  }
  if (role === "cta") {
    return clean(
      schema.image_collection_ids?.cta_slide?.cta_collection_id ||
        schema.image_collection_ids?.all_slides
    )
  }
  return clean(schema.image_collection_ids?.all_slides)
}

function textPositionX(textAlign: string, textAnchor: string) {
  const flush = textAnchor === "flush"
  if (textAlign === "left") return flush ? 1.5 : 10
  if (textAlign === "right") return flush ? 98.5 : 90
  return 50
}

function textWidth(value: unknown, text: string) {
  const parsed = Number(clean(value).replace("%", ""))
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : Math.max(20, Math.min(100, text.length * 4))
}

function hookId(text: string) {
  return `hook_${hash(text.toLowerCase().replace(/\s+/g, " "), 10)}`
}

function hash(value: string, length: number) {
  return createHash("sha256").update(value).digest("hex").slice(0, length)
}
