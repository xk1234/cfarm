import { createHash } from "node:crypto"

import { clean } from "@/lib/guards"
import { applyResolvedHookCase } from "@/lib/hook-casing"
import { styleRequestsLowercase } from "@/lib/temp-slide-testing-shared"

type HookItem = {
  id: string
  text: string
  enabled: boolean
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
  image_collection_ids?: {
    all_slides?: string
    first_slide?: { collection?: string }
    cta_slide?: { check?: boolean; cta_collection_id?: string }
  }
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
        createdAt: clean(item.createdAt) || new Date(0).toISOString(),
        ...(clean(item.updatedAt) ? { updatedAt: clean(item.updatedAt) } : {}),
      },
    ]
  })
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
  const cased = applyResolvedHookCase(
    clean(text),
    promptFormatting?.hook_case === "lowercase" ||
      promptFormatting?.hook_case === "uppercase" ||
      promptFormatting?.hook_case === "title" ||
      promptFormatting?.hook_case === "sentence"
      ? promptFormatting.hook_case
      : "mixed"
  )
  return styleRequestsLowercase(promptFormatting?.style)
    ? cased.toLowerCase()
    : cased
}

export function slideSpecs(
  schema: PlanSchema,
  hook: string,
  bodySlideCount: number
) {
  const hookSection = formatSection(schema, "hook")
  const content = formatSection(schema, "content")
  const cta = formatSection(schema, "cta")
  const implied = Number(clean(hook).match(/^(\d{1,2})\s+[a-z]/i)?.[1])
  const contentCount =
    implied >= 1 && implied <= 10
      ? implied
      : Math.max(1, bodySlideCount || content.slideCount || 1)
  const ctaCount =
    Number(cta.slideCount) > 0 || schema.image_collection_ids?.cta_slide?.check
      ? Math.max(1, Number(cta.slideCount) || 1)
      : 0
  return [
    specForSection(schema, hookSection, "hook", 0),
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
        index + 1,
        imageOverride?.collectionId
      )
    }),
    ...Array.from({ length: ctaCount }, (_, index) =>
      specForSection(schema, cta, "cta", contentCount + index + 1)
    ),
  ]
}

export function selectedBodySlideCount(schema: PlanSchema, seedValue: number) {
  const content = formatSection(schema, "content")
  if (content.slideCountMode !== "varying") {
    return Math.max(1, Number(content.slideCount) || 1)
  }
  const min = Math.max(
    1,
    Math.round(Number(content.slideCountMin) || Number(content.slideCount) || 1)
  )
  const max = Math.max(
    min,
    Math.round(
      Number(content.slideCountMax) || Number(content.slideCount) || min
    )
  )
  return min + (Number(seedValue) % (max - min + 1))
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
    return [
      slideshowTextItem(spec.textItems[0] || {}, hook, schema, spec.section),
    ]
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
) {
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
    textPlacement: placement,
    textPosition: {
      x: textPositionX(textAlign, textAnchor),
      y: role === "hook" && placement === "center" ? 45 : y,
    },
    font: item.font || schema.font,
  }
}

function formatSection(schema: PlanSchema, role: "hook" | "content" | "cta") {
  const id = role === "content" ? "body" : role
  const section = (schema.formatting ?? []).find((item) => item.id === id)
  if (!section) {
    throw new Error(
      `The automation database record is missing ${id} formatting`
    )
  }
  return section
}

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
