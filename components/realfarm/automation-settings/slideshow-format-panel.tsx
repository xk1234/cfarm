import { useState } from "react"
import { IconChevronLeft, IconList } from "@tabler/icons-react"
import { Grid2X2 } from "lucide-react"

import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { ControlSelect, ControlToggle } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import { SelectLike } from "@/components/ui/form-controls"
import {
  aspectRatioLabel,
  automationAspectRatios,
  automationFormatSection,
  automationImageGrids,
  defaultAutomationTextItem,
  imageGridLabel,
  labelToAspectRatio,
  labelToImageGrid,
  schemaWithAutomationCollectionId,
  updateAutomationFormatSection,
  type AutomationFormatSection,
  type AutomationImageOverride,
  type AutomationSchema,
  type AutomationSlideOverride,
  type AutomationTextItem,
} from "@/lib/realfarm-automation"
import { findCollectionByIdOrAlias, type CreatedImageCollection } from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

import { AutomationContentFormatEditor, AutomationCtaFormatEditor } from "./content-format-editor"
import {
  buildFormatPreviewItems,
  clampPercent,
  clampSlideIndex,
  formatCollection,
  type AutomationFormatRole,
} from "./format-helpers"
import { SlideshowFormatPreviewStage } from "./slideshow-format-preview-stage"
import { VideoAutomationFormatPanel } from "./video-format-panel"

