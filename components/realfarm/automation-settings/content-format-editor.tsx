import type { ReactNode } from "react"
import {
  LuBlend,
  LuExpand,
  LuImage as ImageIcon,
  LuLayers,
  LuPlus,
  LuType,
} from "react-icons/lu"

import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { PinterestPreviewTile } from "@/components/realfarm/shared-media"
import { SelectLike, SwitchPillButton } from "@/components/ui/form-controls"
import {
  aspectRatioLabel,
  automationImageGrids,
  automationAspectRatios,
  imageGridLabel,
  labelToAspectRatio,
  labelToImageGrid,
  type AutomationFormatSection,
  type AutomationImageOverride,
  type AutomationSchema,
  type AutomationSlideOverride,
} from "@/lib/realfarm-automation"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import { cn } from "@/lib/utils"

import { ctaEnabled } from "./format-helpers"

export function AutomationContentFormatEditor({
  section,
  overlayCollection,
  collections,
  onCreateCollection,
  onOverlayImageChange,
  onOverlayCollectionChange,
  onOverlayPaddingChange,
  onDisplayTextChange,
  onSlideOverrideAdd,
  onSlideOverrideChange,
  onSlideOverrideRemove,
  onImageOverrideAdd,
  onImageOverrideChange,
  onImageOverrideRemove,
}: {
  section: AutomationFormatSection
  overlayCollection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onOverlayImageChange: (enabled: boolean) => void
  onOverlayCollectionChange: (collectionId: string) => void
  onOverlayPaddingChange: (padding: number) => void
  onDisplayTextChange: (enabled: boolean) => void
  onSlideOverrideAdd: () => void
  onSlideOverrideChange: (
    index: number,
    patch: Partial<AutomationSlideOverride>
  ) => void
  onSlideOverrideRemove: (index: number) => void
  onImageOverrideAdd: () => void
  onImageOverrideChange: (
    index: number,
    patch: Partial<AutomationImageOverride>
  ) => void
  onImageOverrideRemove: (index: number) => void
}) {
  const slideOverrides = section.slideOverrides ?? []
  const imageOverrides = section.imageOverrides ?? []

  return (
    <div className="space-y-3">
      <CtaDivider />
      <ContentOverlayImagePicker
        section={section}
        overlayCollection={overlayCollection}
        collections={collections}
        onCreateCollection={onCreateCollection}
        onOverlayImageChange={onOverlayImageChange}
        onOverlayCollectionChange={onOverlayCollectionChange}
      />
      {section.overlayImage?.enabled ? (
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-medium text-app-text">Padding</label>
          <label className="flex h-8 w-[74px] items-center rounded-lg border border-app-panel-border bg-app-surface px-2 text-[12px] font-semibold text-app-text shadow-sm">
            <input
              className="min-w-0 flex-1 bg-transparent text-right outline-none"
              type="number"
              min={0}
              max={100}
              value={section.overlayImage?.padding ?? 5}
              onChange={(event) =>
                onOverlayPaddingChange(Number(event.target.value) || 0)
              }
              aria-label="Overlay image padding"
            />
            <span className="ml-1 text-app-muted-text">%</span>
          </label>
        </div>
      ) : null}
      <CtaDivider />
      <CtaToggleRow
        icon={<LuType className="size-3.5 text-app-text-faint" />}
        label="Display text"
        enabled={!section.noText}
        onClick={() => onDisplayTextChange(section.noText)}
      />
      <CtaDivider />
      <ContentOverrideHeader
        title="Slide overrides"
        onAdd={onSlideOverrideAdd}
      />
      <p className="text-[11px] leading-4 font-medium text-app-muted-text">
        Override content direction for a specific slide (e.g. soft-sell a
        product on slide 3).
      </p>
      {slideOverrides.map((override, index) => (
        <div
          key={`slide-override-${index}`}
          className="space-y-2 rounded-lg border border-[#ebeae3] bg-app-surface p-2"
        >
          <div className="flex items-center gap-2">
            <label className="flex h-8 w-[76px] items-center gap-1 rounded-lg border border-app-panel-border bg-[#FAFAFA] px-2 text-[12px] font-semibold text-app-text">
              <span>#</span>
              <input
                className="min-w-0 flex-1 bg-transparent outline-none"
                type="number"
                min={1}
                value={override.slideIndex}
                onChange={(event) =>
                  onSlideOverrideChange(index, {
                    slideIndex: Number(event.target.value) || 1,
                  })
                }
                aria-label={`Slide override ${index + 1} slide index`}
              />
            </label>
            <button
              type="button"
              className="ml-auto rounded-md px-2 py-1 text-[11px] font-semibold text-[#e65656] hover:bg-red-50"
              onClick={() => onSlideOverrideRemove(index)}
            >
              Remove
            </button>
          </div>
          <textarea
            className="h-16 w-full resize-none rounded-lg border border-app-panel-border bg-[#FAFAFA] px-2.5 py-2 text-[12px] font-medium outline-none placeholder:text-[#AAA] focus:border-[#999]"
            value={override.contentDirection}
            onChange={(event) =>
              onSlideOverrideChange(index, {
                contentDirection: event.target.value,
              })
            }
            placeholder="e.g. soft-sell a product on this slide..."
          />
        </div>
      ))}
      <CtaDivider />
      <ContentOverrideHeader
        title="Image overrides"
        onAdd={onImageOverrideAdd}
      />
      <p className="text-[11px] leading-4 font-medium text-app-muted-text">
        Override the image collection for a specific slide (e.g. always use a
        specific image on slide 3).
      </p>
      {imageOverrides.map((override, index) => (
        <div
          key={`image-override-${index}`}
          className="space-y-2 rounded-lg border border-[#ebeae3] bg-app-surface p-2"
        >
          <div className="flex items-center gap-2">
            <label className="flex h-8 w-[76px] items-center gap-1 rounded-lg border border-app-panel-border bg-[#FAFAFA] px-2 text-[12px] font-semibold text-app-text">
              <span>#</span>
              <input
                className="min-w-0 flex-1 bg-transparent outline-none"
                type="number"
                min={1}
                value={override.slideIndex}
                onChange={(event) =>
                  onImageOverrideChange(index, {
                    slideIndex: Number(event.target.value) || 1,
                  })
                }
                aria-label={`Image override ${index + 1} slide index`}
              />
            </label>
            <button
              type="button"
              className="ml-auto rounded-md px-2 py-1 text-[11px] font-semibold text-[#e65656] hover:bg-red-50"
              onClick={() => onImageOverrideRemove(index)}
            >
              Remove
            </button>
          </div>
          <CollectionSelector
            label="Override collection"
            collection={findCollectionByIdOrAlias(
              collections,
              override.collectionId
            )}
            collections={collections}
            showPictures={false}
            onChange={(collectionId) =>
              onImageOverrideChange(index, { collectionId })
            }
            onCreateCollection={onCreateCollection}
          />
        </div>
      ))}
    </div>
  )
}

