"use client"

import { LuBraces, LuExpand, LuLockKeyhole, LuSearch } from "react-icons/lu"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { loadRandomCollectionImages } from "@/components/docs/collection-image-sources"
import {
  generateSlideshowSettingComparisons,
  type AtlasImageSource,
  type SlideSettingComparison,
  type SlideSettingExample,
  type SlideSettingImpact,
} from "@/lib/slide-renderer-experiments"
import { cn } from "@/lib/utils"

const categories = [
  "All",
  "Whole slideshow",
  "Slide media",
  "Text box",
] as const

export function SlideshowSettingAtlas() {
  const [imageSources, setImageSources] = useState<AtlasImageSource[]>([])
  const settings = useMemo(
    () => generateSlideshowSettingComparisons(imageSources),
    [imageSources]
  )
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<(typeof categories)[number]>("All")
  const [active, setActive] = useState<{
    setting: SlideSettingComparison
    example: SlideSettingExample
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    void loadRandomCollectionImages(controller.signal).then((sources) => {
      if (active && sources.length > 0) setImageSources(sources)
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [])
  const filtered = settings.filter((setting) => {
    const matchesCategory = category === "All" || setting.category === category
    const normalized = query.trim().toLowerCase()
    const matchesQuery =
      !normalized ||
      [
        setting.title,
        setting.description,
        setting.editorLocation,
        setting.category,
        ...setting.values.map((value) => value.label),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    return matchesCategory && matchesQuery
  })

  return (
    <section className="not-prose my-8" data-testid="slideshow-setting-atlas">
      <div className="overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm">
        <div className="grid gap-5 border-b border-border bg-muted/30 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-7">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Production renderer reference
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {settings.length} editor settings, isolated one at a time
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Every visible frame below comes from the same SVG renderer used by
              slideshow preview and export. All unmentioned settings stay fixed.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <SummaryStat
              label="Rendered"
              value={countImpact(settings, "renderer")}
            />
            <SummaryStat label="Fixed" value={countImpact(settings, "fixed")} />
          </div>
        </div>

        <div className="space-y-3 p-4 md:p-5">
          <label className="relative block">
            <span className="sr-only">Search slideshow editor settings</span>
            <LuSearch
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search settings, values, or editor locations"
              className="h-10 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                  category === item
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground hover:bg-muted"
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        {filtered.map((setting, index) => (
          <SettingComparison
            key={setting.id}
            index={index + 1}
            setting={setting}
            onInspect={(example) => setActive({ setting, example })}
          />
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/25 p-10 text-center text-sm text-muted-foreground">
            No slideshow editor setting matches this filter.
          </div>
        ) : null}
      </div>

      {active ? (
        <SettingExampleModal
          setting={active.setting}
          example={active.example}
          onClose={() => setActive(null)}
        />
      ) : null}
    </section>
  )
}

function SettingComparison({
  setting,
  index,
  onInspect,
}: {
  setting: SlideSettingComparison
  index: number
  onInspect: (example: SlideSettingExample) => void
}) {
  return (
    <article
      id={setting.id}
      className="grid scroll-mt-20 grid-cols-[minmax(132px,32%)_minmax(0,1fr)] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm md:grid-cols-[minmax(240px,30%)_minmax(0,1fr)]"
    >
      <header className="border-r border-border p-3 md:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold text-muted-foreground">
              {String(index).padStart(2, "0")}
            </span>
            <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {setting.category}
            </span>
            <ImpactBadge impact={setting.impact} />
          </div>
          <h3 className="mt-3 text-base font-semibold tracking-tight text-foreground md:text-xl">
            {setting.title}
          </h3>
          <p className="mt-2 text-xs leading-5 text-muted-foreground md:text-sm md:leading-6">
            {setting.description}
          </p>
        </div>
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[10px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Editor location
          </p>
          <p className="mt-1 text-xs leading-5 font-medium text-foreground">
            {setting.editorLocation}
          </p>
        </div>
      </header>

      <div className="min-w-0 overflow-x-auto p-3 md:p-4">
        <div className="flex min-w-max items-stretch gap-3">
          {setting.values.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => onInspect(example)}
              className="group w-36 shrink-0 overflow-hidden rounded-xl border border-border bg-background text-left transition hover:-translate-y-0.5 hover:border-foreground/40 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring md:w-44"
            >
              <SlidePreviewMosaic
                urls={example.previewUrls}
                label={`${setting.title}: ${example.label}`}
              />
              <div className="border-t border-border p-2.5 md:p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground md:text-sm">
                    {example.label}
                  </p>
                  <LuExpand
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100"
                  />
                </div>
                {example.note ? (
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                    {example.note}
                  </p>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}

function SlidePreviewMosaic({
  urls,
  label,
}: {
  urls: string[]
  label: string
}) {
  return (
    <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,var(--muted),var(--background))] p-3">
      <div
        className={cn(
          "grid h-full w-full place-items-center gap-1.5",
          urls.length > 1 && "grid-cols-3",
          urls.length > 3 && "grid-rows-2"
        )}
      >
        {urls.map((url, index) => (
          <div
            key={`${url.slice(-36)}-${index}`}
            className="relative h-full min-h-0 w-full min-w-0"
          >
            <Image
              src={url}
              alt={index === 0 ? label : ""}
              fill
              unoptimized
              sizes="(max-width: 640px) 50vw, 25vw"
              className="object-contain drop-shadow-lg"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function ImpactBadge({ impact }: { impact: SlideSettingImpact }) {
  const labels = {
    renderer: "Direct render",
    structural: "Slideshow structure",
    generation: "Generation input",
    fixed: "Fixed behavior",
  }
  const icons = {
    renderer: LuExpand,
    structural: LuExpand,
    generation: LuExpand,
    fixed: LuLockKeyhole,
  }
  const Icon = icons[impact]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        impact === "renderer" &&
          "border-emerald-200 bg-emerald-50 text-emerald-800",
        impact === "structural" && "border-blue-200 bg-blue-50 text-blue-800",
        impact === "generation" &&
          "border-violet-200 bg-violet-50 text-violet-800",
        impact === "fixed" && "border-amber-200 bg-amber-50 text-amber-900"
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {labels[impact]}
    </span>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  )
}

function SettingExampleModal({
  setting,
  example,
  onClose,
}: {
  setting: SlideSettingComparison
  example: SlideSettingExample
  onClose: () => void
}) {
  return (
    <AppModal onClose={onClose}>
      <AppModalPanel
        accessibleTitle={`${setting.title}: ${example.label}`}
        className="flex max-h-[92vh] max-w-6xl flex-col overflow-hidden"
      >
        <AppModalHeader
          title={`${setting.title} · ${example.label}`}
          description={`${setting.editorLocation} · ${setting.category}`}
          onClose={onClose}
          closeLabel="Close setting comparison"
        />
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
          <div className="min-h-[520px] bg-app-surface-subtle p-6">
            <SlidePreviewMosaic
              urls={example.previewUrls}
              label={`${setting.title}: ${example.label}`}
            />
          </div>
          <div className="border-t border-border bg-background p-5 lg:border-t-0 lg:border-l">
            <ImpactBadge impact={setting.impact} />
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {setting.description}
            </p>
            {example.note ? (
              <p className="mt-3 rounded-lg border border-border bg-muted/35 p-3 text-xs leading-5 text-foreground">
                {example.note}
              </p>
            ) : null}
            <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-foreground">
              <LuBraces aria-hidden="true" className="size-4" />
              Full slideshow JSON
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              The selected value is applied inside this complete renderer
              document, including slideshow settings and every displayed slide.
            </p>
            <pre className="mt-2 overflow-auto rounded-lg bg-[#111117] p-4 font-mono text-xs leading-5 whitespace-pre-wrap text-[#e8e8ef]">
              {JSON.stringify(example.slideshow, null, 2)}
            </pre>
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}

function countImpact(
  settings: SlideSettingComparison[],
  impact: SlideSettingImpact
) {
  return settings.filter((setting) => setting.impact === impact).length
}