export function AutomationFormatPanel({
  automation,
  config,
  collections,
  selectedSound,
  music,
  demoVideos,
  onCreateCollection,
  onConfigChange,
  onBack,
  onSave,
}: {
  automation: Automation
  config: AutomationSchema
  collections: CreatedImageCollection[]
  selectedSound: LocalAsset | null
  music: LocalAsset[]
  demoVideos: LocalAsset[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onConfigChange: (config: AutomationSchema) => void
  onBack: () => void
  onSave: () => void
}) {
  const [activeTab, setActiveTab] = useState<"Hook" | "Content" | "CTA">("Hook")
  const [activePreview, setActivePreview] = useState(0)
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(
    null
  )
  const activeKey = activeTab.toLowerCase() as "hook" | "content" | "cta"
  const activeSection = automationFormatSection(config, activeKey)
  const activeTextItem =
    activeSection.textItems[selectedTextIndex ?? 0] ??
    defaultAutomationTextItem()
  const activeCollection = formatCollection(config, collections, activeKey)
  const activeOverlayCollection = findCollectionByIdOrAlias(
    collections,
    activeSection.overlayImage?.collectionId ?? ""
  )
  const previewItems = buildFormatPreviewItems(config, collections)
  const previewSlotWidth = 176
  const previewGap = 24
  const activePreviewIndex = Math.min(
    activePreview,
    Math.max(0, previewItems.length - 1)
  )
  const previewTrackOffset =
    activePreviewIndex * (previewSlotWidth + previewGap) + previewSlotWidth / 2

  if (config.automationKind === "video") {
    return (
      <VideoAutomationFormatPanel
        automation={automation}
        config={config}
        collections={collections}
        selectedSound={selectedSound}
        music={music}
        demoVideos={demoVideos}
        onCreateCollection={onCreateCollection}
        onConfigChange={onConfigChange}
        onBack={onBack}
        onSave={onSave}
      />
    )
  }

  function selectTab(tab: "Hook" | "Content" | "CTA") {
    setActiveTab(tab)
    setActivePreview(
      Math.max(
        0,
        previewItems.findIndex((item) => item.tab === tab)
      )
    )
    setSelectedTextIndex(null)
  }

  function updateSchema(
    updater: (current: AutomationSchema) => AutomationSchema
  ) {
    onConfigChange(updater(config))
  }

  function updateFormatSection<K extends "hook" | "content" | "cta">(
    key: K,
    patch: Partial<AutomationFormatSection>
  ) {
    updateSchema((current) =>
      updateAutomationFormatSection(current, key, patch)
    )
  }

  function updateImageCollectionId(
    role: AutomationFormatRole,
    collectionId: string
  ) {
    updateSchema((current) =>
      schemaWithAutomationCollectionId(current, role, collectionId)
    )
  }

  function updateCtaEnabled(enabled: boolean) {
    updateSchema((current) => ({
      ...updateAutomationFormatSection(current, "cta", {
        slideCount: enabled
          ? Math.max(1, automationFormatSection(current, "cta").slideCount || 1)
          : 0,
      }),
      image_collection_ids: {
        ...current.image_collection_ids,
        cta_slide: {
          ...current.image_collection_ids.cta_slide,
          check: enabled,
        },
      },
    }))
  }

  function updateCtaPlacement(value: "last" | "static") {
    updateSchema((current) => ({
      ...updateAutomationFormatSection(current, "cta", { ctaLocation: value }),
      image_collection_ids: {
        ...current.image_collection_ids,
        cta_slide: {
          ...current.image_collection_ids.cta_slide,
          cta_location: value === "last" ? "last_slide" : "static",
        },
      },
    }))
  }

  function updateCtaImageMode(value: "collection" | "single_image") {
    updateSchema((current) => ({
      ...updateAutomationFormatSection(current, "cta", { imageMode: value }),
      image_collection_ids: {
        ...current.image_collection_ids,
        cta_slide: {
          ...current.image_collection_ids.cta_slide,
          cta_collection_check: value === "collection",
        },
      },
    }))
  }

  function updateCtaSingleImage(imageId: string) {
    updateSchema((current) => ({
      ...current,
      image_collection_ids: {
        ...current.image_collection_ids,
        cta_slide: {
          ...current.image_collection_ids.cta_slide,
          image_id: imageId,
        },
      },
    }))
  }

  function updateCtaOverlayImage(enabled: boolean) {
    updateFormatSection("cta", {
      overlayImage: {
        ...(activeSection.overlayImage ?? { padding: 5 }),
        enabled,
      },
    })
  }

  function updateCtaOverlayCollection(collectionId: string) {
    updateFormatSection("cta", {
      overlayImage: {
        ...(activeSection.overlayImage ?? { enabled: true, padding: 5 }),
        enabled: true,
        collectionId,
      },
    })
  }

  function updateSectionOverlayImage(enabled: boolean) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        overlayImage: {
          ...(section.overlayImage ?? { padding: 5 }),
          enabled,
        },
      })
    })
  }

  function updateSectionOverlayCollection(collectionId: string) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        overlayImage: {
          ...(section.overlayImage ?? { enabled: true, padding: 5 }),
          enabled: true,
          collectionId,
        },
      })
    })
  }

  function updateSectionOverlayPadding(padding: number) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        overlayImage: {
          ...(section.overlayImage ?? { enabled: true }),
          enabled: section.overlayImage?.enabled ?? true,
          padding: clampPercent(padding),
        },
      })
    })
  }

  function updateContentSlideOverride(
    index: number,
    patch: Partial<AutomationSlideOverride>
  ) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      const slideOverrides = [...(section.slideOverrides ?? [])]
      const existing = slideOverrides[index] ?? {
        slideIndex: index + 1,
        contentDirection: "",
      }
      slideOverrides[index] = {
        ...existing,
        ...patch,
        slideIndex: clampSlideIndex(patch.slideIndex ?? existing.slideIndex),
        contentDirection:
          patch.contentDirection ?? existing.contentDirection ?? "",
      }
      return updateAutomationFormatSection(current, "content", {
        slideOverrides,
      })
    })
  }

  function addContentSlideOverride() {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      const slideOverrides = [...(section.slideOverrides ?? [])]
      slideOverrides.push({
        slideIndex: slideOverrides.length + 1,
        contentDirection: "",
      })
      return updateAutomationFormatSection(current, "content", {
        slideOverrides,
      })
    })
  }

  function removeContentSlideOverride(index: number) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        slideOverrides: (section.slideOverrides ?? []).filter(
          (_, overrideIndex) => overrideIndex !== index
        ),
      })
    })
  }

  function updateContentImageOverride(
    index: number,
    patch: Partial<AutomationImageOverride>
  ) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      const imageOverrides = [...(section.imageOverrides ?? [])]
      const existing = imageOverrides[index] ?? {
        slideIndex: index + 1,
        collectionId: "",
      }
      imageOverrides[index] = {
        ...existing,
        ...patch,
        slideIndex: clampSlideIndex(patch.slideIndex ?? existing.slideIndex),
        collectionId: patch.collectionId ?? existing.collectionId ?? "",
      }
      return updateAutomationFormatSection(current, "content", {
        imageOverrides,
      })
    })
  }

  function addContentImageOverride() {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      const imageOverrides = [...(section.imageOverrides ?? [])]
      imageOverrides.push({
        slideIndex: imageOverrides.length + 1,
        collectionId: "",
      })
      return updateAutomationFormatSection(current, "content", {
        imageOverrides,
      })
    })
  }

  function removeContentImageOverride(index: number) {
    updateSchema((current) => {
      const section = automationFormatSection(current, "content")
      return updateAutomationFormatSection(current, "content", {
        imageOverrides: (section.imageOverrides ?? []).filter(
          (_, overrideIndex) => overrideIndex !== index
        ),
      })
    })
  }

  function updateTextItem(patch: Partial<AutomationTextItem>) {
    updateSchema((current) => {
      const section = automationFormatSection(current, activeKey)
      const textIndex = selectedTextIndex ?? 0
      const textItems =
        section.textItems.length > 0
          ? [...section.textItems]
          : [defaultAutomationTextItem()]
      textItems[textIndex] = {
        ...defaultAutomationTextItem(),
        ...textItems[textIndex],
        ...patch,
      }

      return updateAutomationFormatSection(current, activeKey, { textItems })
    })
  }

  function deleteSelectedTextItem() {
    updateSchema((current) => {
      const section = automationFormatSection(current, activeKey)
      const textIndex = selectedTextIndex ?? 0
      const textItems = section.textItems.filter(
        (_, index) => index !== textIndex
      )
      return updateAutomationFormatSection(current, activeKey, {
        textItems:
          textItems.length > 0 ? textItems : [defaultAutomationTextItem()],
      })
    })
    setSelectedTextIndex(null)
  }

  function addTextItem() {
    updateSchema((current) => {
      const section = automationFormatSection(current, activeKey)
      const textItems =
        section.textItems.length > 0
          ? [...section.textItems, defaultAutomationTextItem()]
          : [defaultAutomationTextItem(), defaultAutomationTextItem()]
      return updateAutomationFormatSection(current, activeKey, { textItems })
    })
    setSelectedTextIndex(activeSection.textItems.length)
  }

  return (
    <div className="grid h-full min-h-0 bg-[#b9b9b6] md:grid-cols-[335px_1fr]">
      <aside className="flex min-h-0 flex-col bg-[#f7f7f4]">
        <div className="flex h-12 items-center justify-between border-b border-[#deddd5] px-3">
          <button
            className="flex items-center gap-2 text-[13px] font-semibold text-[#5d5c56]"
            onClick={onBack}
          >
            <IconChevronLeft className="size-4" />
            Back
          </button>
          <div className="flex gap-2 text-[#8c8b84]">
            <IconList className="size-4" />
            <Grid2X2 className="size-4" />
          </div>
        </div>

        <div className="grid h-11 grid-cols-3 border-b border-[#deddd5] text-center text-[13px] font-semibold">
          {(["Hook", "Content", "CTA"] as const).map((tab) => (
            <button
              key={tab}
              className={cn(
                activeTab === tab
                  ? "border-b-2 border-[#242421] text-[#242421]"
                  : "text-[#9a9991]"
              )}
              onClick={() => selectTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {activeTab === "CTA" ? (
            <AutomationCtaFormatEditor
              config={config}
              section={activeSection}
              collection={activeCollection}
              collections={collections}
              onCreateCollection={onCreateCollection}
              onEnabledChange={updateCtaEnabled}
              onPlacementChange={updateCtaPlacement}
              onImageModeChange={updateCtaImageMode}
              onCollectionChange={(collectionId) =>
                updateImageCollectionId("cta", collectionId)
              }
              onSingleImageChange={updateCtaSingleImage}
              onSectionChange={(patch) => updateFormatSection("cta", patch)}
              onOverlayImageChange={updateCtaOverlayImage}
              onOverlayCollectionChange={updateCtaOverlayCollection}
            />
          ) : (
            <>
              <CollectionSelector
                label={activeTab}
                collection={activeCollection}
                collections={collections}
                onChange={(collectionId) =>
                  updateImageCollectionId(activeKey, collectionId)
                }
                onCreateCollection={onCreateCollection}
              />

              {activeTab === "Content" && (
                <div className="mb-3 grid grid-cols-[1fr_72px] gap-2">
                  <SelectLike
                    value="Static"
                    options={["Static"]}
                    placement="bottom"
                    onChange={() => undefined}
                  />
                  <input
                    className="h-8 rounded-[7px] border border-[#ebeae3] bg-white px-2 text-center text-[12px] font-semibold outline-none"
                    value={activeSection.slideCount}
                    onChange={(event) => {
                      const value = Number(event.target.value) || 1
                      updateSchema((current) => ({
                        ...updateAutomationFormatSection(current, "content", {
                          slideCount: value,
                        }),
                        prompt_formatting: {
                          ...current.prompt_formatting,
                          num_of_slides: Math.max(
                            1,
                            value +
                              automationFormatSection(current, "hook")
                                .slideCount
                          ),
                        },
                      }))
                    }}
                    aria-label="Slide count"
                  />
                </div>
              )}

              <ControlSelect
                label="Aspect Ratio"
                value={aspectRatioLabel(activeSection.aspect_ratio)}
                options={automationAspectRatios.map(aspectRatioLabel)}
                onChange={(value) =>
                  updateFormatSection(activeKey, {
                    aspect_ratio: labelToAspectRatio(value),
                  })
                }
              />
              <ControlSelect
                label="Image Grid"
                value={imageGridLabel(activeSection.imageGrid)}
                options={automationImageGrids.map(imageGridLabel)}
                onChange={(value) =>
                  updateFormatSection(activeKey, {
                    imageGrid: labelToImageGrid(value),
                  })
                }
              />
              <ControlToggle
                label="Overlay"
                enabled={activeSection.overlay}
                onClick={() =>
                  updateFormatSection(activeKey, {
                    overlay: !activeSection.overlay,
                  })
                }
              />
              {activeTab === "Content" ? (
                <AutomationContentFormatEditor
                  section={activeSection}
                  overlayCollection={activeOverlayCollection}
                  collections={collections}
                  onCreateCollection={onCreateCollection}
                  onOverlayImageChange={updateSectionOverlayImage}
                  onOverlayCollectionChange={updateSectionOverlayCollection}
                  onOverlayPaddingChange={updateSectionOverlayPadding}
                  onDisplayTextChange={(enabled) =>
                    updateFormatSection("content", { noText: !enabled })
                  }
                  onSlideOverrideAdd={addContentSlideOverride}
                  onSlideOverrideChange={updateContentSlideOverride}
                  onSlideOverrideRemove={removeContentSlideOverride}
                  onImageOverrideAdd={addContentImageOverride}
                  onImageOverrideChange={updateContentImageOverride}
                  onImageOverrideRemove={removeContentImageOverride}
                />
              ) : (
                <ControlToggle
                  label="Display text"
                  enabled={!activeSection.noText}
                  onClick={() =>
                    updateFormatSection(activeKey, {
                      noText: !activeSection.noText,
                    })
                  }
                />
              )}
            </>
          )}
        </div>

        <div className="border-t border-[#deddd5] p-3">
          <Button
            variant="action"
            size="appDefault"
            className="w-full"
            onClick={onSave}
          >
            Save Changes
          </Button>
        </div>
      </aside>

      <SlideshowFormatPreviewStage
        previewItems={previewItems}
        activeTab={activeTab}
        activeTextItem={activeTextItem}
        selectedTextIndex={selectedTextIndex}
        activePreviewIndex={activePreviewIndex}
        previewSlotWidth={previewSlotWidth}
        previewGap={previewGap}
        previewTrackOffset={previewTrackOffset}
        onSelectPreview={(index, tab) => {
          setActivePreview(index)
          setActiveTab(tab)
          setSelectedTextIndex(null)
        }}
        onSelectPreviewText={(index, tab) => {
          setActivePreview(index)
          setActiveTab(tab)
          setSelectedTextIndex(0)
        }}
        updateTextItem={updateTextItem}
        onDeleteTextItem={deleteSelectedTextItem}
        onAddTextItem={addTextItem}
      />
    </div>
  )
}

