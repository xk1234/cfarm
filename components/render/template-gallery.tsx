"use client"

import { IconLayoutGrid, IconPhoto } from "@tabler/icons-react"

import type { TemplateView } from "@/components/realfarm/api-client"
import { canvasSize, isSlideRepeat, type SlideshowSpec } from "@/lib/render/spec"

import { imageSlots, initialSlotValues } from "./slot-values"
import { aspectRatioOf, useSpecPreview } from "./spec-preview"

const FIRST_SLIDE = [0]

export function templateFacts(spec: SlideshowSpec): string {
  const size = canvasSize(spec.canvas)
  const repeats = spec.slides.some((entry) => isSlideRepeat(entry))
  const slides = repeats ? `${spec.slides.length}+ slides` : `${spec.slides.length} slide${spec.slides.length === 1 ? "" : "s"}`
  const images = imageSlots(spec, initialSlotValues(spec)).length
  return [
    spec.canvas.preset ?? (size ? `${size.width}×${size.height}` : null),
    slides,
    images ? `${images} image slot${images === 1 ? "" : "s"}` : "text only",
  ]
    .filter(Boolean)
    .join(" · ")
}

/** Starter/stored templates as fully clickable cards with an engine-rendered thumbnail. */
export function TemplateGallery({
  templates,
  loading,
  onSelect,
}: {
  templates: readonly TemplateView[]
  loading?: boolean
  onSelect: (template: TemplateView) => void
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="aspect-[3/4] animate-pulse rounded-xl bg-app-surface-subtle" />
        ))}
      </div>
    )
  }
  if (templates.length === 0) {
    return <p className="py-10 text-center text-sm text-app-muted-text">No templates yet.</p>
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {templates.map((template) => (
        <li key={template.id} className="min-w-0">
          <TemplateCard template={template} onSelect={() => onSelect(template)} />
        </li>
      ))}
    </ul>
  )
}

function TemplateCard({ template, onSelect }: { template: TemplateView; onSelect: () => void }) {
  const preview = useSpecPreview({
    spec: template.thumbnailUrl ? null : template.spec,
    slides: FIRST_SLIDE,
    debounceMs: 0,
  })
  const thumbnail =
    template.thumbnailUrl ?? (preview.status === "ready" ? preview.slides[0]?.url : undefined)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="lc-focus-ring group flex w-full flex-col gap-2 rounded-xl text-left"
    >
      <span
        className="relative grid w-full place-items-center overflow-hidden rounded-xl border border-app-panel-border bg-app-surface-subtle transition group-hover:border-app-action"
        style={{ aspectRatio: aspectRatioOf(template.spec) }}
      >
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob/owner-checked thumbnail
          <img src={thumbnail} alt="" className="absolute inset-0 size-full object-cover" />
        ) : preview.status === "rendering" || preview.status === "idle" ? (
          <span className="absolute inset-0 animate-pulse bg-app-media-empty" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-app-muted-text">
            {template.spec.slots ? <IconLayoutGrid className="size-6" /> : <IconPhoto className="size-6" />}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-app-text">{template.name}</span>
        <span className="block truncate text-xs text-app-muted-text">{templateFacts(template.spec)}</span>
      </span>
    </button>
  )
}
