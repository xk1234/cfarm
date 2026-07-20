import { useEffect, useRef, useState } from "react"
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronLeft,
} from "@tabler/icons-react"

import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { ControlToggle } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
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
  type AutomationTextItem,
} from "@/lib/realfarm-automation"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import type { Automation, LocalAsset } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

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
  const [previewZoom, setPreviewZoom] = useState(1)
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(
    null
  )
  const configRef = useRef(config)
  const onConfigChangeRef = useRef(onConfigChange)
  const undoStackRef = useRef<AutomationSchema[]>([])
  const redoStackRef = useRef<AutomationSchema[]>([])
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 })
  const activeKey = activeTab.toLowerCase() as "hook" | "content" | "cta"
  const activeSection = automationFormatSection(config, activeKey)
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
  const previewSlotWidths = previewItems.map((item) => {
    const size = formatPreviewCardSize(item.section.aspect_ratio, item.image)
    return size.width * previewBaseScale
  })
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

  function applyHistoryStep(direction: "undo" | "redo") {
    const source = direction === "undo" ? undoStackRef : redoStackRef
    const destination = direction === "undo" ? redoStackRef : undoStackRef
    const next = source.current.pop()
    if (!next) return
    destination.current.push(structuredClone(configRef.current))
    configRef.current = next
    setHistoryCounts({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    })
    onConfigChangeRef.current(next)
  }

  useEffect(() => {
    configRef.current = config
    onConfigChangeRef.current = onConfigChange
  }, [config, onConfigChange])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      const key = event.key.toLowerCase()
      if (key === "z" && event.shiftKey) {
        event.preventDefault()
        applyHistoryStep("redo")
        return
      }
      if (key === "z") {
        event.preventDefault()
        applyHistoryStep("undo")
        return
      }
      if (key === "y") {
        event.preventDefault()
        applyHistoryStep("redo")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

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
          onSave={onSave}
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
    const current = configRef.current
    const next = updater(current)
    undoStackRef.current.push(structuredClone(current))
    redoStackRef.current = []
    configRef.current = next
    setHistoryCounts({ undo: undoStackRef.current.length, redo: 0 })
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
      className="grid h-full min-h-0 min-w-0 bg-[#b9b9b6] md:grid-cols-[340px_minmax(0,1fr)]"
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
      <aside className="flex min-h-0 w-full min-w-0 flex-col bg-app-surface-subtle md:w-[340px] md:min-w-[340px]">
        <div className="flex h-12 items-center justify-between border-b border-app-panel-border px-3">
          <button
            className="flex items-center gap-2 text-[13px] font-semibold text-[#5d5c56]"
            onClick={onBack}
          >
            <IconChevronLeft className="size-4" />
            Back
          </button>
          <div className="flex items-center gap-1">
            <div className="flex items-center rounded-lg bg-[#efefeb] p-0.5">
              <button
                type="button"
                className="rounded-md p-1.5 text-[#5d5c56] transition-colors hover:bg-app-surface disabled:cursor-not-allowed disabled:opacity-30"
                disabled={historyCounts.undo === 0}
                onClick={() => applyHistoryStep("undo")}
                aria-label="Undo format change"
                title="Undo (Cmd/Ctrl+Z)"
              >
                <IconArrowBackUp className="size-4" />
              </button>
              <button
                type="button"
                className="rounded-md p-1.5 text-[#5d5c56] transition-colors hover:bg-app-surface disabled:cursor-not-allowed disabled:opacity-30"
                disabled={historyCounts.redo === 0}
                onClick={() => applyHistoryStep("redo")}
                aria-label="Redo format change"
                title="Redo (Cmd/Ctrl+Shift+Z)"
              >
                <IconArrowForwardUp className="size-4" />
              </button>
            </div>
          </div>
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
                <div
                  className={cn(
                    "mb-3 grid gap-2",
                    activeSection.slideCountMode === "varying"
                      ? "grid-cols-1"
                      : "grid-cols-[1fr_72px]"
                  )}
                >
                  <SelectLike
                    value={
                      activeSection.slideCountMode === "varying"
                        ? "Varying"
                        : "Static"
                    }
                    options={["Static", "Varying"]}
                    placement="bottom"
                    onChange={(value) =>
                      updateFormatSection("content", {
                        slideCountMode:
                          value === "Varying" ? "varying" : "static",
                        slideCountMin:
                          activeSection.slideCountMin ??
                          activeSection.slideCount,
                        slideCountMax:
                          activeSection.slideCountMax ??
                          activeSection.slideCount,
                      })
                    }
                  />
                  {activeSection.slideCountMode !== "varying" ? (
                    <input
                      className="h-8 rounded-[7px] border border-[#ebeae3] bg-app-surface px-2 text-center text-[12px] font-semibold outline-none"
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
                  ) : null}
                  {activeSection.slideCountMode === "varying" ? (
                    <div className="grid grid-cols-2 gap-2">
                      <SlideCountRangeInput
                        label="Minimum"
                        value={
                          activeSection.slideCountMin ??
                          activeSection.slideCount
                        }
                        onChange={(value) =>
                          updateFormatSection("content", {
                            slideCount: value,
                            slideCountMin: value,
                            slideCountMax: Math.max(
                              value,
                              activeSection.slideCountMax ?? value
                            ),
                          })
                        }
                      />
                      <SlideCountRangeInput
                        label="Maximum"
                        value={
                          activeSection.slideCountMax ??
                          activeSection.slideCount
                        }
                        onChange={(value) =>
                          updateFormatSection("content", {
                            slideCount: Math.min(
                              activeSection.slideCountMin ?? value,
                              value
                            ),
                            slideCountMin: Math.min(
                              activeSection.slideCountMin ?? value,
                              value
                            ),
                            slideCountMax: value,
                          })
                        }
                      />
                    </div>
                  ) : null}
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
        </div>

        <div className="border-t border-app-panel-border p-3">
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
        previewSlotWidths={previewSlotWidths}
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
        updateTextItem={updateTextItem}
        onDeleteTextItem={deleteSelectedTextItem}
        onAddTextItem={addTextItem}
      />
    </div>
  )
}

function SlideCountRangeInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label className="space-y-1 text-[11px] font-semibold text-app-muted-text">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={20}
        value={value}
        className="h-8 w-full rounded-[7px] border border-[#ebeae3] bg-app-surface px-2 text-center text-[12px] font-semibold outline-none"
        onChange={(event) =>
          onChange(Math.max(1, Number(event.target.value) || 1))
        }
      />
    </label>
  )
}
