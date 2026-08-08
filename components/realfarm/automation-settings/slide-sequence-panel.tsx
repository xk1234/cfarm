"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronRight,
  IconCopy,
  IconFocusCentered,
  IconMinus,
  IconPalette,
  IconPhoto,
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

type EditorPanel = "content" | "media" | "text" | "appearance"

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
  const [activePanel, setActivePanel] = useState<EditorPanel>("content")
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
    setActivePanel("content")
  }

  function removeDesign() {
    if (!design || designs.length <= 1) return
    const next = designs.filter((item) => item.id !== design.id)
    save(next)
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id ?? "")
    setSelectedTextIndex(null)
    setActivePanel("content")
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
    setActivePanel("text")
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

  function duplicateTextItem() {
    if (!design || selectedTextIndex === null) return
    const source = design.textItems[selectedTextIndex]
    if (!source) return
    const nextItem = {
      ...source,
      id: `text-${crypto.randomUUID()}`,
      positionX: Math.min(100, (source.positionX ?? 50) + 3),
      positionY: Math.min(100, (source.positionY ?? 45) + 3),
    }
    const nextItems = [...design.textItems]
    nextItems.splice(selectedTextIndex + 1, 0, nextItem)
    updateDesign({ textItems: nextItems })
    setSelectedTextIndex(selectedTextIndex + 1)
    setActivePanel("text")
  }

  function moveTextItem(offset: -1 | 1) {
    if (!design || selectedTextIndex === null) return
    const target = selectedTextIndex + offset
    if (target < 0 || target >= design.textItems.length) return
    const nextItems = [...design.textItems]
    ;[nextItems[selectedTextIndex], nextItems[target]] = [
      nextItems[target],
      nextItems[selectedTextIndex],
    ]
    updateDesign({ textItems: nextItems })
    setSelectedTextIndex(target)
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
    <div className="flex h-full min-h-[760px] min-w-0 flex-col bg-[#d7d7d3] lg:grid lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)_112px]">
      <aside className="flex max-h-[380px] min-h-0 flex-col border-b border-app-panel-border bg-[#f7f7f5] lg:row-span-2 lg:max-h-none lg:border-r lg:border-b-0">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-app-panel-border px-4">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[13px] font-bold text-app-text">
              Slide {selectedIndex + 1} properties
            </h2>
            <span className="shrink-0 rounded bg-[#e8e8e4] px-1.5 py-0.5 text-[9px] font-bold text-app-text-faint tabular-nums">
              {design.aspect_ratio}
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <EditorPanelSection
            title="Content"
            icon={<IconPointer className="size-4" />}
            open={activePanel === "content"}
            onToggle={() => setActivePanel("content")}
          >
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-app-muted-text">
                Usage
              </span>
              <textarea
                className="h-28 w-full resize-none rounded-md border border-app-panel-border bg-white p-3 text-[12px] leading-5 font-medium transition outline-none placeholder:text-app-text-faint focus:border-[#6d9fe1] focus:ring-2 focus:ring-[#6d9fe1]/15"
                value={design.instructions}
                onChange={(event) =>
                  updateDesign({ instructions: event.target.value })
                }
                placeholder="Opening claim, explanation, list item…"
              />
            </label>
          </EditorPanelSection>

          <EditorPanelSection
            title="Images"
            icon={<IconPhoto className="size-4" />}
            open={activePanel === "media"}
            onToggle={() => setActivePanel("media")}
          >
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
          </EditorPanelSection>

          <EditorPanelSection
            title="Text"
            icon={<IconTypography className="size-4" />}
            open={activePanel === "text"}
            onToggle={() => {
              setActivePanel("text")
              setSelectedTextIndex((current) => current ?? 0)
            }}
          >
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
            <AutomationFormatTextToolbar
              mode="Content"
              layout="inspector"
              textItem={textItem}
              updateTextItem={updateTextItem}
              onDelete={deleteTextItem}
              onAdd={addTextItem}
              locked={Boolean(activePreset)}
            />
          </EditorPanelSection>

          <EditorPanelSection
            title="Appearance"
            icon={<IconPalette className="size-4" />}
            open={activePanel === "appearance"}
            onToggle={() => setActivePanel("appearance")}
          >
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
          </EditorPanelSection>
        </div>
      </aside>

      <main className="relative flex min-h-[560px] min-w-0 flex-col overflow-hidden bg-[#d7d7d3] lg:min-h-0">
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-black/15 bg-[#242423] px-3 text-white">
          <div className="mr-2 flex h-8 items-center gap-2 rounded bg-white/12 px-2.5 text-[12px] font-semibold">
            <IconPointer className="size-4 text-[#83b8ff]" />
            Select
          </div>
          {selectedTextIndex !== null ? (
            <>
              <span className="mr-1 hidden text-[11px] font-semibold text-white/50 sm:inline">
                Text {selectedTextIndex + 1}
              </span>
              <CanvasIconButton
                dark
                label="Move text backward"
                disabled={selectedTextIndex === 0}
                onClick={() => moveTextItem(-1)}
              >
                <IconArrowDown className="size-4" />
              </CanvasIconButton>
              <CanvasIconButton
                dark
                label="Move text forward"
                disabled={selectedTextIndex === design.textItems.length - 1}
                onClick={() => moveTextItem(1)}
              >
                <IconArrowUp className="size-4" />
              </CanvasIconButton>
              <CanvasIconButton
                dark
                label="Duplicate text"
                onClick={duplicateTextItem}
              >
                <IconCopy className="size-4" />
              </CanvasIconButton>
              <CanvasIconButton
                dark
                danger
                label="Delete text"
                onClick={deleteTextItem}
              >
                <IconTrash className="size-4" />
              </CanvasIconButton>
            </>
          ) : null}
          <span className="flex-1" />
          <span className="text-[11px] font-semibold text-white/48">
            {design.aspect_ratio}
          </span>
        </div>

        <div
          className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8 sm:p-10"
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
              setActivePanel("content")
            }}
            onSelectText={(textIndex) => {
              setSelectedTextIndex(textIndex)
              setActivePanel("text")
            }}
            onClearTextSelection={() => {
              setSelectedTextIndex(null)
            }}
            onTransformText={(textIndex, patch) => {
              setSelectedTextIndex(textIndex)
              setActivePanel("text")
              updateDesign({
                textItems: design.textItems.map((item, itemIndex) =>
                  itemIndex === textIndex ? { ...item, ...patch } : item
                ),
              })
            }}
            onAddText={addTextItem}
          />
        </div>

        <div className="absolute right-4 bottom-4 flex h-11 items-center rounded-full bg-[#222]/94 px-2 text-white shadow-lg">
          <CanvasIconButton
            dark
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
            className="h-8 min-w-14 rounded-md px-2 text-[11px] font-bold text-white/88 tabular-nums hover:bg-white/10"
            onClick={() => setCanvasZoom(1)}
            aria-label="Reset canvas zoom"
            title="Reset zoom"
          >
            {Math.round(canvasZoom * 100)}%
          </button>
          <CanvasIconButton
            dark
            label="Fit canvas"
            onClick={() => setCanvasZoom(1)}
          >
            <IconFocusCentered className="size-4" />
          </CanvasIconButton>
          <CanvasIconButton
            dark
            label="Zoom in"
            disabled={canvasZoom >= 1.5}
            onClick={() => setCanvasZoom((value) => Math.min(1.5, value + 0.1))}
          >
            <IconPlus className="size-4" />
          </CanvasIconButton>
        </div>
      </main>

      <footer className="flex h-28 shrink-0 items-center gap-2 border-t border-app-panel-border bg-[#f7f7f5] px-3">
        <div className="mr-1 flex shrink-0 flex-col items-center gap-1">
          <button
            type="button"
            className="lc-focus-ring grid size-9 place-items-center rounded-md border border-app-panel-border bg-white text-app-text shadow-sm transition hover:bg-app-control-hover"
            onClick={() => addDesign()}
            aria-label="Add slide design"
            title="Add slide"
          >
            <IconPlus className="size-4" />
          </button>
          <span className="text-[9px] font-bold text-app-text-faint uppercase">
            Add
          </span>
        </div>
        <div
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto py-2"
          aria-label="Slides"
        >
          {designs.map((item, index) => {
            const itemCollection = findCollectionByIdOrAlias(
              photoCollections,
              item.collectionId
            )
            const itemPreview = designPreviewItem(item, itemCollection, index)
            return (
              <div
                key={item.id}
                className={cn(
                  "relative flex h-[86px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-[#deddd8] transition",
                  item.id === design.id
                    ? "border-[#3f7fc9] shadow-sm"
                    : "border-transparent hover:border-black/20"
                )}
              >
                <AutomationFormatPreviewCard
                  item={itemPreview}
                  index={index}
                  active={false}
                  compact
                  showLabel={false}
                  slotWidth={64}
                  zoom={1}
                  selectedTextIndex={null}
                  onSelect={() => {
                    setSelectedId(item.id)
                    setSelectedTextIndex(null)
                    setActivePanel("content")
                  }}
                  onSelectText={() => undefined}
                  onClearTextSelection={() => undefined}
                  onTransformText={() => undefined}
                />
                <span className="pointer-events-none absolute bottom-1 left-1 grid size-4 place-items-center rounded bg-black/65 text-[9px] font-bold text-white tabular-nums">
                  {index + 1}
                </span>
              </div>
            )
          })}
        </div>
        <div className="ml-1 flex shrink-0 items-center gap-0.5 border-l border-app-panel-border pl-2">
          <CanvasIconButton
            label="Move slide left"
            disabled={selectedIndex === 0}
            onClick={() => moveDesign(-1)}
          >
            <IconArrowUp className="size-4 -rotate-90" />
          </CanvasIconButton>
          <CanvasIconButton
            label="Move slide right"
            disabled={selectedIndex === designs.length - 1}
            onClick={() => moveDesign(1)}
          >
            <IconArrowDown className="size-4 -rotate-90" />
          </CanvasIconButton>
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
      </footer>
    </div>
  )
}

