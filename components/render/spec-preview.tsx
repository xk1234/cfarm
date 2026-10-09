"use client"

import { useEffect, useMemo, useState } from "react"
import { IconAlertTriangle, IconPhoto } from "@tabler/icons-react"

import {
  canvasSize,
  type SlideshowSpec,
  type SlotValues,
  type SpecIssue,
} from "@/lib/render/spec"
import { cn } from "@/lib/utils"

import {
  PreviewUnavailableError,
  renderPreviewSlides,
  resolveForPreview,
  revokePreview,
  type PreviewSlide,
} from "./browser-preview"

export type SpecPreviewState =
  | { status: "idle" }
  | { status: "rendering"; slides: PreviewSlide[] }
  | { status: "ready"; slides: PreviewSlide[] }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string; issues: SpecIssue[] }

/** Debounced live preview of a template/instance with the browser engine. */
export function useSpecPreview({
  spec,
  slotValues,
  enabled = true,
  scale = 0.5,
  slides,
  debounceMs = 350,
  seed,
}: {
  spec: SlideshowSpec | null
  slotValues?: SlotValues
  enabled?: boolean
  scale?: number
  slides?: number[]
  debounceMs?: number
  seed?: string
}): SpecPreviewState {
  const [state, setState] = useState<SpecPreviewState>({ status: "idle" })
  const key = useMemo(
    () => (spec ? JSON.stringify([spec, slotValues ?? {}, scale, slides ?? null, seed ?? ""]) : ""),
    [spec, slotValues, scale, slides, seed]
  )

  useEffect(() => {
    if (!enabled || !spec || !key) return
    let cancelled = false
    let produced: PreviewSlide[] = []
    const timer = window.setTimeout(async () => {
      setState((current) => ({
        status: "rendering",
        slides: current.status === "ready" || current.status === "rendering" ? current.slides : [],
      }))
      try {
        const resolved = await resolveForPreview(spec, slotValues ?? {}, { seed })
        if (cancelled) return
        const result = await renderPreviewSlides(resolved, { scale, slides })
        produced = result.slides
        if (cancelled) {
          revokePreview(produced)
          return
        }
        setState({ status: "ready", slides: result.slides })
      } catch (error) {
        if (cancelled) return
        if (error instanceof PreviewUnavailableError) {
          setState({ status: "unavailable", message: error.message })
          return
        }
        const issues =
          error && typeof error === "object" && Array.isArray((error as { errors?: unknown }).errors)
            ? ((error as { errors: SpecIssue[] }).errors)
            : []
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Preview failed.",
          issues,
        })
      }
    }, debounceMs)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (produced.length) revokePreview(produced)
    }
    // `key` captures spec/slotValues/scale/slides/seed by value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, debounceMs])

  return enabled && spec ? state : { status: "idle" }
}

export function aspectRatioOf(spec: Pick<SlideshowSpec, "canvas"> | null): string {
  const size = spec ? canvasSize(spec.canvas) : null
  return size ? `${size.width} / ${size.height}` : "9 / 16"
}

/** Read-only strip of preview slides. */
export function SpecPreview({
  spec,
  state,
  className,
  emptyLabel = "Preview",
}: {
  spec: SlideshowSpec | null
  state: SpecPreviewState
  className?: string
  emptyLabel?: string
}) {
  const aspectRatio = aspectRatioOf(spec)

  if (state.status === "unavailable" || state.status === "error") {
    const unavailable = state.status === "unavailable"
    return (
      <div
        role={unavailable ? "status" : "alert"}
        className={cn(
          "flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-app-panel-border bg-app-surface-subtle p-6 text-center text-sm",
          className
        )}
      >
        {unavailable ? (
          <IconPhoto className="size-5 text-app-muted-text" />
        ) : (
          <IconAlertTriangle className="size-5 text-[#b3261e]" />
        )}
        <p className="font-semibold text-app-text">
          {unavailable ? "Preview unavailable" : "Preview failed"}
        </p>
        <p className="max-w-[44ch] text-app-muted-text">
          {unavailable
            ? "The server render is still exact. Render to see the slides."
            : (state.issues[0]?.message ?? state.message)}
        </p>
      </div>
    )
  }

  const slides = state.status === "ready" || state.status === "rendering" ? state.slides : []
  const busy = state.status === "rendering" || state.status === "idle"

  return (
    <div
      className={cn("flex gap-3 overflow-x-auto pb-2", className)}
      aria-busy={busy}
      aria-label={emptyLabel}
    >
      {slides.length === 0 ? (
        <div
          className="w-40 shrink-0 animate-pulse rounded-lg bg-app-surface-subtle sm:w-48"
          style={{ aspectRatio }}
        />
      ) : (
        slides.map((slide) => (
          <figure key={`${slide.index}-${slide.url}`} className="w-40 shrink-0 sm:w-48">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob URL from the browser engine */}
            <img
              src={slide.url}
              alt={`Slide ${slide.index + 1}`}
              width={slide.width}
              height={slide.height}
              className={cn(
                "w-full rounded-lg bg-app-surface-subtle object-contain shadow-sm transition-opacity",
                state.status === "rendering" && "opacity-60"
              )}
              style={{ aspectRatio: `${slide.width} / ${slide.height}` }}
            />
            <figcaption className="mt-1 truncate text-xs font-medium text-app-muted-text">
              {slide.index + 1} · {slide.id}
            </figcaption>
          </figure>
        ))
      )}
    </div>
  )
}
