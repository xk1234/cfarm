import {
  automationCollectionId,
  automationFormatSection,
  defaultAutomationTextItem,
  updateAutomationFormatSection,
  type AutomationAspectRatio,
  type AutomationFormatSection,
  type AutomationSchema,
  type AutomationTextItem,
} from "@/lib/realfarm-automation"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import { previewTextForTextItem } from "@/lib/realfarm-preview-text"
import { splitDebateHook } from "@/lib/debate-hook"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import type {
  SlideshowSlide,
  SlideshowTextItem,
} from "@/lib/slideshow-renderer"
import { slideshowTextPositionX } from "@/lib/slideshow-renderer"
import {
  createOvalIconLayout,
  seededOvalIconRandom,
} from "@/lib/slideshow-oval-icons"

export function previewSlideshowSlide(
  item: AutomationFormatPreviewItem,
  index: number
): SlideshowSlide {
  const overlayImage =
    item.section.overlayImage?.enabled && item.overlayImages.length > 0
      ? item.overlayImages[index % item.overlayImages.length]
      : undefined
  const ovalIconLayout =
    item.section.imageGrid === "oval-icons" && item.image
      ? createOvalIconLayout({
          candidates: item.images.map((image) => ({
            key: image.id,
            imageUrl: image.imageUrl,
            imageCaption: image.description || image.title,
          })),
          focalKey: item.image.id,
          random: seededOvalIconRandom(`${item.id}:${index}`),
        })
      : undefined

  return {
    id: item.id,
    image_url: item.image?.imageUrl ?? "",
    overlayImage: overlayImage
      ? {
          image_url: overlayImage.imageUrl,
          padding: item.section.overlayImage?.padding ?? 5,
        }
      : undefined,
    overlay: item.section.overlay,
    iconLayout: ovalIconLayout
      ? {
          kind: "oval-icons",
          surrounding: ovalIconLayout.surrounding.map((icon) => ({
            image_url: icon.imageUrl,
            image_caption: icon.imageCaption,
            key: icon.key,
            x: icon.x,
            y: icon.y,
            scale: icon.scale,
            rotation: icon.rotation,
          })),
        }
      : undefined,
    textItems: previewSlideshowTextItems(item),
  }
}

// Aspect ratio + font are one-per-slideshow, not per-slide/per-item; the format
// preview derives them from the section for display.
export function previewSlideshowAspectRatio(item: AutomationFormatPreviewItem) {
  return item.section.aspect_ratio || "9:16"
}

export function previewSlideshowFont(item: AutomationFormatPreviewItem) {
  return item.textItems[0]?.font || "TikTok Display Medium"
}

export function previewSlideshowTextItems(
  item: AutomationFormatPreviewItem
): SlideshowTextItem[] {
  if (item.section.noText || !item.text) {
    return []
  }

  const debatePair = item.role === "hook" ? splitDebateHook(item.text) : null
  return item.textItems.map((textItem, index) => {
    const text =
      debatePair?.[index] || previewTextForTextItem(textItem) || item.text
    return {
      id: textItem.id || `${item.id}-text-${index}`,
      text,
      fontSize: textItem.fontSize || "10px",
      textSize: {
        width: previewTextItemWidth(textItem.textItemWidth, text),
        height: 18,
      },
      textStyle: textItem.textStyle || "outline",
      textAlign: textItem.textAlign || "center",
      textAnchor: textItem.textAnchor || "padded",
      textVerticalAnchor: textItem.textVerticalAnchor || "padded",
      textPlacement: textItem.textPosition,
      textPosition: previewTextItemPosition(textItem),
    }
  })
}

export function previewTextItemPosition(
  textItem: AutomationTextItem | undefined
) {
  const y =
    textItem?.textPosition === "bottom"
      ? 82
      : textItem?.textPosition === "center"
        ? 45
        : 16
  const x = slideshowTextPositionX(textItem?.textAlign, textItem?.textAnchor)
  return { x, y }
}

export function previewTextItemWidth(value: string | undefined, text: string) {
  const parsed = Number(value?.replace("%", ""))
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return Math.max(20, Math.min(100, text.length * 4))
}

