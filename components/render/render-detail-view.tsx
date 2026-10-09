"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconSend,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  getRender,
  isRenderSettled,
  type RenderView,
} from "@/components/realfarm/api-client"
import { PublishDialog } from "@/components/realfarm/publish/publish-dialog"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { JsonViewer } from "@/components/ui/json-viewer"
import { cn } from "@/lib/utils"

import { RenderStatusBadge, formatDateTime } from "./render-status"

/** The JSON copied by "Copy spec JSON": the frozen resolved spec. */
export function renderSpecJson(render: Pick<RenderView, "resolvedSpec">): string {
  return JSON.stringify(render.resolvedSpec ?? null, null, 2)
}

export function RenderDetailView({
  renderId,
  onBack,
  onOpenSettings,
}: {
  renderId: string
  onBack: () => void
  onOpenSettings?: () => void
}) {
  const query = useQuery({
    queryKey: ["render", renderId],
    queryFn: () => getRender(renderId),
    refetchInterval: (state) =>
      state.state.data && !isRenderSettled(state.state.data.status) ? 2000 : false,
  })
  const [selected, setSelected] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const render = query.data

  async function copySpec() {
    if (!render) return
    try {
      await navigator.clipboard.writeText(renderSpecJson(render))
      toast.success("Spec JSON copied")
    } catch {
      toast.error("Copy failed")
    }
  }

  const slides = render?.slides ?? []
  const current = slides[Math.min(selected, Math.max(0, slides.length - 1))]

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="Back to renders" onClick={onBack}>
            <IconArrowLeft />
          </IconButton>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em] text-app-text">
              {render ? render.title || "Untitled render" : "Render"}
            </h1>
            {render ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-app-muted-text">
                <RenderStatusBadge status={render.status} />
                <span>{formatDateTime(render.completedAt ?? render.createdAt)}</span>
                {render.width && render.height ? (
                  <span>
                    {render.width}×{render.height} · {(render.format ?? "png").toUpperCase()}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        {render ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="softControl" size="appDefault" onClick={() => void copySpec()} disabled={!render.resolvedSpec}>
              <IconCopy />
              Copy spec JSON
            </Button>
            {render.zipUrl ? (
              <Button asChild variant="softControl" size="appDefault">
                <a href={render.zipUrl} download>
                  <IconDownload />
                  Download ZIP
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="action"
              size="appDefault"
              disabled={render.status !== "succeeded" || slides.length === 0}
              onClick={() => setPublishing(true)}
            >
              <IconSend />
              Publish
            </Button>
          </div>
        ) : null}
      </header>

      {query.isLoading ? (
        <div className="aspect-[9/16] w-full max-w-sm animate-pulse rounded-xl bg-app-surface-subtle" aria-busy="true" />
      ) : query.error || !render ? (
        <p role="alert" className="rounded-xl bg-app-danger-surface p-4 text-sm text-app-danger-muted">
          {query.error instanceof Error ? query.error.message : "Render not found."}
        </p>
      ) : (
        <>
          {render.status === "failed" ? (
            <p role="alert" className="rounded-xl bg-app-danger-surface p-4 text-sm text-app-danger-muted">
              {render.error || "The render failed."}
            </p>
          ) : null}
          {!isRenderSettled(render.status) ? (
            <p role="status" className="rounded-xl bg-app-warning-surface p-4 text-sm text-app-warning">
              {render.status === "queued" ? "Queued for rendering…" : "Rendering slides…"}
            </p>
          ) : null}

          {slides.length > 0 ? (
            <>
              <ol className="flex gap-2 overflow-x-auto pb-2" aria-label="Slides">
                {slides.map((slide, index) => (
                  <li key={slide.index} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelected(index)}
                      aria-current={index === selected ? "true" : undefined}
                      aria-label={`Slide ${slide.index + 1}`}
                      className={cn(
                        "lc-focus-ring block w-16 overflow-hidden rounded-lg border-2 sm:w-20",
                        index === selected ? "border-app-action" : "border-transparent"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- owner-checked render file */}
                      <img
                        src={slide.url}
                        alt=""
                        loading="lazy"
                        className="w-full bg-app-surface-subtle object-cover"
                        style={{ aspectRatio: `${slide.width} / ${slide.height}` }}
                      />
                    </button>
                  </li>
                ))}
              </ol>

              {current ? (
                <figure className="space-y-3">
                  <div className="flex items-center justify-center gap-2">
                    <IconButton
                      label="Previous slide"
                      disabled={selected === 0}
                      onClick={() => setSelected((value) => Math.max(0, value - 1))}
                    >
                      <IconChevronLeft />
                    </IconButton>
                    {/* eslint-disable-next-line @next/next/no-img-element -- owner-checked render file */}
                    <img
                      src={current.url}
                      alt={`Slide ${current.index + 1} (${current.id})`}
                      className="max-h-[70vh] w-auto max-w-[calc(100%-96px)] rounded-xl bg-app-surface-subtle object-contain shadow-sm"
                      style={{ aspectRatio: `${current.width} / ${current.height}` }}
                    />
                    <IconButton
                      label="Next slide"
                      disabled={selected >= slides.length - 1}
                      onClick={() => setSelected((value) => Math.min(slides.length - 1, value + 1))}
                    >
                      <IconChevronRight />
                    </IconButton>
                  </div>
                  <figcaption className="flex flex-wrap items-center justify-center gap-3 text-xs text-app-muted-text">
                    <span>
                      {current.index + 1} of {slides.length} · {current.id}
                    </span>
                    <a href={current.url} download className="font-semibold text-app-action hover:underline">
                      Download slide
                    </a>
                  </figcaption>
                </figure>
              ) : null}
            </>
          ) : null}

          {render.warnings.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-app-text">Warnings</h2>
              <ul className="space-y-1 text-sm text-app-muted-text">
                {render.warnings.map((warning, index) => (
                  <li key={`${warning.code}-${index}`}>
                    <span className="font-mono text-xs">{warning.code}</span>
                    {typeof warning.slide === "number" ? ` · slide ${warning.slide + 1}` : ""} · {warning.message}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {render.resolvedSpec ? (
            <details className="rounded-xl border border-app-panel-border bg-app-surface">
              <summary className="lc-focus-ring cursor-pointer px-4 py-3 text-sm font-semibold text-app-text">
                Spec JSON
              </summary>
              <div className="border-t border-app-panel-border p-3">
                <JsonViewer value={render.resolvedSpec} label="Resolved spec" />
              </div>
            </details>
          ) : null}
        </>
      )}

      {publishing && render ? (
        <PublishDialog
          render={render}
          onClose={() => setPublishing(false)}
          onOpenSettings={
            onOpenSettings
              ? () => {
                  setPublishing(false)
                  onOpenSettings()
                }
              : undefined
          }
        />
      ) : null}
    </div>
  )
}
