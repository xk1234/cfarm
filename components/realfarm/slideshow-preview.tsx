"use client"

import { useRef, useState } from "react"
import type * as React from "react"
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconWand, IconX } from "@tabler/icons-react"
import { Ban, ChevronRight as LucideChevronRight, Folder, Grid2X2, ImagePlus, Search as LucideSearch, Trash2, X as LucideX } from "lucide-react"

import { EditorPopupMenu, EditorPopupOption } from "@/components/ui/editor-popup"
import { Button } from "@/components/ui/button"
import { SwitchPill } from "@/components/ui/form-controls"
import { AvatarDot, PinterestPreviewTile, SlideThumb, ToolPill } from "@/components/realfarm/shared-media"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

export function readRecentPinterestSearches() {
  if (typeof window === "undefined") {
    return []
  }

  const storedSearches = window.localStorage.getItem("reelfarm:pinterest-recent")
  if (!storedSearches) {
    return []
  }

  try {
    const parsed = JSON.parse(storedSearches) as unknown
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 6)
      : []
  } catch {
    return []
  }
}

export type SlideshowTextElement = {
  id: string
  text: string
  x: number
  y: number
  font: string
  color: string
  size: string
}

export type SlideshowLayoutOption = "single" | "1:2" | "1:3" | "2:1" | "2:2"

export type SlideshowPreviewSlideRecord = {
  id: string
  image: PinterestSearchResult
  text: string
  duration: number
  aspectRatio: string
  layout: SlideshowLayoutOption
  textElements: SlideshowTextElement[]
  isPlaceholder?: boolean
}

export type ExportedSlideshow = {
  id: string
  title: string
  createdAt: string | null
  slides: SlideshowPreviewSlideRecord[]
}

export function SlideshowPreviewSlide({
  slide,
  relatedImages,
  active,
  index,
  zoom,
  selectedTextId,
  onSelectText,
  onMoveText,
  onAddImage,
  onDurationChange,
  onAspectRatioChange,
  onLayoutChange,
  onDeleteSlide,
}: {
  slide: SlideshowPreviewSlideRecord
  relatedImages: PinterestSearchResult[]
  active: boolean
  index: number
  zoom: number
  selectedTextId: string | null
  onSelectText: (id: string) => void
  onMoveText: (id: string, position: { x: number; y: number }) => void
  onAddImage: () => void
  onDurationChange: (duration: number) => void
  onAspectRatioChange: (aspectRatio: string) => void
  onLayoutChange: (layout: SlideshowLayoutOption) => void
  onDeleteSlide: () => void
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [openMenu, setOpenMenu] = useState<"duration" | "aspect" | "layout" | null>(null)
  const frameWidth = 300 * zoom
  const frameAspect = ratioToCss(slide.aspectRatio)

  function startDrag(event: React.PointerEvent<HTMLButtonElement>, element: SlideshowTextElement) {
    if (!active) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onSelectText(element.id)
    if (!frameRef.current) {
      return
    }
    const frameElement = frameRef.current

    const pointerId = event.pointerId
    event.currentTarget.setPointerCapture(pointerId)

    function move(pointerEvent: PointerEvent) {
      const rect = frameElement.getBoundingClientRect()
      const x = Math.max(8, Math.min(92, ((pointerEvent.clientX - rect.left) / rect.width) * 100))
      const y = Math.max(10, Math.min(90, ((pointerEvent.clientY - rect.top) / rect.height) * 100))
      onMoveText(element.id, { x, y })
    }

    function stop() {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
    }

    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop, { once: true })
  }

  return (
    <div className="group relative">
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-[3px] bg-black shadow-sm transition-[width]"
        style={{ width: frameWidth, aspectRatio: frameAspect }}
      >
        <SlideImageLayout slide={slide} relatedImages={relatedImages} index={index} />
        {!slide.isPlaceholder && <div className="absolute inset-0 bg-black/18" />}
        {slide.textElements.map((element) => (
          <button
            key={element.id}
            className={cn(
              "font-tiktok absolute max-w-[84%] -translate-x-1/2 -translate-y-1/2 cursor-move rounded-[3px] px-2 py-1 text-center font-bold leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,.85)]",
              textColorClass(element.color),
              element.id === selectedTextId && active && "outline outline-2 outline-[#4f91ff]"
            )}
            style={{
              left: `${element.x}%`,
              top: `${element.y}%`,
              fontSize: element.size,
            }}
            onPointerDown={(event) => startDrag(event, element)}
            onClick={(event) => {
              event.stopPropagation()
              onSelectText(element.id)
            }}
          >
            {element.text}
          </button>
        ))}
      </div>
      {active && (
        <div className="relative mt-2 flex justify-center gap-2">
          <ToolPill icon={ImagePlus} onClick={onAddImage} label="Replace image" />
          <ToolPill icon={Ban} label="No overlay" />
          <ToolPill label={`${slide.duration}s`} onClick={() => setOpenMenu(openMenu === "duration" ? null : "duration")} />
          <ToolPill label={slide.aspectRatio} onClick={() => setOpenMenu(openMenu === "aspect" ? null : "aspect")} />
          <ToolPill icon={Grid2X2} onClick={() => setOpenMenu(openMenu === "layout" ? null : "layout")} label="Layout" />
          <ToolPill icon={Trash2} danger onClick={onDeleteSlide} label="Delete slide" />
          {openMenu === "duration" && (
            <EditorPopupMenu className="left-1/2 top-10 -translate-x-1/2">
              {[2, 3, 4, 5, 6].map((duration) => (
                <EditorPopupOption
                  key={duration}
                  active={slide.duration === duration}
                  onClick={() => {
                    onDurationChange(duration)
                    setOpenMenu(null)
                  }}
                >
                  {duration}s
                </EditorPopupOption>
              ))}
            </EditorPopupMenu>
          )}
          {openMenu === "aspect" && (
            <EditorPopupMenu className="left-1/2 top-10 -translate-x-1/2">
              {["9:16", "4:5", "3:4", "1:1", "16:9"].map((ratio) => (
                <EditorPopupOption
                  key={ratio}
                  active={slide.aspectRatio === ratio}
                  onClick={() => {
                    onAspectRatioChange(ratio)
                    setOpenMenu(null)
                  }}
                >
                  {ratio}
                </EditorPopupOption>
              ))}
            </EditorPopupMenu>
          )}
          {openMenu === "layout" && (
            <EditorPopupMenu className="left-1/2 top-10 -translate-x-1/2 min-w-[190px]">
              {[
                ["single", "Single image"],
                ["1:2", "1:2 (2 rows)"],
                ["1:3", "1:3 (3 rows)"],
                ["2:1", "2:1 (2 cols)"],
                ["2:2", "2:2 (4 grid)"],
              ].map(([value, label]) => (
                <EditorPopupOption
                  key={value}
                  active={slide.layout === value}
                  onClick={() => {
                    onLayoutChange(value as SlideshowLayoutOption)
                    setOpenMenu(null)
                  }}
                >
                  {label}
                </EditorPopupOption>
              ))}
            </EditorPopupMenu>
          )}
        </div>
      )}
    </div>
  )
}