export type AutomationFormatRole = "hook" | "content" | "cta"

export type AutomationFormatPreviewItem = {
  id: string
  role: AutomationFormatRole
  tab: "Hook" | "Content" | "CTA"
  label: string
  section: AutomationFormatSection
  image?: PinterestSearchResult
  images: PinterestSearchResult[]
  overlayImages: PinterestSearchResult[]
  text: string
  textItem: AutomationTextItem
  textItems: AutomationTextItem[]
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
}

export function clampSlideIndex(value: number) {
  return Math.max(1, Math.round(Number.isFinite(value) ? value : 1))
}

export function updateAutomationTextItemAt(
  schema: AutomationSchema,
  role: "hook" | "content" | "cta",
  index: number,
  patch: Partial<AutomationTextItem>
) {
  const section = automationFormatSection(schema, role)
  const textItems =
    section.textItems.length > 0
      ? [...section.textItems]
      : [defaultAutomationTextItem()]
  const boundedIndex = Math.max(0, Math.min(index, textItems.length - 1))
  textItems[boundedIndex] = {
    ...defaultAutomationTextItem(),
    ...textItems[boundedIndex],
    ...patch,
  }
  return updateAutomationFormatSection(schema, role, { textItems })
}

export function newAutomationTextItemAfter(
  previous: AutomationTextItem | undefined
) {
  if (!previous) {
    return defaultAutomationTextItem()
  }

  return defaultAutomationTextItem({
    fontSize: previous.fontSize,
    textStyle: previous.textStyle,
    font: previous.font,
    textPosition: previous.textPosition,
    textItemWidth: previous.textItemWidth,
    textAlign: previous.textAlign,
    textAnchor: previous.textAnchor,
    textVerticalAnchor: previous.textVerticalAnchor,
  })
}

export function previewTrackOffsetForWidths(
  widths: number[],
  activeIndex: number,
  gap: number
) {
  const boundedIndex = Math.max(0, Math.min(activeIndex, widths.length - 1))
  return (
    widths
      .slice(0, boundedIndex)
      .reduce((total, width) => total + width + gap, 0) +
    (widths[boundedIndex] ?? 0) / 2
  )
}

export function ctaEnabled(
  _config: AutomationSchema,
  section: AutomationFormatSection
) {
  return section.slideCount > 0
}

export function buildFormatPreviewItems(
  config: AutomationSchema,
  collections: CreatedImageCollection[]
): AutomationFormatPreviewItem[] {
  const hookImages = formatCollectionImages(config, collections, "hook")
  const contentImages = formatCollectionImages(config, collections, "content")
  const ctaImages = formatCollectionImages(config, collections, "cta")
  const content = automationFormatSection(config, "content")
  const cta = automationFormatSection(config, "cta")
  const contentOverlayImages = formatOverlayCollectionImages(
    content,
    collections
  )
  const ctaOverlayImages = formatOverlayCollectionImages(cta, collections)
  const contentCount = content.slideCount
  const items: AutomationFormatPreviewItem[] = [
    formatPreviewItem({
      config,
      role: "hook",
      tab: "Hook",
      label: "Hook",
      index: 0,
      images: hookImages,
      overlayImages: [],
    }),
  ]

  for (
    let index = 0;
    index < Math.max(1, Math.min(20, contentCount));
    index += 1
  ) {
    const slideImages =
      formatContentImageOverrideImages(content, collections, index + 1) ??
      contentImages
    items.push(
      formatPreviewItem({
        config,
        role: "content",
        tab: "Content",
        label: `Content ${index + 1}`,
        index,
        images: slideImages,
        overlayImages: contentOverlayImages,
      })
    )
  }

  if (ctaEnabled(config, cta)) {
    items.push(
      formatPreviewItem({
        config,
        role: "cta",
        tab: "CTA",
        label: "CTA",
        index: 0,
        images: ctaImages,
        overlayImages: ctaOverlayImages,
      })
    )
  }

  return items
}

