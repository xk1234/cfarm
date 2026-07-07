import type { ReactNode } from "react"
import { Blend, Expand, Grid3X3, Image as ImageIcon, Layers, MapPin, Plus, Type } from "lucide-react"

import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { PinterestPreviewTile } from "@/components/realfarm/shared-media"
import { SelectLike } from "@/components/ui/form-controls"
import {
  aspectRatioLabel,
  automationAspectRatios,
  automationImageGrids,
  imageGridLabel,
  labelToAspectRatio,
  labelToImageGrid,
  type AutomationFormatSection,
  type AutomationImageOverride,
  type AutomationSchema,
  type AutomationSlideOverride,
} from "@/lib/realfarm-automation"
import { findCollectionByIdOrAlias, type CreatedImageCollection } from "@/lib/realfarm-collections"
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
          <label className="text-sm font-medium text-[#242421]">Padding</label>
          <label className="flex h-8 w-[74px] items-center rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#242421] shadow-sm">
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
            <span className="ml-1 text-[#77766f]">%</span>
          </label>
        </div>
      ) : null}
      <CtaDivider />
      <CtaToggleRow
        icon={<Type className="size-3.5 text-[#999]" />}
        label="Display text"
        enabled={!section.noText}
        onClick={() => onDisplayTextChange(section.noText)}
      />
      <CtaDivider />
      <ContentOverrideHeader
        title="Slide overrides"
        onAdd={onSlideOverrideAdd}
      />
      <p className="text-[11px] leading-4 font-medium text-[#77766f]">
        Override content direction for a specific slide (e.g. soft-sell a
        product on slide 3).
      </p>
      {slideOverrides.map((override, index) => (
        <div
          key={`slide-override-${index}`}
          className="space-y-2 rounded-lg border border-[#ebeae3] bg-white p-2"
        >
          <div className="flex items-center gap-2">
            <label className="flex h-8 w-[76px] items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-2 text-[12px] font-semibold text-[#242421]">
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
            className="h-16 w-full resize-none rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-2.5 py-2 text-[12px] font-medium outline-none placeholder:text-[#AAA] focus:border-[#999]"
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
      <p className="text-[11px] leading-4 font-medium text-[#77766f]">
        Override the image collection for a specific slide (e.g. always use a
        specific image on slide 3).
      </p>
      {imageOverrides.map((override, index) => (
        <div
          key={`image-override-${index}`}
          className="space-y-2 rounded-lg border border-[#ebeae3] bg-white p-2"
        >
          <div className="flex items-center gap-2">
            <label className="flex h-8 w-[76px] items-center gap-1 rounded-lg border border-[#E5E7EB] bg-[#FAFAFA] px-2 text-[12px] font-semibold text-[#242421]">
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
        icon={<ImageIcon className="size-3.5 text-[#999]" />}
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
      <div className="text-[13px] font-semibold text-[#242421]">{title}</div>
      <button
        type="button"
        className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold text-blue-500 hover:bg-blue-50"
        onClick={onAdd}
      >
        <Plus className="size-3" />
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
  onPlacementChange,
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
  onPlacementChange: (placement: "last" | "static") => void
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
  const placement =
    section.ctaLocation === "static" ||
    config.image_collection_ids.cta_slide.cta_location === "static"
      ? "static"
      : "last"
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
      <CtaSelectRow
        icon={<MapPin className="size-3.5 text-[#999]" />}
        label="Slide Placement"
        value={placement === "last" ? "Last Slide" : "Static Position"}
        options={["Last Slide", "Static Position"]}
        onChange={(value) =>
          onPlacementChange(value === "Last Slide" ? "last" : "static")
        }
      />
      <CtaSelectRow
        icon={<ImageIcon className="size-3.5 text-[#999]" />}
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
          icon={<Expand className="size-3.5 text-[#999]" />}
          label="Aspect Ratio"
          value={aspectRatioLabel(section.aspect_ratio)}
          options={automationAspectRatios.map(aspectRatioLabel)}
          onChange={(value) =>
            onSectionChange({ aspect_ratio: labelToAspectRatio(value) })
          }
        />
        <CtaSelectRow
          icon={<Grid3X3 className="size-3.5 text-[#999]" />}
          label="Image Grid"
          value={imageGridLabel(section.imageGrid)}
          options={automationImageGrids.map(imageGridLabel)}
          onChange={(value) =>
            onSectionChange({ imageGrid: labelToImageGrid(value) })
          }
        />
      </div>

      <CtaDivider />
      <CtaToggleRow
        icon={<Blend className="size-3.5 text-[#999]" />}
        label="Overlay"
        enabled={section.overlay}
        onClick={() => onSectionChange({ overlay: !section.overlay })}
      />
      <CtaDivider />
      <CtaToggleRow
        icon={<ImageIcon className="size-3.5 text-[#999]" />}
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
        icon={<Type className="size-3.5 text-[#999]" />}
        label="Display text"
        enabled={!section.noText}
        onClick={() => onSectionChange({ noText: !section.noText })}
      />
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
    <div className="flex items-center justify-between gap-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </label>
      <SelectLike
        value={value}
        options={options}
        placement="bottom"
        onChange={onChange}
      />
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
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className={cn(
          "inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent p-0.5 shadow-sm transition-colors",
          enabled ? "bg-[#388EFF]" : "bg-[#e5e7eb]"
        )}
        onClick={onClick}
      >
        <span
          className={cn(
            "block size-4 rounded-full bg-white shadow transition-transform",
            enabled && "translate-x-4"
          )}
        />
      </button>
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
        <div className="w-full rounded-xl border border-dashed border-[#CCC] bg-[#FAFAFA] px-3 py-5 text-center text-[12px] font-medium text-[#999]">
          <div className="mx-auto mb-2 flex size-8 items-center justify-center rounded-lg bg-[#EEE]">
            <Layers className="size-4" />
          </div>
          Select CTA collection
        </div>
      )}
    </div>
  )
}

function CtaDivider() {
  return <hr className="border-t border-[#E5E7EB]" />
}


