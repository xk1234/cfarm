"use client"

import {
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuClipboard,
  LuCodeXml,
  LuSearch,
} from "react-icons/lu"
import Image from "next/image"
import { useMemo, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export type AssetTemplateDirection = {
  label: string
  description: string
  constraint?: string
}

export type AssetTemplateSection = {
  id: string
  title: string
  description: string
  directions: AssetTemplateDirection[]
}

export type AssetTemplateExampleSlide = {
  id: string
  imageUrl: string
  text: string
  aspectRatio?: string
}

export type AssetTemplateExample = {
  id: string
  label: string
  slides: AssetTemplateExampleSlide[]
}

export type AssetTemplateCatalogItem = {
  id: string
  name: string
  eyebrow: string
  description: string
  styleBrief?: string
  metadata: string[]
  sectionsLabel: string
  sections: AssetTemplateSection[]
  examples?: AssetTemplateExample[]
  settings: unknown
}

export function AutomationTemplateCatalog({
  items,
  emptyMessage = "No templates are available.",
}: {
  items: AssetTemplateCatalogItem[]
  emptyMessage?: string
}) {
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? "")
  const [slideIndexById, setSlideIndexById] = useState<Record<string, number>>(
    {}
  )
  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items
    return items.filter((item) =>
      [item.name, item.eyebrow, item.description, ...item.metadata]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    )
  }, [items, query])
  const activeItem =
    filteredItems.find((item) => item.id === selectedId) ??
    filteredItems[0] ??
    items[0]

  if (!activeItem) {
    return (
      <div className="not-prose my-8 rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  const examples = activeItem.examples ?? []

  function selectItem(id: string) {
    setSelectedId(id)
  }

  function changeSlide(
    exampleId: string,
    currentIndex: number,
    slideCount: number,
    direction: -1 | 1
  ) {
    if (slideCount < 2) return
    const stateKey = `${activeItem.id}:${exampleId}`
    setSlideIndexById((current) => ({
      ...current,
      [stateKey]: (currentIndex + direction + slideCount) % slideCount,
    }))
  }

  return (
    <section className="not-prose my-8 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
      <div className="grid min-h-[680px] lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-border bg-muted/35 p-4 lg:border-r lg:border-b-0">
          <label className="relative block">
            <span className="sr-only">Search templates</span>
            <LuSearch
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates"
              className="h-10 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <div className="mt-3 flex max-h-[610px] gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-y-auto lg:pb-0">
            {filteredItems.map((item) => {
              const selected = item.id === activeItem.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectItem(item.id)}
                  className={cn(
                    "min-w-[210px] rounded-lg px-3 py-2.5 text-left transition lg:min-w-0",
                    selected
                      ? "bg-foreground text-background shadow-sm"
                      : "text-foreground hover:bg-background"
                  )}
                >
                  <span className="block truncate text-sm font-semibold">
                    {item.name}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-xs",
                      selected ? "text-background/70" : "text-muted-foreground"
                    )}
                  >
                    {item.eyebrow}
                  </span>
                </button>
              )
            })}
            {filteredItems.length === 0 ? (
              <p className="px-2 py-4 text-sm text-muted-foreground">
                No templates match “{query}”.
              </p>
            ) : null}
          </div>
        </aside>

        <article className="min-w-0 p-5 sm:p-7">
          <header className="border-b border-border pb-5">
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              {activeItem.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {activeItem.name}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {activeItem.description}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {activeItem.metadata.map((value) => (
                <span
                  key={value}
                  className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground"
                >
                  {value}
                </span>
              ))}
            </div>
          </header>

          {activeItem.styleBrief ? (
            <section className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Automation direction
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {activeItem.styleBrief}
              </p>
            </section>
          ) : null}

          {examples.length > 0 ? (
            <section
              className="mt-7"
              aria-labelledby="example-heading"
              data-testid="template-examples"
            >
              <div>
                <h3
                  id="example-heading"
                  className="text-lg font-semibold text-foreground"
                >
                  Example slideshows
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  All {examples.length} curated examples. Use the arrow buttons
                  to move through each slideshow.
                </p>
              </div>

              <div className="mt-4 grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {examples.map((example, examplePosition) => {
                  const stateKey = `${activeItem.id}:${example.id}`
                  const slideIndex =
                    (slideIndexById[stateKey] ?? 0) %
                    Math.max(1, example.slides.length)
                  const slide = example.slides[slideIndex]
                  if (!slide) return null
                  return (
                    <article
                      key={example.id}
                      className="overflow-hidden rounded-xl border border-border bg-background"
                      data-testid="template-example"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {example.label ||
                              `Example slideshow ${examplePosition + 1}`}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Slide {slideIndex + 1} of {example.slides.length}
                          </p>
                        </div>
                        {example.slides.length > 1 ? (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <IconButton
                              label={`Previous slide in ${example.label}`}
                              onClick={() =>
                                changeSlide(
                                  example.id,
                                  slideIndex,
                                  example.slides.length,
                                  -1
                                )
                              }
                            >
                              <LuChevronLeft
                                aria-hidden="true"
                                className="size-4"
                              />
                            </IconButton>
                            <IconButton
                              label={`Next slide in ${example.label}`}
                              onClick={() =>
                                changeSlide(
                                  example.id,
                                  slideIndex,
                                  example.slides.length,
                                  1
                                )
                              }
                            >
                              <LuChevronRight
                                aria-hidden="true"
                                className="size-4"
                              />
                            </IconButton>
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center justify-center bg-muted/35 p-3">
                        <FullSlideImage
                          key={slide.id}
                          src={slide.imageUrl}
                          alt={slide.text || `${activeItem.name} example`}
                          fallbackAspectRatio={slide.aspectRatio}
                        />
                      </div>
                      <div className="border-t border-border px-3 py-3">
                        <p className="text-xs font-semibold text-foreground">
                          Rendered text or image caption
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {slide.text ||
                            "This example slide has no stored text or caption."}
                        </p>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          <section className="mt-8" aria-labelledby="content-map-heading">
            <h3
              id="content-map-heading"
              className="text-lg font-semibold text-foreground"
            >
              {activeItem.sectionsLabel}
            </h3>
            <div className="mt-3 space-y-3">
              {activeItem.sections.map((section, sectionIndex) => (
                <div
                  key={section.id}
                  className="rounded-xl border border-border bg-background p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground font-mono text-xs font-semibold text-background">
                      {sectionIndex + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-foreground">
                        {section.title}
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {section.description}
                      </p>
                      {section.directions.length > 0 ? (
                        <ul className="mt-3 space-y-2">
                          {section.directions.map((direction) => (
                            <li
                              key={`${section.id}-${direction.label}`}
                              className="rounded-lg bg-muted/45 px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-foreground">
                                  {direction.label}
                                </span>
                                {direction.constraint ? (
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {direction.constraint}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                {direction.description}
                              </p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-xs text-muted-foreground">
                          No generated text direction for this step.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <JsonViewer value={activeItem.settings} />
        </article>
      </div>
    </section>
  )
}

function cssAspectRatio(value?: string) {
  const [width, height] = (value || "9:16").split(":").map(Number)
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? `${width} / ${height}`
    : "9 / 16"
}

function FullSlideImage({
  src,
  alt,
  fallbackAspectRatio,
}: {
  src: string
  alt: string
  fallbackAspectRatio?: string
}) {
  const [naturalSize, setNaturalSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const displayRatio = naturalSize
    ? `${naturalSize.width} / ${naturalSize.height}`
    : cssAspectRatio(fallbackAspectRatio)
  const ratioLabel = naturalSize
    ? `${naturalSize.width}:${naturalSize.height}`
    : fallbackAspectRatio || "9:16"

  return (
    <div
      className="relative max-h-[560px] w-full max-w-[360px] overflow-hidden rounded-md shadow-sm"
      data-testid="template-example-slide"
      data-aspect-ratio={ratioLabel}
      style={{ aspectRatio: displayRatio }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        sizes="(max-width: 768px) 100vw, 360px"
        className="object-contain"
        onLoad={(event) => {
          const { naturalWidth: width, naturalHeight: height } =
            event.currentTarget
          if (width > 0 && height > 0) setNaturalSize({ width, height })
        }}
      />
    </div>
  )
}

function JsonViewer({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const json = useMemo(() => JSON.stringify(value, null, 2), [value])

  async function copyJson() {
    await navigator.clipboard.writeText(json)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="mt-8 overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <LuCodeXml aria-hidden="true" className="size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Settings JSON
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Canonical settings used to seed this automation.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyJson}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            {copied ? (
              <LuCheck aria-hidden="true" className="size-3.5" />
            ) : (
              <LuClipboard aria-hidden="true" className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="h-8 rounded-md bg-foreground px-3 text-xs font-semibold text-background hover:opacity-90"
          >
            {expanded ? "Collapse" : "View JSON"}
          </button>
        </div>
      </div>
      {expanded ? (
        <pre className="max-h-[620px] overflow-auto bg-[#111117] p-4 font-mono text-[12px] leading-5 whitespace-pre text-[#e8e8ef]">
          {json}
        </pre>
      ) : null}
    </section>
  )
}

function IconButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string
  onClick: () => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-full border border-border bg-background text-foreground shadow-sm hover:bg-muted",
        className
      )}
    >
      {children}
    </button>
  )
}