function ContentOverlayImagePicker({
  section,
  overlayCollection,
  collections,
  onCreateCollection,
  onOverlayImageChange,
  onOverlayCollectionChange,
}: {
  section: AutomationFormatSection
  overlayCollection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onOverlayImageChange: (enabled: boolean) => void
  onOverlayCollectionChange: (collectionId: string) => void
}) {
  return (
    <div className="space-y-2">
      <CtaToggleRow
        icon={<ImageIcon className="size-3.5 text-app-text-faint" />}
        label="Overlay Image"
        enabled={Boolean(section.overlayImage?.enabled)}
        onClick={() => onOverlayImageChange(!section.overlayImage?.enabled)}
      />
      {section.overlayImage?.enabled ? (
        <CollectionSelector
          label="Overlay image"
          collection={overlayCollection}
          collections={collections}
          onChange={onOverlayCollectionChange}
          onCreateCollection={onCreateCollection}
        />
      ) : null}
    </div>
  )
}

function ContentOverrideHeader({
  title,
  onAdd,
}: {
  title: string
  onAdd: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[13px] font-semibold text-app-text">{title}</div>
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-blue-500 hover:bg-blue-50"
        onClick={onAdd}
      >
        <LuPlus className="size-3" />
        Add
      </button>
    </div>
  )
}

