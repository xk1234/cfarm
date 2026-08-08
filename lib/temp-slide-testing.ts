import { clean, isRecord } from "@/lib/guards"
import {
  automationTemplateSchemaToRuntime,
  type AutomationTemplateRecord,
} from "@/lib/automation-templates"
import type { StoredImageCollection } from "@/lib/image-collections"
import {
  collectionAliases,
  legacyStoredCollectionId,
  storedToCollection,
} from "@/lib/realfarm-collections"
import {
  automationCollectionId,
  automationFormatSection,
  automationHooks,
  automationSlideDesigns,
  automationTone,
  type AutomationSlideDesign,
  type AutomationFormatSection,
  type AutomationSchema,
  type TextItem,
} from "@/lib/realfarm-automation"
import {
  type TempSlideImageCollection,
  type TempSlideSectionId,
  type TempSlideSpec,
  type TempSlideTestingAutomation,
  type TempSlideTextPlaceholder,
} from "@/lib/temp-slide-testing-shared"

export * from "@/lib/temp-slide-testing-shared"
export {
  selectedBodySlideCount,
  slideSpecs,
  slideshowTextItem,
  specForSection,
  textItemsForSpec,
} from "@/lib/slideshow-plan-core"

export function automationTemplateToTempSlideTestingAutomation(
  record: AutomationTemplateRecord
): TempSlideTestingAutomation {
  const legacyTemplate = legacyTemplateInput(record)
  if (legacyTemplate) {
    const imageCollectionIds = parseTemplateImageCollectionIds(
      legacyTemplate.image_collection_ids
    )
    const format = legacyTemplate.format
    const contentCount = contentSlideCount(format)
    return {
      id: record.id,
      name: record.name,
      theme: record.theme,
      hooks: legacyTemplate.hooks,
      tone:
        clean(format.custom_tone) ||
        clean(format.tone) ||
        "Conversational & Relatable",
      imageCollectionIds,
      slides: [
        buildLegacySlideSpec({
          section: "hook",
          index: 0,
          title: "Hook",
          collectionId: imageCollectionIds.hook,
          templateSection: format.hook,
        }),
        ...Array.from({ length: contentCount }, (_, index) =>
          buildLegacySlideSpec({
            section: "content",
            index: index + 1,
            title: `Content ${index + 1}`,
            collectionId: imageCollectionIds.content,
            templateSection: format.content,
          })
        ),
        ...(format.cta.enabled ||
        parseTemplateCtaSlideCheck(legacyTemplate.image_collection_ids)
          ? [
              buildLegacySlideSpec({
                section: "cta",
                index: contentCount + 1,
                title: "CTA",
                collectionId: imageCollectionIds.cta,
                templateSection: format.cta,
              }),
            ]
          : []),
      ],
    }
  }
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
  metadata: {
    id: string
    name: string
    slidePlan?: Array<{ designId: string; purpose?: string }>
  } = {
    id: "main-app-automation",
    name: "Automation",
  }
): TempSlideTestingAutomation {
  const designs = automationSlideDesigns(schema)
  if (designs.length > 0) {
    const byId = new Map(designs.map((design) => [design.id, design]))
    const planned = (
      metadata.slidePlan?.length
        ? metadata.slidePlan
        : designs.map((design) => ({ designId: design.id, purpose: "" }))
    ).flatMap((item) => {
      const design = byId.get(item.designId)
      return design ? [{ design, purpose: clean(item.purpose) }] : []
    })
    const slides = (
      planned.length > 0
        ? planned
        : designs.map((design) => ({ design, purpose: "" }))
    ).map(({ design, purpose }, index) =>
      buildAutomationSlideSpec({
        section: "content",
        index,
        title: design.name || `Slide ${index + 1}`,
        collectionId: design.collectionId,
        formatSection: slideDesignFormatSection(design, purpose),
      })
    )
    return {
      id: metadata.id,
      name: metadata.name,
      theme: "automation",
      hooks: automationHooks(schema),
      tone: automationTone(schema),
      imageCollectionIds: {
        hook: designs[0]?.collectionId ?? "",
        content: designs[0]?.collectionId ?? "",
        cta: designs.at(-1)?.collectionId ?? "",
      },
      slides,
    }
  }

  const hook = automationFormatSection(schema, "hook")
  const content = automationFormatSection(schema, "content")
  const cta = automationFormatSection(schema, "cta")
  const hookCount = Math.max(0, Math.round(hook.slideCount))
  const contentCount = Math.max(0, Math.round(content.slideCount))
  const ctaEnabled =
    cta.slideCount > 0 || schema.image_collection_ids.cta_slide.check
  const ctaCount = ctaEnabled ? Math.max(1, Math.round(cta.slideCount || 1)) : 0

  return {
    id: metadata.id,
    name: metadata.name,
    theme: "automation",
    hooks: automationHooks(schema),
    tone: automationTone(schema),
    imageCollectionIds: {
      hook: automationCollectionId(schema, "hook"),
      content: automationCollectionId(schema, "content"),
      cta: automationCollectionId(schema, "cta"),
    },
    slides: [
      ...Array.from({ length: hookCount }, (_, index) =>
        buildAutomationSlideSpec({
          section: "hook",
          index,
          title: hookCount === 1 ? "Hook" : `Hook ${index + 1}`,
          collectionId: automationCollectionId(schema, "hook"),
          formatSection: hook,
        })
      ),
      ...Array.from({ length: contentCount }, (_, index) =>
        buildAutomationSlideSpec({
          section: "content",
          index: hookCount + index,
          title: `Content ${index + 1}`,
          collectionId:
            content.imageOverrides?.find(
              (override) => override.slideIndex === index + 1
            )?.collectionId || automationCollectionId(schema, "content"),
          formatSection: contentSectionForSlide(content, index + 1),
        })
      ),
      ...(ctaCount
        ? Array.from({ length: ctaCount }, (_, index) =>
            buildAutomationSlideSpec({
              section: "cta",
              index: hookCount + contentCount + index,
              title: `CTA ${index + 1}`,
              collectionId: automationCollectionId(schema, "cta"),
              formatSection: cta,
            })
          )
        : []),
    ],
  }
}

