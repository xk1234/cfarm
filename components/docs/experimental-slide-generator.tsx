"use client"

import { LuInfo, LuRefreshCcw } from "react-icons/lu"
import Image from "next/image"
import { useEffect, useMemo, useState } from "react"

import { loadRandomCollectionImages } from "@/components/docs/collection-image-sources"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import {
  generateSlideRendererStressCases,
  type AtlasImageSource,
  type SlideRendererStressCase,
} from "@/lib/slide-renderer-experiments"

const caseCount = 50

export function ExperimentalSlideGenerator() {
  const [seed, setSeed] = useState(318_2026)
  const [imageSources, setImageSources] = useState<AtlasImageSource[]>([])
  const [activeCase, setActiveCase] = useState<SlideRendererStressCase | null>(
    null
  )
  const cases = useMemo(
    () => generateSlideRendererStressCases(caseCount, seed, imageSources),
    [imageSources, seed]
  )

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
  const aspectRatioCount = new Set(cases.map((item) => item.aspectRatio)).size
  const fontCount = new Set(cases.map((item) => item.settings.font)).size
  const styleCount = new Set(
    cases.flatMap((item) =>
      item.settings.textItems.map((textItem) => textItem.textStyle)
    )
  ).size

  return (
    <section className="not-prose my-8">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Renderer stress matrix
          </p>
          <h2 className="mt-1 text-xl font-semibold text-foreground">
            {caseCount} generated slide cases
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            These are produced locally by the production slideshow SVG renderer.
            No model or image API is called.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSeed((current) => current + 104729)}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-foreground px-3.5 text-sm font-semibold text-background hover:opacity-90"
        >
          <LuRefreshCcw aria-hidden="true" className="size-4" />
          Randomize again
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
          seed {seed}
        </span>
        <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
          {aspectRatioCount} aspect ratios
        </span>
        <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
          {fontCount} fonts
        </span>
        <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
          {styleCount} text styles
        </span>
        {imageSources.length > 0 ? (
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-1">
            {imageSources.length} collection images
          </span>
        ) : null}
      </div>

      <div
        className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        data-testid="slide-renderer-stress-grid"
      >
        {cases.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveCase(item)}
            className="group relative flex aspect-square min-w-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-[radial-gradient(circle_at_center,var(--muted),var(--background))] p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-foreground/45 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Inspect renderer case ${index + 1}`}
          >
            <Image
              src={item.previewUrl}
              alt={`Renderer case ${index + 1}: ${item.aspectRatio}, ${item.wordCount} words`}
              fill
              unoptimized
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              className="object-contain p-3 drop-shadow-lg"
            />
            <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-background/92 text-foreground opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <LuInfo aria-hidden="true" className="size-4" />
            </span>
            <span className="absolute right-2 bottom-2 left-2 flex items-center justify-between gap-2 rounded-md bg-background/88 px-2 py-1 font-mono text-[10px] text-foreground opacity-0 backdrop-blur transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <span>#{String(index + 1).padStart(2, "0")}</span>
              <span>
                {item.aspectRatio} · {item.wordCount}w
              </span>
            </span>
          </button>
        ))}
      </div>

      {activeCase ? (
        <RendererCaseModal
          item={activeCase}
          onClose={() => setActiveCase(null)}
        />
      ) : null}
    </section>
  )
}

function RendererCaseModal({
  item,
  onClose,
}: {
  item: SlideRendererStressCase
  onClose: () => void
}) {
  return (
    <AppModal onClose={onClose}>
      <AppModalPanel
        accessibleTitle={`Renderer case ${item.id}`}
        className="flex max-h-[92vh] max-w-5xl flex-col overflow-hidden"
      >
        <AppModalHeader
          title={`Renderer case ${item.id.replace("case-", "#")}`}
          description={`${item.aspectRatio} · ${item.wordCount} rendered words · seed ${item.settings.seed}`}
          onClose={onClose}
          closeLabel="Close renderer case"
        />
        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)]">
          <div className="relative flex min-h-[420px] items-center justify-center bg-app-surface-subtle p-6">
            <Image
              src={item.previewUrl}
              alt={`Full preview for renderer case ${item.id}`}
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 45vw"
              className="object-contain p-6 drop-shadow-2xl"
            />
          </div>
          <div className="min-w-0 bg-[#111117] p-5 text-[#e8e8ef]">
            <p className="text-xs font-semibold tracking-[0.1em] text-white/55 uppercase">
              Exact renderer input
            </p>
            <pre className="mt-3 max-h-[68vh] overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap">
              {JSON.stringify(item.settings, null, 2)}
            </pre>
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}
