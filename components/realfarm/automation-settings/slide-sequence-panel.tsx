"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  IconAdjustments,
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconFocusCentered,
  IconMinus,
  IconPointer,
  IconPlus,
  IconTrash,
  IconTypography,
} from "@tabler/icons-react"

import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { ControlToggle } from "@/components/realfarm/shared-media"
import { SelectLike } from "@/components/ui/form-controls"
import {
  automationSlideDesigns,
  defaultAutomationTextItem,
  schemaWithAutomationSlideDesigns,
  type AutomationFormatSection,
  type AutomationSchema,
  type AutomationSlideDesign,
  type TextItem,
} from "@/lib/realfarm-automation"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import { cn } from "@/lib/utils"
import {
  applySlideshowVisualPreset,
  slideshowVisualPresetById,
  slideshowVisualPresets,
} from "@/lib/slideshow-visual-presets"

import { AutomationFormatPreviewCard } from "./format-preview-card"
import { AutomationFormatTextToolbar } from "./format-text-toolbar"
import type { AutomationFormatPreviewItem } from "./format-helpers"

export function SlideSequencePanel({
  config,
  collections,
  onCreateCollection,
  onConfigChange,
}: {
  config: AutomationSchema
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onConfigChange: (config: AutomationSchema) => void
}) {
  const designs = automationSlideDesigns(config)
  const [selectedId, setSelectedId] = useState(() => designs[0]?.id ?? "")
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(
    null
  )
  const [inspectorTab, setInspectorTab] = useState<"design" | "text">("design")
  const [canvasZoom, setCanvasZoom] = useState(1)
  const selectedIndex = Math.max(
    0,
    designs.findIndex((design) => design.id === selectedId)
  )
  const design = designs[selectedIndex] ?? designs[0]
  const photoCollections = collections.filter(
    (collection) => collection.mediaType !== "video"
  )
  const collection = design
    ? findCollectionByIdOrAlias(photoCollections, design.collectionId)
    : undefined
  const previewItem = useMemo(
    () =>
      design ? designPreviewItem(design, collection, selectedIndex) : null,
    [collection, design, selectedIndex]
  )
  const textItem =
    design?.textItems[selectedTextIndex ?? 0] ?? defaultAutomationTextItem()
  const activePreset = slideshowVisualPresetById(design?.visualPresetId)

  function save(nextDesigns: AutomationSlideDesign[]) {
    onConfigChange(schemaWithAutomationSlideDesigns(config, nextDesigns))
  }

  function updateDesign(patch: Partial<AutomationSlideDesign>) {
    if (!design) return
    save(
      designs.map((item) =>
        item.id === design.id ? { ...item, ...patch, id: item.id } : item
      )
    )
  }

  function addDesign(source?: AutomationSlideDesign) {
    const id = `slide-design-${crypto.randomUUID()}`
    const next = source
      ? {
          ...structuredClone(source),
          id,
          name: `Slide ${designs.length + 1}`,
          textItems: source.textItems.map((item) => ({
            ...item,
            id: `text-${crypto.randomUUID()}`,
          })),
        }
      : newSlideDesign(id, designs.length + 1, {
          aspectRatio: design?.aspect_ratio ?? config.aspect_ratio,
          imageGrid: design?.imageGrid ?? "none",
        })
    save([...designs, next])
    setSelectedId(id)
    setSelectedTextIndex(null)
    setInspectorTab("design")
  }

  function removeDesign() {
    if (!design || designs.length <= 1) return
    const next = designs.filter((item) => item.id !== design.id)
    save(next)
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id ?? "")
    setSelectedTextIndex(null)
    setInspectorTab("design")
  }

  function moveDesign(offset: -1 | 1) {
    if (!design) return
    const target = selectedIndex + offset
    if (target < 0 || target >= designs.length) return
    const next = [...designs]
    ;[next[selectedIndex], next[target]] = [next[target], next[selectedIndex]]
    save(next)
  }

  function updateTextItem(patch: Partial<TextItem>) {
    if (!design) return
    const index = selectedTextIndex ?? 0
    updateDesign({
      textItems: design.textItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    })
  }

  function addTextItem() {
    if (!design) return
    const id = `text-${crypto.randomUUID()}`
    updateDesign({
      textItems: [
        ...design.textItems,
        defaultAutomationTextItem({ id, positionY: 66 }),
      ],
    })
    setSelectedTextIndex(design.textItems.length)
    setInspectorTab("text")
  }

  function deleteTextItem() {
    if (!design || selectedTextIndex === null) return
    const next = design.textItems.filter(
      (_, index) => index !== selectedTextIndex
    )
    updateDesign({
      textItems: next.length > 0 ? next : [defaultAutomationTextItem()],
    })
    setSelectedTextIndex(0)
  }

  function applyPreset(name: string) {
    if (!design) return
    const preset = slideshowVisualPresets.find((item) => item.name === name)
    if (!preset) {
      updateDesign({ visualPresetId: undefined })
      return
    }
    const section = applySlideshowVisualPreset(
      slideDesignSection(design),
      preset
    )
    updateDesign({
      ...designPatchFromSection(section),
      visualPresetId: preset.id,
    })
  }

  if (!design || !previewItem) return null

  return (
    <div className="grid h-full min-h-[680px] min-w-0 bg-[#d7d7d3] lg:min-h-0 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
      <aside className="flex min-h-0 flex-col border-b border-app-panel-border bg-[#f7f7f5] lg:border-r lg:border-b-0">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-app-panel-border px-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-bold text-app-text">Slides</h2>
            <span className="rounded-md bg-[#e9e9e5] px-1.5 py-0.5 text-[10px] font-bold text-app-muted-text tabular-nums">
              {designs.length}
            </span>
          </div>
          <button
            type="button"
            className="lc-focus-ring grid size-8 place-items-center rounded-md text-app-text-soft transition hover:bg-app-control-hover"
            onClick={() => addDesign()}
            aria-label="Add slide design"
            title="Add slide"
          >
            <IconPlus className="size-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-2 lg:block lg:space-y-1 lg:overflow-y-auto">
          {designs.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex min-w-40 items-center gap-2.5 rounded-md border px-2.5 py-2 text-left transition lg:w-full lg:min-w-0",
                item.id === design.id
                  ? "border-[#9bbcf0] bg-[#edf4ff] text-[#174b91]"
                  : "border-transparent text-app-text-soft hover:bg-[#ecece9]"
              )}
              onClick={() => {
                setSelectedId(item.id)
                setSelectedTextIndex(null)
                setInspectorTab("design")
              }}
              aria-current={item.id === design.id ? "true" : undefined}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded text-[11px] font-bold tabular-nums",
                  item.id === design.id ? "bg-white" : "bg-[#e8e8e4]"
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                Slide {index + 1}
              </span>
            </button>
          ))}
        </div>

        <div className="flex h-12 shrink-0 items-center gap-1 border-t border-app-panel-border px-2">
          <CanvasIconButton
            label="Move slide up"
            disabled={selectedIndex === 0}
            onClick={() => moveDesign(-1)}
          >
            <IconArrowUp className="size-4" />
          </CanvasIconButton>
          <CanvasIconButton
            label="Move slide down"
            disabled={selectedIndex === designs.length - 1}
            onClick={() => moveDesign(1)}
          >
            <IconArrowDown className="size-4" />
          </CanvasIconButton>
          <span className="flex-1" />
          <CanvasIconButton
            label="Duplicate slide"
            onClick={() => addDesign(design)}
          >
            <IconCopy className="size-4" />
          </CanvasIconButton>
          <CanvasIconButton
            label="Delete slide"
            danger
            disabled={designs.length <= 1}
            onClick={removeDesign}
          >
            <IconTrash className="size-4" />
          </CanvasIconButton>
        </div>
      </aside>

      <main className="relative flex min-h-[580px] min-w-0 flex-col overflow-hidden bg-[#d7d7d3] lg:min-h-0">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-black/10 bg-[#eeeeeb] px-3">
          <div className="flex h-8 items-center gap-2 rounded-md bg-white px-2.5 text-[12px] font-semibold text-app-text shadow-sm ring-1 ring-black/7">
            <IconPointer className="size-4 text-[#3478d4]" />
            Select
          </div>
          <span className="text-[11px] font-semibold text-app-text-faint">
            {design.aspect_ratio}
          </span>
          <span className="flex-1" />
          <CanvasIconButton
            label="Zoom out"
            disabled={canvasZoom <= 0.65}
            onClick={() =>
              setCanvasZoom((value) => Math.max(0.65, value - 0.1))
            }
          >
            <IconMinus className="size-4" />
          </CanvasIconButton>
          <button
            type="button"
            className="h-8 min-w-14 rounded-md px-2 text-[11px] font-bold text-app-text-soft tabular-nums hover:bg-white"
            onClick={() => setCanvasZoom(1)}
            aria-label="Reset canvas zoom"
            title="Reset zoom"
          >
            {Math.round(canvasZoom * 100)}%
          </button>
          <CanvasIconButton
            label="Zoom in"
            disabled={canvasZoom >= 1.5}
            onClick={() => setCanvasZoom((value) => Math.min(1.5, value + 0.1))}
          >
            <IconPlus className="size-4" />
          </CanvasIconButton>
          <CanvasIconButton label="Fit canvas" onClick={() => setCanvasZoom(1)}>
            <IconFocusCentered className="size-4" />
          </CanvasIconButton>
        </div>

        <div
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8"
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return
            event.preventDefault()
            setCanvasZoom((value) =>
              Math.max(0.65, Math.min(1.5, value - event.deltaY * 0.002))
            )
          }}
        >
          <AutomationFormatPreviewCard
            item={previewItem}
            index={selectedIndex}
            active
            showLabel={false}
            slotWidth={430}
            zoom={canvasZoom}
            selectedTextIndex={selectedTextIndex}
            onSelect={() => {
              setSelectedTextIndex(null)
              setInspectorTab("design")
            }}
            onSelectText={(textIndex) => {
              setSelectedTextIndex(textIndex)
              setInspectorTab("text")
            }}
            onClearTextSelection={() => {
              setSelectedTextIndex(null)
              setInspectorTab("design")
            }}
            onTransformText={(textIndex, patch) => {
              setSelectedTextIndex(textIndex)
              setInspectorTab("text")
              updateDesign({
                textItems: design.textItems.map((item, itemIndex) =>
                  itemIndex === textIndex ? { ...item, ...patch } : item
                ),
              })
            }}
            onAddText={addTextItem}
          />
        </div>

        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md bg-black/68 px-3 py-1.5 text-[10px] font-medium whitespace-nowrap text-white/90 backdrop-blur-sm">
          Drag text to move · side handles resize · ⌘/Ctrl + scroll zooms
        </div>
      </main>

      <aside className="flex min-h-0 flex-col border-t border-app-panel-border bg-[#f7f7f5] lg:border-t-0 lg:border-l">
        <div
          className="grid h-12 shrink-0 grid-cols-2 border-b border-app-panel-border p-1.5"
          role="tablist"
          aria-label="Slide inspector"
        >
          <InspectorTab
            active={inspectorTab === "design"}
            label="Design"
            onClick={() => {
              setInspectorTab("design")
              setSelectedTextIndex(null)
            }}
          >
            <IconAdjustments className="size-4" />
          </InspectorTab>
          <InspectorTab
            active={inspectorTab === "text"}
            label="Text"
            onClick={() => {
              setInspectorTab("text")
              setSelectedTextIndex((current) => current ?? 0)
            }}
          >
            <IconTypography className="size-4" />
          </InspectorTab>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {inspectorTab === "design" ? (
            <div className="space-y-5">
              <InspectorSection title="Slide">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-app-muted-text">
                    Usage
                  </span>
                  <textarea
                    className="h-20 w-full resize-none rounded-md border border-app-panel-border bg-white p-3 text-[12px] font-medium transition outline-none placeholder:text-app-text-faint focus:border-[#6d9fe1] focus:ring-2 focus:ring-[#6d9fe1]/15"
                    value={design.instructions}
                    onChange={(event) =>
                      updateDesign({ instructions: event.target.value })
                    }
                    placeholder="Opening claim, explanation, list item…"
                  />
                </label>
              </InspectorSection>

              <InspectorSection title="Media">
                <CollectionSelector
                  label="Image collection"
                  collection={collection}
                  collections={photoCollections}
                  showPictures={false}
                  onChange={(collectionId) => updateDesign({ collectionId })}
                  onCreateCollection={onCreateCollection}
                />
                <ControlToggle
                  label="AI image matching"
                  enabled={design.aiImageSelection === true}
                  onClick={() =>
                    updateDesign({
                      aiImageSelection: !design.aiImageSelection,
                    })
                  }
                />
              </InspectorSection>

              <InspectorSection title="Layout">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-app-muted-text">
                    Visual preset
                  </span>
                  <SelectLike
                    value={activePreset?.name ?? "Custom"}
                    options={[
                      "Custom",
                      ...slideshowVisualPresets.map((preset) => preset.name),
                    ]}
                    onChange={applyPreset}
                  />
                </label>
                <ControlToggle
                  label="Dark overlay"
                  enabled={design.overlay}
                  onClick={() => updateDesign({ overlay: !design.overlay })}
                />
              </InspectorSection>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {design.textItems.map((item, index) => (
                  <button
                    key={item.id ?? index}
                    type="button"
                    className={cn(
                      "max-w-full truncate rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition",
                      selectedTextIndex === index
                        ? "border-[#8bb3ea] bg-[#edf4ff] text-[#174b91]"
                        : "border-app-panel-border bg-white text-app-text-soft hover:bg-app-control-hover"
                    )}
                    onClick={() => setSelectedTextIndex(index)}
                  >
                    {item.staticText ||
                      item.contentDirection ||
                      `Text ${index + 1}`}
                  </button>
                ))}
                <button
                  type="button"
                  className="grid size-7 place-items-center rounded-md border border-app-panel-border bg-white text-app-text-soft hover:bg-app-control-hover"
                  onClick={addTextItem}
                  aria-label="Add text layer"
                  title="Add text layer"
                >
                  <IconPlus className="size-3.5" />
                </button>
              </div>
              <div className="rounded-md bg-[#ecece8] px-3 py-2 text-[11px] leading-4 font-medium text-app-muted-text">
                Select text on the canvas, then drag it or resize it with the
                side handles.
              </div>
              <AutomationFormatTextToolbar
                mode="Content"
                layout="inspector"
                textItem={textItem}
                updateTextItem={updateTextItem}
                onDelete={deleteTextItem}
                onAdd={addTextItem}
                locked={Boolean(activePreset)}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function CanvasIconButton({
  children,
  label,
  danger = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "lc-focus-ring grid size-8 place-items-center rounded-md transition disabled:pointer-events-none disabled:opacity-30",
        danger
          ? "text-[#b33f3f] hover:bg-[#f8eaea]"
          : "text-app-text-soft hover:bg-white"
      )}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

function InspectorTab({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean
  children: ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md text-[12px] font-semibold transition",
        active
          ? "bg-white text-app-text shadow-sm ring-1 ring-black/7"
          : "text-app-text-faint hover:text-app-text"
      )}
      onClick={onClick}
    >
      {children}
      {label}
    </button>
  )
}

function InspectorSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <section className="space-y-3 border-b border-app-panel-border pb-5 last:border-b-0 last:pb-0">
      <h3 className="text-[11px] font-bold tracking-[0.08em] text-app-text-faint uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function newSlideDesign(
  id: string,
  index: number,
  layout: {
    aspectRatio: AutomationSlideDesign["aspect_ratio"]
    imageGrid: AutomationSlideDesign["imageGrid"]
  }
): AutomationSlideDesign {
  return {
    id,
    name: `Slide ${index}`,
    instructions: "",
    collectionId: "",
    textItems: [defaultAutomationTextItem()],
    aspect_ratio: layout.aspectRatio,
    imageGrid: layout.imageGrid,
    noText: false,
    overlay: true,
    aiImageSelection: false,
    imageMode: "collection",
  }
}

function slideDesignSection(
  design: AutomationSlideDesign
): AutomationFormatSection {
  return {
    ...design,
    id: "body",
    slideCount: 1,
  }
}

function designPatchFromSection(
  section: AutomationFormatSection
): Partial<AutomationSlideDesign> {
  return {
    textItems: section.textItems,
    noText: section.noText,
    overlay: section.overlay,
    aiImageSelection: section.aiImageSelection,
    overlayImage: section.overlayImage,
    imageMode: section.imageMode,
    visualPresetId: section.visualPresetId,
  }
}

function designPreviewItem(
  design: AutomationSlideDesign,
  collection: CreatedImageCollection | undefined,
  index: number
): AutomationFormatPreviewItem {
  return {
    id: design.id,
    role: "content",
    tab: "Content",
    label: `Slide ${index + 1}`,
    section: slideDesignSection(design),
    image: collection?.images[0],
    images: collection?.images ?? [],
    overlayImages: [],
    text: design.textItems[0]?.staticText || "Slide text",
    textItem: design.textItems[0] ?? defaultAutomationTextItem(),
    textItems: design.textItems,
  }
}