function slideDesignFormatSection(
  design: AutomationSlideDesign,
  purpose: string
): AutomationFormatSection {
  return {
    ...design,
    id: "body",
    slideCount: 1,
    textItems: design.textItems.map((item) => ({
      ...item,
      contentDirection: [
        purpose ? `Purpose for this slide: ${purpose}.` : "",
        item.contentDirection,
      ]
        .filter(Boolean)
        .join(" "),
    })),
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
    const id = legacyStoredCollectionId(collection)
    return {
      id,
      aliases: [
        id,
        ...collectionAliases(normalized).filter(
          (alias) => alias !== id && alias !== normalized.id
        ),
      ],
      title: normalized.title,
      images: normalized.images.map((image, index) => ({
        id: image.id || `${normalized.id}-${index}`,
        imageUrl: image.imageUrl,
        description: image.description ?? image.title ?? "",
      })),
    }
  })
}

type LegacyTemplateTextItemInput = {
  id: string
  font: string
  font_size: string
  text_style: string
  text_position: string
  text_item_width: string
  word_length_min: number
  word_length_max: number
  content_direction: string
  text_mode: "prompt" | "static"
  static_text: string
  text_align: string
  text_anchor: string
  text_vertical_anchor?: string
}

type LegacyTemplateSectionInput = {
  aspect_ratio: string
  image_grid: string
  overlay: boolean
  display_text: boolean
  ai_image_selection?: boolean
  overlay_image?: { enabled: boolean; collection_id?: string; height: number }
  text_items: LegacyTemplateTextItemInput[]
}

type LegacyTemplateFormatInput = {
  hook: LegacyTemplateSectionInput
  content: LegacyTemplateSectionInput & {
    slide_count_mode?: string
    slide_count?: number
    slide_count_min?: number
    slide_count_max?: number
  }
  cta: LegacyTemplateSectionInput & { enabled: boolean }
  tone?: string
  custom_tone?: string
}

function legacyTemplateInput(record: AutomationTemplateRecord) {
  const raw = record as unknown as Record<string, unknown>
  if (!isRecord(raw.template)) return null
  const template = raw.template
  if (!isRecord(template.format) || !Array.isArray(template.hooks)) return null
  const format = template.format
  if (
    !isRecord(format.hook) ||
    !isRecord(format.content) ||
    !isRecord(format.cta)
  ) {
    return null
  }
  return {
    image_collection_ids: clean(template.image_collection_ids),
    hooks: template.hooks.map(clean).filter(Boolean),
    format: format as unknown as LegacyTemplateFormatInput,
  }
}

function buildLegacySlideSpec(input: {
  section: TempSlideSectionId
  index: number
  title: string
  collectionId: string
  templateSection: LegacyTemplateSectionInput
}): TempSlideSpec {
  const slideId = `${input.section}-${input.index + 1}`
  return {
    id: slideId,
    index: input.index,
    section: input.section,
    title: input.title,
    aspectRatio: input.templateSection.aspect_ratio,
    imageGrid: input.templateSection.image_grid,
    overlay: input.templateSection.overlay,
    aiImageSelection: input.templateSection.ai_image_selection === true,
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
    textItems: input.templateSection.text_items.map((textItem, index) => ({
      id: `${slideId}__${textItem.id}`,
      itemId: textItem.id,
      section: input.section,
      slideId,
      label: `${input.section} text ${index + 1}`,
      contentDirection: clean(textItem.content_direction),
      wordLengthMin: textItem.word_length_min,
      wordLengthMax: textItem.word_length_max,
      textMode: textItem.text_mode,
      staticText: clean(textItem.static_text),
      font: textItem.font,
      fontSize: textItem.font_size,
      textStyle: textItem.text_style,
      textPosition: textItem.text_position,
      textItemWidth: textItem.text_item_width,
      textAlign: textItem.text_align,
      textAnchor: textItem.text_anchor,
      textVerticalAnchor:
        textItem.text_vertical_anchor === "flush" ? "flush" : "padded",
    })),
  }
}

function contentSlideCount(format: LegacyTemplateFormatInput) {
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

function parseTemplateImageCollectionIds(
  value: string
): TempSlideTestingAutomation["imageCollectionIds"] {
  const parsed = parseJsonRecord(value)
  const firstSlide = isRecord(parsed?.first_slide) ? parsed.first_slide : null
  const ctaSlide = isRecord(parsed?.cta_slide) ? parsed.cta_slide : null
  const content = clean(parsed?.all_slides)
  const hook = clean(firstSlide?.collection) || content
  return {
    hook,
    content,
    cta: clean(ctaSlide?.cta_collection_id) || content || hook,
  }
}

function parseTemplateCtaSlideCheck(value: string) {
  const parsed = parseJsonRecord(value)
  const ctaSlide = isRecord(parsed?.cta_slide) ? parsed.cta_slide : null
  return ctaSlide?.check === true
}

function parseJsonRecord(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
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
    imageItems: input.formatSection.imageItems?.map((item) => ({ ...item })),
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
  textItem: TextItem
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
    positionX: input.textItem.positionX,
    positionY: input.textItem.positionY,
    fontWeight: input.textItem.fontWeight,
    backgroundMode: input.textItem.backgroundMode,
    backgroundRadius: input.textItem.backgroundRadius,
  }
}