export function AutomationCtaFormatEditor({
  config,
  section,
  collection,
  collections,
  onCreateCollection,
  onEnabledChange,
  onImageModeChange,
  onCollectionChange,
  onSingleImageChange,
  onSectionChange,
  onOverlayImageChange,
  onOverlayCollectionChange,
}: {
  config: AutomationSchema
  section: AutomationFormatSection
  collection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onEnabledChange: (enabled: boolean) => void
  onImageModeChange: (mode: "collection" | "single_image") => void
  onCollectionChange: (collectionId: string) => void
  onSingleImageChange: (imageId: string) => void
  onSectionChange: (patch: Partial<AutomationFormatSection>) => void
  onOverlayImageChange: (enabled: boolean) => void
  onOverlayCollectionChange: (collectionId: string) => void
}) {
  const enabled = ctaEnabled(config, section)
  const imageMode =
    section.imageMode === "single_image" ? "single_image" : "collection"
  const selectedImageId = config.image_collection_ids.cta_slide.image_id ?? ""
  const overlayCollection = findCollectionByIdOrAlias(
    collections,
    section.overlayImage?.collectionId ?? ""
  )

  return (
    <div className="space-y-3">
      <CtaToggleRow
        label="Enable CTA"
        enabled={enabled}
        onClick={() => onEnabledChange(!enabled)}
      />
      {enabled ? (
        <>
          <CtaSelectRow
            icon={<ImageIcon className="size-3.5 text-app-text-faint" />}
            label="Collection or Image"
            value={imageMode === "single_image" ? "Single image" : "Collection"}
            options={["Collection", "Single image"]}
            onChange={(value) =>
              onImageModeChange(
                value === "Single image" ? "single_image" : "collection"
              )
            }
          />

          <div className="pt-1">
            {imageMode === "single_image" ? (
              <CtaSingleImagePicker
                collection={collection}
                collections={collections}
                selectedImageId={selectedImageId}
                onCollectionChange={onCollectionChange}
                onCreateCollection={onCreateCollection}
                onImageChange={onSingleImageChange}
              />
            ) : (
              <CollectionSelector
                label="CTA collection"
                collection={collection}
                collections={collections}
                onChange={onCollectionChange}
                onCreateCollection={onCreateCollection}
              />
            )}
          </div>

          <div className="space-y-2">
            <CtaSelectRow
              icon={<LuExpand className="size-3.5 text-app-text-faint" />}
              label="Aspect Ratio"
              value={aspectRatioLabel(section.aspect_ratio)}
              options={automationAspectRatios.map(aspectRatioLabel)}
              onChange={(value) =>
                onSectionChange({ aspect_ratio: labelToAspectRatio(value) })
              }
            />
            <CtaSelectRow
              icon={<LuLayers className="size-3.5 text-app-text-faint" />}
              label="Image layout"
              value={imageGridLabel(section.imageGrid)}
              options={automationImageGrids.map(imageGridLabel)}
              onChange={(value) =>
                onSectionChange({ imageGrid: labelToImageGrid(value) })
              }
            />
          </div>

          <CtaDivider />
          <CtaToggleRow
            icon={<LuBlend className="size-3.5 text-app-text-faint" />}
            label="Overlay"
            enabled={section.overlay}
            onClick={() => onSectionChange({ overlay: !section.overlay })}
          />
          <CtaDivider />
          <CtaToggleRow
            icon={<ImageIcon className="size-3.5 text-app-text-faint" />}
            label="Overlay Image"
            enabled={Boolean(section.overlayImage?.enabled)}
            onClick={() => onOverlayImageChange(!section.overlayImage?.enabled)}
          />
          {section.overlayImage?.enabled ? (
            <CollectionSelector
              label="Overlay image"
              collection={overlayCollection}
              collections={collections}
              onChange={onOverlayCollectionChange}
              onCreateCollection={onCreateCollection}
            />
          ) : null}
          <CtaDivider />
          <CtaToggleRow
            icon={<LuType className="size-3.5 text-app-text-faint" />}
            label="Display text"
            enabled={!section.noText}
            onClick={() => onSectionChange({ noText: !section.noText })}
          />
        </>
      ) : null}
    </div>
  )
}

function CtaSelectRow({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: ReactNode
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
}) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,88px)_minmax(0,1fr)] items-center gap-3">
      <label className="flex min-w-0 items-center gap-2 text-sm leading-5 font-medium">
        {icon}
        <span className="min-w-0">{label}</span>
      </label>
      <div className="max-w-full min-w-0">
        <SelectLike
          value={value}
          options={options}
          placement="bottom"
          onChange={onChange}
        />
      </div>
    </div>
  )
}

function CtaToggleRow({
  icon,
  label,
  enabled,
  onClick,
}: {
  icon?: ReactNode
  label: string
  enabled: boolean
  onClick: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </label>
      <SwitchPillButton
        enabled={enabled}
        onClick={onClick}
        aria-label={`Toggle ${label}`}
      />
    </div>
  )
}

function CtaSingleImagePicker({
  collection,
  collections,
  selectedImageId,
  onCollectionChange,
  onCreateCollection,
  onImageChange,
}: {
  collection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  selectedImageId: string
  onCollectionChange: (collectionId: string) => void
  onCreateCollection: (collection: CreatedImageCollection) => void
  onImageChange: (imageId: string) => void
}) {
  const images = collection?.images ?? []

  return (
    <div className="space-y-3">
      <CollectionSelector
        label="CTA image source"
        collection={collection}
        collections={collections}
        onChange={onCollectionChange}
        onCreateCollection={onCreateCollection}
      />
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {images.slice(0, 9).map((image, index) => (
            <button
              key={image.id || image.imageUrl}
              type="button"
              className={cn(
                "aspect-square overflow-hidden rounded-lg bg-[#deddd8] ring-offset-2",
                selectedImageId === image.id
                  ? "ring-2 ring-app-action"
                  : "ring-1 ring-[#e1e0d8]"
              )}
              onClick={() => onImageChange(image.id || image.imageUrl)}
              aria-label={`Select CTA image ${index + 1}`}
            >
              <PinterestPreviewTile
                image={image}
                index={index}
                className="h-full rounded-none"
              />
            </button>
          ))}
        </div>
      ) : (
        <div className="w-full rounded-xl border border-dashed border-[#CCC] bg-[#FAFAFA] px-3 py-5 text-center text-[12px] font-medium text-app-text-faint">
          <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-lg bg-[#EEE]">
            <LuLayers className="size-4" />
          </div>
          Select CTA collection
        </div>
      )}
    </div>
  )
}

function CtaDivider() {
  return <hr className="border-t border-app-panel-border" />
}
