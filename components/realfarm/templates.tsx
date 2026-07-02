"use client"

import { useMemo, useState } from "react"
import { IconPlus, IconSearch, IconX } from "@tabler/icons-react"

import { PinterestPreviewTile, SlideThumb } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import { CheckedDropdownButton } from "@/components/ui/form-controls"
import { automationCreatedAt } from "@/lib/realfarm-automation"
import type { Automation, RealFarmData } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

type TemplateSortOption = "Newest" | "Oldest" | "A → Z" | "Z → A"
const templateSortOptions: TemplateSortOption[] = ["Newest", "Oldest", "A → Z", "Z → A"]

export function TemplateFolderModal({
  data,
  onClose,
  onCreateBlank,
  onUseTemplate,
}: {
  data: RealFarmData
  onClose: () => void
  onCreateBlank: () => void
  onUseTemplate: (automation: Automation) => void
}) {
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState<TemplateSortOption>("Newest")
  const [selectedTemplate, setSelectedTemplate] = useState<Automation | null>(null)
  const templates = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.automations
      .map((automation, index) => ({ automation, index }))
      .filter(({ automation }) => automation.name.toLowerCase().includes(query))
      .sort((a, b) => {
        if (sort === "Oldest") {
          return automationCreatedAt(a.automation, a.index) - automationCreatedAt(b.automation, b.index)
        }
        if (sort === "A → Z") {
          return a.automation.name.localeCompare(b.automation.name)
        }
        if (sort === "Z → A") {
          return b.automation.name.localeCompare(a.automation.name)
        }
        return automationCreatedAt(b.automation, b.index) - automationCreatedAt(a.automation, a.index)
      })
      .map(({ automation }) => automation)
  }, [data.automations, search, sort])

  if (selectedTemplate) {
    return (
      <TemplateViewer
        data={data}
        automation={selectedTemplate}
        onBack={() => setSelectedTemplate(null)}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/45 p-4">
      <section className="max-h-[86vh] w-full max-w-[840px] overflow-hidden rounded-[10px] bg-white shadow-2xl">
        <div className="border-b border-[#deddd7] bg-white">
          <div className="flex h-[58px] items-center gap-3 px-3">
            <button className="grid size-8 place-items-center rounded-[6px] text-[#34332f] hover:bg-[#f1f0eb]" onClick={onClose} aria-label="Close templates">
              <IconX className="size-5" />
            </button>
            <label className="relative min-w-0 flex-1">
              <IconSearch className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[#65645f]" />
              <input
                className="h-10 w-full rounded-[10px] border border-[#d5d4ce] bg-white pl-10 pr-3 text-[15px] font-medium outline-none placeholder:text-[#aaa9a2]"
                placeholder="Search templates..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                autoFocus
              />
            </label>
          </div>
        </div>

        <div className="max-h-[calc(86vh-58px)] overflow-y-auto px-3 pb-6 pt-2">
          <div className="mb-5 flex items-end justify-between">
            <button className="border-b-2 border-[#242421] pb-2 text-[14px] font-semibold">Templates</button>
            <div className="flex items-center gap-2">
              <CheckedDropdownButton
                value={sort}
                options={templateSortOptions}
                onChange={(value) => setSort(value as TemplateSortOption)}
              />
              <Button variant="action" size="appDefault" className="rounded-[11px] px-5 text-[14px] font-semibold" onClick={onCreateBlank}>
                <IconPlus className="size-4" />
                Create
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((automation, index) => (
              <TemplateCard
                key={automation.id}
                automation={automation}
                images={data.defaultCollections.backgrounds.images.slice(index, index + 4)}
                hooks={data.editor.slides.map((slide) => slide.text)}
                index={index}
                featured={index === 0}
                onOpen={() => setSelectedTemplate(automation)}
                onAdd={() => onUseTemplate(automation)}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function TemplateCard({
  automation,
  images,
  hooks,
  index,
  featured,
  onOpen,
  onAdd,
}: {
  automation: Automation
  images: PinterestSearchResult[]
  hooks: string[]
  index: number
  featured?: boolean
  onOpen: () => void
  onAdd: () => void
}) {
  return (
    <article className="group relative h-[160px] overflow-hidden rounded-[10px] bg-black shadow-sm">
      <TemplatePreviewStrip images={images} hooks={hooks} index={index} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/5" />
      <div className="absolute bottom-3 left-3 right-3 truncate text-[16px] font-bold text-white">{automation.name}</div>
      <div className={cn("absolute inset-0 flex items-center justify-center gap-2 transition", featured ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
        <button className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[15px] font-bold text-[#242421] shadow-sm" onClick={onOpen}>
          <IconSearch className="size-5" />
          Open
        </button>
        <button className="inline-flex h-10 items-center gap-2 rounded-full bg-[#ff5626] px-4 text-[15px] font-bold text-white shadow-sm" onClick={onAdd}>
          <IconPlus className="size-5" />
          Add
        </button>
      </div>
    </article>
  )
}

function TemplatePreviewStrip({
  images,
  hooks,
  index,
}: {
  images: PinterestSearchResult[]
  hooks: string[]
  index: number
}) {
  return (
    <div className="grid h-full grid-cols-3">
      {[0, 1, 2].map((tileIndex) => {
        const image = images[tileIndex % Math.max(images.length, 1)]
        return (
          <div key={tileIndex} className="relative overflow-hidden">
            {image ? (
              <PinterestPreviewTile image={image} index={index + tileIndex} className="h-full rounded-none" />
            ) : (
              <SlideThumb index={index + tileIndex} className="h-full rounded-none" />
            )}
            <div className="absolute inset-0 bg-black/20" />
            <div className="font-tiktok absolute inset-x-5 top-[38%] text-center text-[10px] font-bold leading-tight text-yellow-100 drop-shadow">
              {hooks.length > 0 ? hooks[(index + tileIndex) % hooks.length] : "high-level skills to acquire in your 20s"}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TemplateViewer({
  data,
  automation,
  onBack,
}: {
  data: RealFarmData
  automation: Automation
  onBack: () => void
}) {
  const slideshowSets = useMemo(() => {
    const images = data.defaultCollections.backgrounds.images
    return [0, 2, 4].map((offset) =>
      Array.from({ length: 6 }, (_, index) => images[(offset + index) % Math.max(images.length, 1)]).filter(Boolean)
    )
  }, [data.defaultCollections.backgrounds.images])
  const slideshowOptions = slideshowSets.map((_, index) => `Slideshow ${index + 1}`)
  const [selectedSlideshow, setSelectedSlideshow] = useState(slideshowOptions[0] ?? "Slideshow 1")
  const [activeSlide, setActiveSlide] = useState(0)
  const selectedSlideshowIndex = Math.max(0, slideshowOptions.indexOf(selectedSlideshow))
  const slides = slideshowSets[selectedSlideshowIndex] ?? []
  const visibleStart = Math.min(Math.max(activeSlide - 1, 0), Math.max(slides.length - 3, 0))
  const visibleSlides = slides.slice(visibleStart, visibleStart + 3)
  const hooks = data.editor.slides.map((slide) => slide.text)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#24251f]/45 p-4">
      <section className="h-[620px] w-full max-w-[760px] overflow-hidden rounded-[10px] bg-[#b9b9b6] shadow-2xl">
        <header className="flex h-[60px] items-center justify-between border-b border-[#d7d6d0] bg-white px-2">
          <div className="flex items-center gap-3">
            <button className="grid size-8 place-items-center rounded-[5px] text-[#77766f] hover:bg-[#f1f0eb]" onClick={onBack} aria-label="Back to templates">
              <IconX className="size-5" />
            </button>
            <h2 className="text-[18px] font-semibold">{automation.name}</h2>
          </div>
          <CheckedDropdownButton
            value={selectedSlideshow}
            options={slideshowOptions}
            className="min-w-[124px]"
            onChange={(value) => {
              setSelectedSlideshow(value)
              setActiveSlide(0)
            }}
          />
        </header>
        <main className="relative flex h-[560px] items-center justify-center overflow-hidden">
          <div className="flex items-center gap-4">
            {visibleSlides.map((image, index) => {
              const absoluteIndex = visibleStart + index
              return (
                <div
                  key={image.id}
                  className={cn(
                    "relative h-[356px] w-[200px] shrink-0 cursor-pointer overflow-hidden rounded-[9px] bg-black shadow-xl transition duration-300",
                    absoluteIndex === activeSlide ? "opacity-100 ring-2 ring-white" : "opacity-45"
                  )}
                  onClick={() => setActiveSlide(absoluteIndex)}
                >
                  <PinterestPreviewTile image={image} index={absoluteIndex} className="h-full rounded-none" />
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="font-tiktok absolute inset-x-8 top-[45%] text-center text-[15px] font-bold leading-tight text-yellow-100 drop-shadow">
                    {hooks.length > 0 ? hooks[absoluteIndex % hooks.length] : "high-level skills to acquire in your 20s"}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="absolute bottom-[86px] flex gap-2">
            {slides.map((_, dot) => (
              <button
                key={dot}
                className={cn("size-2 rounded-full", dot === activeSlide ? "bg-white" : "bg-white/55")}
                onClick={() => setActiveSlide(dot)}
                aria-label={`Show slide ${dot + 1}`}
              />
            ))}
          </div>
        </main>
      </section>
    </div>
  )
}
