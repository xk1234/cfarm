"use client"

import { useMemo, useState } from "react"
import {
  IconArrowDown,
  IconArrowUp,
  IconCopy,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"

import { CollectionSelector } from "@/components/realfarm/collection-selector"
import { ControlToggle } from "@/components/realfarm/shared-media"
import { SelectLike } from "@/components/ui/form-controls"
import {
  aspectRatioLabel,
  automationAspectRatios,
  automationImageGrids,
  automationSlideDesigns,
  defaultAutomationTextItem,
  imageGridLabel,
  labelToAspectRatio,
  labelToImageGrid,
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
  const [selectedTextIndex, setSelectedTextIndex] = useState<number | null>(0)
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
    () => (design ? designPreviewItem(design, collection) : null),
    [collection, design]
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
      : newSlideDesign(id, designs.length + 1)
    save([...designs, next])
    setSelectedId(id)
    setSelectedTextIndex(0)
  }

  function removeDesign() {
    if (!design || designs.length <= 1) return
    const next = designs.filter((item) => item.id !== design.id)
    save(next)
    setSelectedId(next[Math.min(selectedIndex, next.length - 1)]?.id ?? "")
    setSelectedTextIndex(0)
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
    <div className="grid min-h-full bg-[#b9b9b6] lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="min-h-0 border-r border-app-panel-border bg-app-surface-subtle lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
        <div className="flex items-center justify-between border-b border-app-panel-border px-4 py-3">
          <h2 className="text-[15px] font-bold text-app-text">Slide designs</h2>
          <button
            type="button"
            className="lc-focus-ring grid size-8 place-items-center rounded-lg border border-app-panel-border bg-app-surface text-app-text"
            onClick={() => addDesign()}
            aria-label="Add slide design"
          >
            <IconPlus className="size-4" />
          </button>
        </div>

        <div className="space-y-2 border-b border-app-panel-border p-3">
          {designs.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left",
                item.id === design.id
                  ? "border-app-strong bg-app-surface shadow-sm"
                  : "border-transparent text-app-text-soft hover:bg-app-surface"
              )}
              onClick={() => {
                setSelectedId(item.id)
                setSelectedTextIndex(0)
              }}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#ecebe5] text-[12px] font-bold">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                {item.name}
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-4 p-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="grid size-8 place-items-center rounded-lg border border-app-panel-border bg-app-surface disabled:opacity-35"
              disabled={selectedIndex === 0}
              onClick={() => moveDesign(-1)}
              aria-label="Move slide design up"
            >
              <IconArrowUp className="size-4" />
            </button>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-lg border border-app-panel-border bg-app-surface disabled:opacity-35"
              disabled={selectedIndex === designs.length - 1}
              onClick={() => moveDesign(1)}
              aria-label="Move slide design down"
            >
              <IconArrowDown className="size-4" />
            </button>
            <button
              type="button"
              className="ml-auto grid size-8 place-items-center rounded-lg border border-app-panel-border bg-app-surface"
              onClick={() => addDesign(design)}
              aria-label="Duplicate slide design"
            >
              <IconCopy className="size-4" />
            </button>
            <button
              type="button"
              className="grid size-8 place-items-center rounded-lg border border-[#ead1d1] bg-app-surface text-[#c54b4b] disabled:opacity-35"
              disabled={designs.length <= 1}
              onClick={removeDesign}
              aria-label="Delete slide design"
            >
              <IconTrash className="size-4" />
            </button>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-app-muted-text">
              Name
            </span>
            <input
              className="h-9 w-full rounded-lg border border-app-panel-border bg-app-surface px-3 text-[13px] font-semibold outline-none"
              value={design.name}
              onChange={(event) => updateDesign({ name: event.target.value })}
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-app-muted-text">
              When to use this design
            </span>
            <textarea
              className="h-20 w-full resize-none rounded-lg border border-app-panel-border bg-app-surface p-3 text-[12px] font-medium outline-none"
              value={design.instructions}
              onChange={(event) =>
                updateDesign({ instructions: event.target.value })
              }
              placeholder="Opening claim, explanation, list item, final thought…"
            />
          </label>

          <CollectionSelector
            label="Image collection"
            collection={collection}
            collections={photoCollections}
            showPictures={false}
            onChange={(collectionId) => updateDesign({ collectionId })}
            onCreateCollection={onCreateCollection}
          />

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

          <div className="grid grid-cols-2 gap-2">
            <SelectLike
              value={aspectRatioLabel(design.aspect_ratio)}
              options={automationAspectRatios.map(aspectRatioLabel)}
              onChange={(value) =>
                updateDesign({ aspect_ratio: labelToAspectRatio(value) })
              }
            />
            <SelectLike
              value={imageGridLabel(design.imageGrid)}
              options={automationImageGrids.map(imageGridLabel)}
              onChange={(value) =>
                updateDesign({ imageGrid: labelToImageGrid(value) })
              }
            />
          </div>

          <ControlToggle
            label="Display text"
            enabled={!design.noText}
            onClick={() => updateDesign({ noText: !design.noText })}
          />
          <ControlToggle
            label="Dark overlay"
            enabled={design.overlay}
            onClick={() => updateDesign({ overlay: !design.overlay })}
          />
          <ControlToggle
            label="AI image matching"
            enabled={design.aiImageSelection === true}
            onClick={() =>
              updateDesign({ aiImageSelection: !design.aiImageSelection })
            }
          />
        </div>
      </aside>

      <main className="flex min-h-[620px] min-w-0 flex-col items-center justify-center gap-5 overflow-auto p-6 lg:min-h-0">
        <AutomationFormatPreviewCard
          item={previewItem}
          index={selectedIndex}
          active
          compact
          slotWidth={320}
          zoom={1}
          selectedTextIndex={selectedTextIndex}
          onSelect={() => setSelectedTextIndex(null)}
          onSelectText={setSelectedTextIndex}
          onClearTextSelection={() => setSelectedTextIndex(null)}
          onTransformText={(textIndex, patch) => {
            setSelectedTextIndex(textIndex)
            updateDesign({
              textItems: design.textItems.map((item, itemIndex) =>
                itemIndex === textIndex ? { ...item, ...patch } : item
              ),
            })
          }}
          onAddText={addTextItem}
        />
        {!design.noText ? (
          <div className="w-full max-w-[640px] overflow-hidden rounded-xl">
            <AutomationFormatTextToolbar
              mode="Content"
              layout="inline"
              textItem={textItem}
              updateTextItem={updateTextItem}
              onDelete={deleteTextItem}
              onAdd={addTextItem}
              locked={Boolean(activePreset)}
            />
          </div>
        ) : null}
      </main>
    </div>
  )
}

function newSlideDesign(id: string, index: number): AutomationSlideDesign {
  return {
    id,
    name: `Slide ${index}`,
    instructions: "",
    collectionId: "",
    textItems: [defaultAutomationTextItem()],
    aspect_ratio: "4:5",
    imageGrid: "none",
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
    aspect_ratio: section.aspect_ratio,
    imageGrid: section.imageGrid,
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
  collection?: CreatedImageCollection
): AutomationFormatPreviewItem {
  return {
    id: design.id,
    role: "content",
    tab: "Content",
    label: design.name,
    section: slideDesignSection(design),
    image: collection?.images[0],
    images: collection?.images ?? [],
    overlayImages: [],
    text: design.textItems[0]?.staticText || design.name,
    textItem: design.textItems[0] ?? defaultAutomationTextItem(),
    textItems: design.textItems,
  }
}
