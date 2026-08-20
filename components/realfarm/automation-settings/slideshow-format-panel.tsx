import { useEffect, useRef, useState } from "react"
import { IconChevronLeft } from "@tabler/icons-react"

import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { ControlToggle } from "@/components/realfarm/shared-media"
import { SelectLike } from "@/components/ui/form-controls"
import {
  automationFormatSection,
  automationImageGrids,
  defaultAutomationTextItem,
  imageGridLabel,
  labelToImageGrid,
  schemaWithAutomationCollectionId,
  updateAutomationFormatSection,
  type AutomationFormatSection,
  type AutomationImageOverride,
  type AutomationSchema,
  type AutomationSlideOverride,
  type TextItem,
} from "@/lib/realfarm-automation"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/features/collections/domain/collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"
import {
  applySlideshowVisualPreset,
  slideshowVisualPresetById,
  slideshowVisualPresets,
} from "@/lib/slideshow-visual-presets"

import {
  AutomationContentFormatEditor,
  AutomationCtaFormatEditor,
} from "./content-format-editor"
import {
  buildFormatPreviewItems,
  clampPercent,
  clampSlideIndex,
  formatCollection,
  formatPreviewCardSize,
  newAutomationTextItemAfter,
  previewTrackOffsetForWidths,
  updateAutomationTextItemAt,
  type AutomationFormatRole,
} from "./format-helpers"
import { SlideshowFormatPreviewStage } from "./slideshow-format-preview-stage"
import { VideoAutomationFormatPanel } from "./video-format-panel"
import { UgcAutomationFormatPanel } from "./ugc-format-panel"
import { VideoTemplateFormatPanel } from "./video-template-panel"

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
}) {
  const [activeTab, setActiveTab] = useState<"Hook" | "Content" | "CTA">("Hook")
  // Below md the controls and the canvas cannot share the screen: stacking them
  // left the slides as an unreadable sliver under a full-height form.
  const [mobileView, setMobileView] = useState<"design" | "preview">("design")
  const [activePreview, setActivePreview] = useState(0)
  const [previewZoom, setPreviewZoom] = useState(1)
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(
    null
  )
  const configRef = useRef(config)
  const onConfigChangeRef = useRef(onConfigChange)
  const activeKey = activeTab.toLowerCase() as "hook" | "content" | "cta"
  const activeSection = automationFormatSection(config, activeKey)
  const activeVisualPreset = slideshowVisualPresetById(
    activeSection.visualPresetId
  )
  const photoCollections = collections.filter(
    (collection) => collection.mediaType !== "video"
  )
  const activeTextItem =
    activeSection.textItems[selectedTextIndex ?? 0] ??
    defaultAutomationTextItem()
  const activeCollection = formatCollection(config, photoCollections, activeKey)
  const activeOverlayCollection = findCollectionByIdOrAlias(
    photoCollections,
    activeSection.overlayImage?.collectionId ?? ""
  )
  const previewItems = buildFormatPreviewItems(config, collections)
  const previewBaseScale = 2.5
  const previewSlotSizes = previewItems.map((item) => {
    const size = formatPreviewCardSize(item.section.aspect_ratio, item.image)
    return {
      width: size.width * previewBaseScale,
      height: size.height * previewBaseScale,
    }
  })
  const previewSlotWidths = previewSlotSizes.map((size) => size.width)
  const previewSlotHeights = previewSlotSizes.map((size) => size.height)
  const previewGap = 50
  const activePreviewIndex = Math.min(
    activePreview,
    Math.max(0, previewItems.length - 1)
  )
  const previewTrackOffset = previewTrackOffsetForWidths(
    previewSlotWidths,
    activePreviewIndex,
    previewGap
  )

  useEffect(() => {
    configRef.current = config
    onConfigChangeRef.current = onConfigChange
  }, [config, onConfigChange])

  if (config.automationKind === "video") {
    const videoTemplate = config.video_format?.template ?? "ugc_ad"
    if (videoTemplate !== "ugc_ad") {
      return (
        <VideoTemplateFormatPanel
          automation={automation}
          config={config}
          collections={collections}
          selectedSound={selectedSound}
          music={music}
          demoVideos={demoVideos}
          onCreateCollection={onCreateCollection}
          onConfigChange={onConfigChange}
          onBack={onBack}
        />
      )
    }
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
      />
    )
  }

  if (config.automationKind === "ugc") {
    return (
      <UgcAutomationFormatPanel
        config={config}
        collections={collections}
        onCreateCollection={onCreateCollection}
        onConfigChange={onConfigChange}
        onBack={onBack}
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
    const current = configRef.current
    const next = updater(current)
    configRef.current = next
    onConfigChangeRef.current(next)
  }

  function updateFormatSection<K extends "hook" | "content" | "cta">(
    key: K,
    patch: Partial<AutomationFormatSection>
  ) {
    updateSchema((current) =>
      updateAutomationFormatSection(current, key, patch)
    )
  }

  function updateVisualPreset(presetName: string) {
    const preset = slideshowVisualPresets.find(
      (candidate) => candidate.name === presetName
    )
    if (!preset) {
      updateFormatSection(activeKey, { visualPresetId: undefined })
      return
    }
    updateSchema((current) => {
      const section = automationFormatSection(current, activeKey)
      const next = updateAutomationFormatSection(
        current,
        activeKey,
        applySlideshowVisualPreset(section, preset)
      )
      return {
        ...next,
        aspect_ratio: preset.section.aspect_ratio,
        font: preset.section.textItems[0]?.font || current.font,
      }
    })
    setSelectedTextIndex(0)
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

  function updateCtaImageMode(value: "collection" | "single_image") {
    updateSchema((current) => ({
      ...updateAutomationFormatSection(current, "cta", { imageMode: value }),
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

  function updateTextItem(patch: Partial<TextItem>) {
    updateSchema((current) =>
      updateAutomationTextItemAt(
        current,
        activeKey,
        selectedTextIndex ?? 0,
        patch
      )
    )
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
      const previous = section.textItems.at(-1)
      const textItems =
        section.textItems.length > 0
          ? [...section.textItems, newAutomationTextItemAfter(previous)]
          : [
              defaultAutomationTextItem(),
              newAutomationTextItemAfter(defaultAutomationTextItem()),
            ]
      return updateAutomationFormatSection(current, activeKey, { textItems })
    })
    setSelectedTextIndex(activeSection.textItems.length)
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col bg-[#b9b9b6] md:grid md:grid-cols-[340px_minmax(0,1fr)]"
      onPointerDown={(event) => {
        if (selectedTextIndex === null) return
        const target = event.target
        if (
          target instanceof Element &&
          target.closest(
            "[data-slideshow-text-editor], [data-select-like-content]"
          )
        ) {
          return
        }
        setSelectedTextIndex(null)
      }}
    >
      <aside
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-1 flex-col bg-app-surface-subtle md:flex md:w-[340px] md:min-w-[340px] md:flex-none",
          mobileView === "preview" && "hidden"
        )}
      >
        <div className="flex h-12 items-center justify-between border-b border-app-panel-border px-3">
          <button
            className="flex items-center gap-2 text-[13px] font-semibold text-[#5d5c56]"
            onClick={onBack}
          >
            <IconChevronLeft className="size-4" />
            Back
          </button>
          <button
            type="button"
            className="h-8 rounded-lg bg-[#efefeb] px-3 text-[12px] font-semibold text-[#5d5c56] md:hidden"
            onClick={() => setMobileView("preview")}
          >
            Preview
          </button>
        </div>

        <div className="grid h-11 grid-cols-3 border-b border-app-panel-border text-center text-[13px] font-semibold">
          {(["Hook", "Content", "CTA"] as const).map((tab) => (
            <button
              key={tab}
              className={cn(
                activeTab === tab
                  ? "border-b-2 border-app-strong text-app-text"
                  : "text-app-text-faint"
              )}
              onClick={() => selectTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-3 space-y-1.5">
            <label className="text-xs font-semibold text-app-muted-text">
              Visual preset
            </label>
            <SelectLike
              value={activeVisualPreset?.name ?? "Custom"}
              options={[
                "Custom",
                ...slideshowVisualPresets.map((preset) => preset.name),
              ]}
              placement="bottom"
              onChange={updateVisualPreset}
            />
            <p className="text-[11px] leading-4 text-app-text-faint">
              {activeVisualPreset
                ? `${activeVisualPreset.description} Switch to Custom to unlock the applied values.`
                : "Custom keeps every visual control editable."}
            </p>
          </div>

          <fieldset
            disabled={Boolean(activeVisualPreset)}
            className="min-w-0 disabled:[&_button]:cursor-not-allowed disabled:[&_button]:opacity-60 disabled:[&_input]:cursor-not-allowed disabled:[&_textarea]:cursor-not-allowed"
          >
            {activeTab === "CTA" ? (
              <AutomationCtaFormatEditor
                config={config}
                section={activeSection}
                collection={activeCollection}
                collections={photoCollections}
                onCreateCollection={onCreateCollection}
                onEnabledChange={updateCtaEnabled}
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
                  collections={photoCollections}
                  onChange={(collectionId) =>
                    updateImageCollectionId(activeKey, collectionId)
                  }
                  onCreateCollection={onCreateCollection}
                />

                <div className="mb-3">
                  <SelectLike
                    value={imageGridLabel(activeSection.imageGrid)}
                    options={automationImageGrids.map(imageGridLabel)}
                    placement="bottom"
                    onChange={(value) =>
                      updateFormatSection(activeKey, {
                        imageGrid: labelToImageGrid(value),
                      })
                    }
                  />
                </div>

                {activeTab === "Content" && (
                  <div className="mb-3 grid grid-cols-[1fr_72px] gap-2">
                    <div className="bg-app-subtle-surface flex h-8 items-center rounded-[7px] border border-[#ebeae3] px-3 text-[12px] font-medium text-app-muted-text">
                      Fixed slides
                    </div>
                    <input
                      className="h-8 rounded-[7px] border border-[#ebeae3] bg-app-surface px-2 text-center text-[12px] font-semibold outline-none"
                      value={activeSection.slideCount}
                      onChange={(event) => {
                        const value = Number(event.target.value) || 1
                        updateSchema((current) => {
                          const hookCount = automationFormatSection(
                            current,
                            "hook"
                          ).slideCount
                          const ctaCount = automationFormatSection(
                            current,
                            "cta"
                          ).slideCount
                          const total = Math.max(
                            1,
                            value + hookCount + ctaCount
                          )
                          return {
                            ...updateAutomationFormatSection(
                              current,
                              "content",
                              {
                                slideCount: value,
                                slideCountMode: "static",
                                slideCountMin: undefined,
                                slideCountMax: undefined,
                              }
                            ),
                            prompt_formatting: {
                              ...current.prompt_formatting,
                              num_of_slides: total,
                              slide_count_min: total,
                              slide_count_max: total,
                            },
                          }
                        })
                      }}
                      aria-label="Slide count"
                    />
                  </div>
                )}

                {activeTab === "Content" ? (
                  <AutomationContentFormatEditor
                    section={activeSection}
                    overlayCollection={activeOverlayCollection}
                    collections={photoCollections}
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
            {activeTab !== "CTA" ? (
              <ControlToggle
                label="AI image matching"
                enabled={activeSection.aiImageSelection === true}
                onClick={() =>
                  updateFormatSection(activeKey, {
                    aiImageSelection: !activeSection.aiImageSelection,
                  })
                }
              />
            ) : null}
          </fieldset>
        </div>
      </aside>

      <SlideshowFormatPreviewStage
        className={cn(
          "min-h-0 flex-1 md:flex-none",
          mobileView === "design" && "hidden md:block"
        )}
        onExitPreview={() => setMobileView("design")}
        previewItems={previewItems}
        activeTab={activeTab}
        activeTextItem={activeTextItem}
        selectedTextIndex={selectedTextIndex}
        activePreviewIndex={activePreviewIndex}
        previewSlotWidths={previewSlotWidths}
        previewSlotHeights={previewSlotHeights}
        previewGap={previewGap}
        previewTrackOffset={previewTrackOffset}
        zoom={previewZoom}
        onZoomChange={setPreviewZoom}
        onSelectPreview={(index, tab) => {
          setActivePreview(index)
          setActiveTab(tab)
          setSelectedTextIndex(null)
        }}
        onSelectPreviewText={(index, tab, textIndex) => {
          setActivePreview(index)
          setActiveTab(tab)
          setSelectedTextIndex(textIndex)
        }}
        onClearTextSelection={() => setSelectedTextIndex(null)}
        onTransformPreviewText={(index, tab, textIndex, patch) => {
          setActivePreview(index)
          setActiveTab(tab)
          setSelectedTextIndex(textIndex)
          updateSchema((current) =>
            updateAutomationTextItemAt(
              current,
              tab.toLowerCase() as AutomationFormatRole,
              textIndex,
              patch
            )
          )
        }}
        updateTextItem={updateTextItem}
        onDeleteTextItem={deleteSelectedTextItem}
        onAddTextItem={addTextItem}
        visualControlsLocked={Boolean(activeVisualPreset)}
      />
    </div>
  )
}