function CanvasIconButton({
  children,
  label,
  danger = false,
  dark = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode
  label: string
  danger?: boolean
  dark?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={cn(
        "lc-focus-ring grid size-8 place-items-center rounded-md transition disabled:pointer-events-none disabled:opacity-30",
        dark
          ? danger
            ? "text-[#ff8b82] hover:bg-white/10"
            : "text-white/68 hover:bg-white/10 hover:text-white"
          : danger
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

function EditorPanelSection({
  children,
  icon,
  open,
  label,
  title,
  onToggle,
}: {
  children: ReactNode
  icon: ReactNode
  open: boolean
  label?: string
  title: string
  onToggle: () => void
}) {
  return (
    <section className="border-b border-app-panel-border">
      <button
        type="button"
        className={cn(
          "flex h-12 w-full items-center gap-2.5 px-4 text-left text-[13px] font-semibold transition",
          open
            ? "bg-[#ecece8] text-app-text"
            : "text-app-text-soft hover:bg-[#efefec] hover:text-app-text"
        )}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={open ? "text-[#2f73bd]" : "text-app-text-faint"}>
          {icon}
        </span>
        <span className="flex-1">{title}</span>
        {label ? (
          <span className="text-[10px] font-semibold text-app-text-faint">
            {label}
          </span>
        ) : null}
        <IconChevronRight
          className={cn("size-4 transition-transform", open && "rotate-90")}
        />
      </button>
      {open ? <div className="space-y-4 p-4">{children}</div> : null}
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