function SlideImageLayout({
  slide,
  relatedImages,
  index,
}: {
  slide: SlideshowPreviewSlideRecord
  relatedImages: PinterestSearchResult[]
  index: number
}) {
  const images = [slide.image, ...relatedImages.filter((image) => image.id !== slide.image.id)]
  const tile = (image: PinterestSearchResult | undefined, tileIndex: number) =>
    image ? <PinterestPreviewTile image={image} index={index + tileIndex} fit="cover" className="h-full rounded-none" /> : <SlideThumb index={tileIndex} className="h-full rounded-none" />

  if (slide.isPlaceholder) {
    return <DefaultSlideTile className="h-full rounded-none" />
  }

  if (slide.layout === "1:2") {
    return <div className="grid h-full grid-rows-2">{[0, 1].map((item) => <div key={item} className="overflow-hidden">{tile(images[item], item)}</div>)}</div>
  }
  if (slide.layout === "1:3") {
    return <div className="grid h-full grid-rows-3">{[0, 1, 2].map((item) => <div key={item} className="overflow-hidden">{tile(images[item], item)}</div>)}</div>
  }
  if (slide.layout === "2:1") {
    return <div className="grid h-full grid-cols-2">{[0, 1].map((item) => <div key={item} className="overflow-hidden">{tile(images[item], item)}</div>)}</div>
  }
  if (slide.layout === "2:2") {
    return <div className="grid h-full grid-cols-2 grid-rows-2">{[0, 1, 2, 3].map((item) => <div key={item} className="overflow-hidden">{tile(images[item], item)}</div>)}</div>
  }

  return tile(slide.image, 0)
}

export function DefaultSlideTile({ className }: { className?: string }) {
  return (
    <div className={cn("grid place-items-center rounded-[8px] bg-[#d9d9d4] text-[#8f8e87]", className)}>
      <ImagePlus className="size-8 opacity-60" />
    </div>
  )
}

export function ratioToCss(ratio: string) {
  const [width, height] = ratio.split(":").map(Number)
  if (!width || !height) {
    return "3 / 4"
  }
  return `${width} / ${height}`
}