export function formatPreviewItem({
  config,
  role,
  tab,
  label,
  index,
  images,
  overlayImages,
}: {
  config: AutomationSchema
  role: AutomationFormatRole
  tab: "Hook" | "Content" | "CTA"
  label: string
  index: number
  images: PinterestSearchResult[]
  overlayImages: PinterestSearchResult[]
}): AutomationFormatPreviewItem {
  const section = automationFormatSection(config, role)
  const textItems =
    section.textItems.length > 0
      ? section.textItems
      : [defaultAutomationTextItem()]
  const textItem =
    textItems[index % textItems.length] ?? defaultAutomationTextItem()
  const image = images[index % Math.max(1, images.length)]

  return {
    id: `${role}-${index}-${section.aspect_ratio}-${section.imageGrid}-${section.overlay}-${section.overlayImage?.enabled}-${section.noText}`,
    role,
    tab,
    label,
    section,
    image,
    images,
    overlayImages,
    text: formatPreviewText(config, role, index),
    textItem,
    textItems,
  }
}

export function formatPreviewCardSize(
  aspectRatio: AutomationAspectRatio,
  image?: PinterestSearchResult
) {
  const [widthRatio, heightRatio] = formatAspectRatioNumbers(aspectRatio, image)
  const ratio = widthRatio / heightRatio
  const maxWidth = 148
  const maxHeight = 250

  if (ratio >= 1) {
    return {
      width: maxWidth,
      height: Math.round(maxWidth / ratio),
    }
  }

  return {
    width: Math.max(92, Math.round(maxHeight * ratio)),
    height: maxHeight,
  }
}

export function formatAspectRatioCss(
  aspectRatio: AutomationAspectRatio,
  image?: PinterestSearchResult
) {
  const [width, height] = formatAspectRatioNumbers(aspectRatio, image)
  return `${width} / ${height}`
}

export function formatAspectRatioNumbers(
  aspectRatio: AutomationAspectRatio,
  _image?: PinterestSearchResult
): [number, number] {
  void _image
  const [width, height] = aspectRatio.split(":").map(Number)
  return width && height ? [width, height] : [3, 4]
}

export function formatCollection(
  config: AutomationSchema,
  collections: CreatedImageCollection[],
  role: "hook" | "content" | "cta"
) {
  const collectionId = automationCollectionId(config, role)
  return findCollectionByIdOrAlias(collections, collectionId)
}

export function formatCollectionImages(
  config: AutomationSchema,
  collections: CreatedImageCollection[],
  role: "hook" | "content" | "cta"
) {
  const collectionImages =
    formatCollection(config, collections, role)?.images ?? []
  if (role !== "cta") {
    return collectionImages
  }

  const cta = automationFormatSection(config, "cta")
  const selectedImageId = config.image_collection_ids.cta_slide.image_id
  if (cta.imageMode !== "single_image" || !selectedImageId) {
    return collectionImages
  }

  const selectedImage = collectionImages.find(
    (image) =>
      image.id === selectedImageId || image.imageUrl === selectedImageId
  )
  return selectedImage ? [selectedImage] : collectionImages
}

export function formatContentImageOverrideImages(
  section: AutomationFormatSection,
  collections: CreatedImageCollection[],
  slideIndex: number
) {
  const override = section.imageOverrides?.find(
    (item) => item.slideIndex === slideIndex
  )
  if (!override?.collectionId) {
    return null
  }
  const images =
    findCollectionByIdOrAlias(collections, override.collectionId)?.images ?? []
  return images.length > 0 ? images : null
}

export function formatOverlayCollectionImages(
  section: AutomationFormatSection,
  collections: CreatedImageCollection[]
) {
  return section.overlayImage?.enabled
    ? (findCollectionByIdOrAlias(
        collections,
        section.overlayImage.collectionId ?? ""
      )?.images ?? [])
    : []
}

export function formatPreviewText(
  config: AutomationSchema,
  role: "hook" | "content" | "cta",
  index: number
) {
  const section = automationFormatSection(config, role)
  const textItems =
    section.textItems.length > 0
      ? section.textItems
      : [defaultAutomationTextItem()]
  const textItem = textItems[index % textItems.length]

  return previewTextForTextItem(textItem)
}