export function ratioHeightMultiplier(ratio: string) {
  const [width, height] = ratio.split(":").map(Number)
  if (!width || !height) {
    return 4 / 3
  }
  return height / width
}

export function SlideshowImagePickerModal({
  collections,
  recentSearches,
  onClose,
  onSelect,
}: {
  collections: CreatedImageCollection[]
  recentSearches: string[]
  onClose: () => void
  onSelect: (image: PinterestSearchResult) => void
}) {
  const [mode, setMode] = useState<"search" | "collections">("search")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PinterestSearchResult[]>([])
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const [error, setError] = useState("")

  async function searchPinterest(event?: React.FormEvent<HTMLFormElement>, queryOverride = query) {
    event?.preventDefault()
    const trimmedQuery = queryOverride.trim()
    if (!trimmedQuery) {
      return
    }

    setStatus("loading")
    setError("")
    setMode("search")
    try {
      const response = await fetch("/api/pinterest/search?limit=24", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([{ query: trimmedQuery, apiKey: "", trim: true, mode: "search" }]),
      })
      const payload = (await response.json()) as { results?: PinterestSearchResult[]; error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? "Pinterest search failed")
      }
      setResults(payload.results ?? [])
      setStatus("idle")
    } catch (searchError) {
      setStatus("error")
      setError(searchError instanceof Error ? searchError.message : "Pinterest search failed")
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/45 p-4">
      <section className="grid h-[76vh] w-full max-w-[980px] overflow-hidden rounded-[14px] bg-white shadow-2xl md:grid-cols-[260px_1fr]">
        <aside className="border-r border-[#e4e3dc] bg-[#f7f7f4] p-5">
          <button className={cn("mb-4 flex w-full items-center justify-between text-left text-[18px] font-semibold", mode === "search" ? "text-[#111]" : "text-[#85847d]")} onClick={() => setMode("search")}>
            <span className="flex items-center gap-3"><LucideSearch className="size-5" />Search Pinterest</span>
            <LucideChevronRight className="size-5" />
          </button>
          <button className={cn("flex w-full items-center gap-3 text-left text-[18px] font-semibold", mode === "collections" ? "text-[#111]" : "text-[#85847d]")} onClick={() => setMode("collections")}>
            <Folder className="size-5" />
            My Collections
          </button>
        </aside>
        <div className="relative overflow-y-auto p-8">
          <button className="absolute right-5 top-5 grid size-9 place-items-center rounded-full text-[#55544f] hover:bg-[#f1f0eb]" onClick={onClose} aria-label="Close image picker">
            <LucideX className="size-7" />
          </button>
          {mode === "search" ? (
            <div className="mx-auto max-w-[680px] pt-24">
              <h2 className="mb-8 text-center text-[34px] font-bold">Search Pinterest for images</h2>
              <form className="flex h-14 items-center rounded-full border border-[#e0dfd7] bg-white px-5 shadow-sm" onSubmit={searchPinterest}>
                <LucideSearch className="mr-3 size-6 text-[#9aa1ad]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search Pinterest"
                  className="min-w-0 flex-1 bg-transparent text-[20px] outline-none placeholder:text-[#77766f]"
                />
                <button className="text-[16px] font-semibold text-[#85847d]">Search</button>
              </form>
              {recentSearches.length > 0 && results.length === 0 && status !== "loading" && (
                <div className="mt-8 space-y-2">
                  {recentSearches.slice(0, 4).map((recent) => (
                    <button
                      key={recent}
                      className="h-11 w-full rounded-full bg-[#f6f6f4] px-5 text-left text-[20px] text-[#4e5868]"
                      onClick={() => {
                        setQuery(recent)
                        void searchPinterest(undefined, recent)
                      }}
                    >
                      {recent}
                    </button>
                  ))}
                </div>
              )}
              {status === "loading" && (
                <div className="mt-8 grid grid-cols-3 gap-3">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <div key={index} className="h-32 animate-pulse rounded-[8px] bg-[#edede8]" />
                  ))}
                </div>
              )}
              {status === "error" && <div className="mt-6 rounded-[8px] bg-red-50 p-3 text-[13px] font-semibold text-red-700">{error}</div>}
              {results.length > 0 && (
                <div className="mt-8 grid grid-cols-3 gap-3">
                  {results.map((image, index) => (
                    <button key={image.id} className="overflow-hidden rounded-[8px] bg-[#edede8] text-left shadow-sm" onClick={() => onSelect(image)}>
                      <PinterestPreviewTile image={image} index={index} className="h-40" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="pt-12">
              <h2 className="mb-6 text-[26px] font-bold">My Collections</h2>
              <div className="space-y-7">
                {collections.map((collection) => (
                  <section key={collection.id}>
                    <h3 className="mb-3 text-[16px] font-semibold">{collection.title}</h3>
                    {collection.images.length > 0 ? (
                      <div className="grid grid-cols-4 gap-3">
                        {collection.images.slice(0, 16).map((image, index) => (
                          <button key={image.id} className="overflow-hidden rounded-[8px] bg-[#edede8] shadow-sm" onClick={() => onSelect(image)}>
                            <PinterestPreviewTile image={image} index={index} className="h-32" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-[8px] bg-[#f4f4f0] p-5 text-[14px] font-semibold text-[#85847d]">No images in this collection</div>
                    )}
                  </section>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export function TextElementToolbar({
  element,
  activeIndex,
  total,
  onChange,
  onDelete,
}: {
  element: SlideshowTextElement
  activeIndex: number
  total: number
  onChange: (patch: Partial<SlideshowTextElement>) => void
  onDelete: () => void
}) {
  const fontOptions = ["Default", "Bebas Neue", "Elegance", "Elegance Italic"]
  const colorOptions = [
    "Outline",
    "White Text",
    "Black Text",
    "Yellow Text",
    "White Background",
    "White 50% Background",
    "Black Background",
    "Black 50% Background",
    "Light Pink",
    "Muted Red",
    "Navy Blue",
  ]
  const sizeOptions = ["6px", "8px", "10px", "12px", "14px", "16px", "18px", "20px", "24px"]

  return (
    <div className="absolute bottom-[104px] left-1/2 flex w-[calc(100%-48px)] max-w-[760px] -translate-x-1/2 flex-col gap-3 rounded-[14px] bg-white p-4 shadow-sm">
      <input
        className="w-full truncate bg-transparent text-center text-[14px] font-medium text-[#34332f] outline-none"
        value={element.text}
        onChange={(event) => onChange({ text: event.target.value })}
      />
      <div className="flex items-center gap-3">
        <button className="grid size-9 place-items-center rounded-[8px] text-[#4d4c47] hover:bg-[#f1f0eb]" aria-label="Previous text element">
          <IconChevronLeft className="size-5" />
        </button>
        <div className="w-12 text-center text-[14px] font-semibold text-[#77766f]">{activeIndex}/{total}</div>
        <button className="grid size-9 place-items-center rounded-[8px] text-[#b9b8b1] hover:bg-[#f1f0eb]" aria-label="Next text element">
          <IconChevronRight className="size-5" />
        </button>
        <label className="flex h-12 min-w-[190px] items-center gap-3 rounded-[9px] border border-[#ecebe4] px-4">
          <span className="text-[24px] font-serif">T</span>
          <select className="min-w-0 flex-1 bg-transparent text-[16px] font-semibold outline-none" value={element.font} onChange={(event) => onChange({ font: event.target.value })}>
            {fontOptions.map((option) => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label className="flex h-12 min-w-[250px] items-center gap-3 rounded-[9px] border border-[#66a8ff] px-4 ring-2 ring-[#d9ebff]">
          <span className="grid size-5 place-items-center rounded-full border border-[#bfc0c2]">◌</span>
          <select className="min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none" value={element.color} onChange={(event) => onChange({ color: event.target.value })}>
            {colorOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <label className="flex h-12 min-w-[126px] items-center gap-3 rounded-[9px] border border-[#ecebe4] px-4">
          <span className="text-[18px]">↙</span>
          <select className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold outline-none" value={element.size} onChange={(event) => onChange({ size: event.target.value })}>
            {sizeOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
        <button className="ml-auto grid size-12 place-items-center rounded-[9px] bg-[#f24858] text-white" onClick={onDelete} aria-label="Delete text element">
          <IconTrash className="size-5" />
        </button>
      </div>
    </div>
  )
}

export function HookSelectorModal({
  hooks,
  selectedHook,
  onSelect,
  onClose,
}: {
  hooks: string[]
  selectedHook: string
  onSelect: (hook: string) => void
  onClose: () => void
}) {
  const orderedHooks = [...hooks].reverse()

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/45 p-4">
      <section className="flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] bg-[#f6f6f2] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e5e4dc] px-5 py-4">
          <h2 className="text-[20px] font-semibold">Horizontal Girl (@audrey.kins)</h2>
          <div className="flex items-center gap-2 text-[20px] font-medium text-[#77766f]">
            {hooks.length} Hooks
            <button onClick={onClose} aria-label="Close hooks">
              <IconX className="size-6" />
            </button>
          </div>
        </div>
        <div className="space-y-3 overflow-y-auto p-5">
          {orderedHooks.map((hook, index) => {
            const selected = hook === selectedHook
            return (
              <button
                key={hook}
                className="relative flex min-h-[64px] w-full items-center rounded-[14px] bg-white px-4 text-left shadow-sm"
                onClick={() => onSelect(hook)}
              >
                <span className="w-9 shrink-0 text-[14px] font-medium text-[#b0afa8]">{orderedHooks.length - index}</span>
                <span className="flex-1 px-4 text-center text-[15px] font-medium leading-5 text-[#34332f]">{hook}</span>
                <span className="flex gap-3 text-[#9a9991]">
                  <span>↙</span>
                  <IconTrash className="size-4" />
                </span>
                {selected && (
                  <span className="absolute -bottom-3 left-0 rounded-[8px] bg-white px-3 py-1 text-[12px] font-semibold shadow-sm">⌄ Selected</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="p-5 pt-0">
          <Button className="h-12 w-full rounded-[9px] bg-[#474747] text-[15px] font-semibold text-white hover:bg-[#3b3b3b]">
            <IconWand className="size-4" />
            10 new hooks
          </Button>
        </div>
      </section>
    </div>
  )
}

export function ExportedSlideshows({
  items,
  onQuickPublish,
}: {
  items: ExportedSlideshow[]
  onQuickPublish: () => void
}) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-center gap-5 text-[22px] font-semibold">
        <h2>Exported Slideshows <span className="text-[#77766f]">({items.length})</span></h2>
        <span className="text-[#b8b7af]">Drafts (0)</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-[#d9d8d0] bg-white/60 p-8 text-center text-[14px] font-medium text-[#77766f]">
          No exported slideshows yet.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {items.map((item, index) => {
            const firstSlide = item.slides[0]

            return (
              <article key={item.id} className="w-[190px] shrink-0">
                <div className="relative h-[276px] overflow-hidden rounded-[7px] bg-black">
                  <div className="absolute left-2 top-2 z-10">
                    <AvatarDot name="Audrey" index={index} className="size-6 border border-white" />
                  </div>
                  {firstSlide && (
                    <>
                      <PinterestPreviewTile image={firstSlide.image} index={index} className="absolute inset-x-0 top-[82px] h-[112px] rounded-none" />
                      <div className="font-tiktok absolute inset-x-8 top-[126px] text-center text-[9px] font-bold leading-tight text-yellow-100 drop-shadow">
                        {firstSlide.textElements[0]?.text ?? item.title}
                      </div>
                    </>
                  )}
                </div>
                <button className="mt-2 h-8 w-full rounded-[8px] bg-white text-[12px] font-semibold text-[#4d4c47] shadow-sm" onClick={onQuickPublish}>
                  ⌁ Quick publish
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

export function QuickPublishModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/45 p-4">
      <section className="w-full max-w-[560px] rounded-[14px] bg-white p-6 shadow-2xl">
        <h2 className="text-[26px] font-semibold">Quick publish to TikTok?</h2>
        <p className="mt-4 text-[19px] font-medium text-[#77766f]">Uses your automation&apos;s TikTok settings</p>
        <div className="mt-6 flex items-center gap-4 rounded-[9px] bg-[#f4f4f2] p-4">
          <AvatarDot name="Audrey" index={2} className="size-12" />
          <div>
            <div className="text-[18px] font-semibold">audrey.kins</div>
            <div className="text-[16px] font-medium text-[#77766f]">@audrey.kins</div>
          </div>
        </div>
        <div className="mt-8 flex items-center justify-between text-[18px] font-semibold">
          Publish as draft
          <SwitchPill enabled />
        </div>
        <div className="mt-8 flex justify-end gap-3">
          <Button variant="outline" className="h-12 rounded-[10px] bg-white px-8 text-[17px] font-semibold" onClick={onClose}>Cancel</Button>
          <Button className="h-12 rounded-[10px] bg-[#ff5626] px-8 text-[17px] font-semibold text-white hover:bg-[#ed4d22]" onClick={onClose}>Publish as draft</Button>
        </div>
      </section>
    </div>
  )
}

function textColorClass(color: string) {
  switch (color) {
    case "Black Text":
      return "text-black"
    case "Yellow Text":
      return "text-yellow-100"
    case "White Background":
      return "bg-white text-black"
    case "White 50% Background":
      return "bg-white/50 text-black"
    case "Black Background":
      return "bg-black text-white"
    case "Black 50% Background":
      return "bg-black/50 text-white"
    case "Outline":
    case "White Text":
    default:
      return "text-white"
  }
}
