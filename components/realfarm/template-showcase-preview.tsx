"use client"

import { cn } from "@/lib/utils"
import { slideshowStageForRunStatus } from "@/lib/slideshow-lifecycle"

export type GeneratedShowcaseSlide = {
  id?: string
  role?: string
  section?: string
  imageUrl?: string
  sourceImageUrl?: string
  text?: string
  imageCaption?: string
  durationSeconds?: number
  durationMs?: number
}

export type GeneratedShowcaseRun = {
  ownerId?: string
  id: string
  automationTitle?: string
  scheduledFor?: string
  status?: string
  slideshowId?: string
  socialStatuses?: Array<{ status?: string }>
  createdAt?: string
  error?: string
  plan?: {
    title?: string
    hook?: string
    publishType?: string
    language?: string
    slides?: GeneratedShowcaseSlide[]
  }
  renderedSlides?: GeneratedShowcaseSlide[]
}

export type TemplateExampleSlide = {
  id: string
  imageUrl: string
  text: string
  section: "hook" | "content" | "cta"
  durationSeconds?: number
}

export type TemplateExampleSlideshow = {
  id: string
  label: string
  title: string
  status: string
  scheduledFor?: string
  createdAt?: string
  durationSeconds: number
  caption: string
  publishType?: string
  language?: string
  error?: string
  slides: TemplateExampleSlide[]
}

export function generatedExampleSlides(
  runs: GeneratedShowcaseRun[] | undefined,
  count: number
) {
  const slides = generatedExampleSlideshows(runs).flatMap(
    (slideshow) => slideshow.slides
  )

  return slides.slice(0, Math.max(1, count))
}

export function generatedExampleSlideshows(
  runs: GeneratedShowcaseRun[] | undefined,
  options: { includeFailed?: boolean } = {}
) {
  return (
    runs
      ?.map<TemplateExampleSlideshow | null>((run, runIndex) => {
        const failed = run.status === "failed"
        const stage = slideshowStageForRunStatus(run.status ?? "completed")
        if (!stage && !(failed && options.includeFailed)) {
          return null
        }
        const slides = showcaseRunSlides(run)
          .map<TemplateExampleSlide | null>((slide, index) => {
            const imageUrl =
              slide.imageUrl?.trim() || slide.sourceImageUrl?.trim()
            if (!imageUrl) {
              return null
            }

            return {
              id: `${run.id}-${slide.id ?? index}`,
              imageUrl,
              text: slide.text?.trim() || slide.imageCaption?.trim() || "",
              section: exampleSlideSection(slide, index),
              durationSeconds:
                slide.durationSeconds ??
                (typeof slide.durationMs === "number"
                  ? Math.max(1, slide.durationMs / 1000)
                  : undefined),
            }
          })
          .filter((slide): slide is TemplateExampleSlide => Boolean(slide))

        if (slides.length === 0 && !(failed && options.includeFailed)) {
          return null
        }

        return {
          id: run.id,
          label: `Slideshow ${runIndex + 1}`,
          title:
            run.plan?.title?.trim() ||
            run.plan?.hook?.trim() ||
            run.automationTitle?.trim() ||
            `Slideshow ${runIndex + 1}`,
          status: failed ? "failed" : stage || "completed",
          scheduledFor: run.scheduledFor,
          createdAt: run.createdAt,
          durationSeconds: slideshowDurationSeconds(slides),
          caption: run.plan?.hook?.trim() || slides[0]?.text || run.error || "",
          publishType: run.plan?.publishType,
          language: run.plan?.language,
          error: run.error,
          slides,
        }
      })
      .filter(
        (slideshow): slideshow is TemplateExampleSlideshow => slideshow !== null
      ) ?? []
  )
}

function showcaseRunSlides(run: GeneratedShowcaseRun) {
  return run.renderedSlides?.length
    ? run.renderedSlides
    : (run.plan?.slides ?? [])
}

function slideshowDurationSeconds(slides: TemplateExampleSlide[]) {
  return slides.reduce(
    (total, slide) => total + Math.max(1, slide.durationSeconds ?? 4),
    0
  )
}

export function TemplateGeneratedPreview({
  exampleSlides,
  tileCount = 3,
  columns = 3,
  index = 0,
  className,
  onSelectSlide,
  selectLabel = "Open slideshow",
}: {
  exampleSlides: TemplateExampleSlide[]
  tileCount?: number
  columns?: 1 | 2 | 3
  index?: number
  className?: string
  onSelectSlide?: (index: number) => void
  selectLabel?: string
}) {
  const hasGeneratedSlides = exampleSlides.length > 0

  return (
    <div
      className={cn(
        "grid overflow-hidden bg-[#deddd6]",
        columns === 1
          ? "grid-cols-1"
          : columns === 2
            ? "grid-cols-2"
            : "grid-cols-3",
        className
      )}
    >
      {Array.from({ length: tileCount }, (_, tileIndex) => {
        const slide = exampleSlides[tileIndex]
        const interactive = Boolean(slide && onSelectSlide)
        const Tile = interactive ? "button" : "div"
        return (
          <Tile
            key={slide?.id ?? `placeholder-${index}-${tileIndex}`}
            {...(interactive
              ? {
                  type: "button" as const,
                  onClick: () => onSelectSlide?.(tileIndex),
                  "aria-label": `${selectLabel} ${tileIndex + 1}`,
                }
              : {})}
            className={cn(
              "relative overflow-hidden bg-[#d7d6cf]",
              interactive &&
                "cursor-pointer transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-action"
            )}
          >
            {slide ? (
              // eslint-disable-next-line @next/next/no-img-element -- Generated previews can use local or provider asset URLs without a stable optimization host.
              <img
                src={slide.imageUrl}
                alt={slide.text || "Generated slideshow example"}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="h-full w-full bg-[linear-gradient(135deg,#e9e8e1_0%,#d7d6cf_48%,#c8c7c0_100%)]" />
            )}
            {!hasGeneratedSlides && tileIndex === Math.floor(tileCount / 2) ? (
              <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-[10px] leading-tight font-semibold text-app-muted-text">
                No example slideshow yet
              </div>
            ) : null}
          </Tile>
        )
      })}
    </div>
  )
}

function exampleSlideSection(
  slide: GeneratedShowcaseSlide,
  index: number
): TemplateExampleSlide["section"] {
  const section = (slide.section || slide.role || "").trim().toLowerCase()
  if (section === "hook" || section === "cta") {
    return section
  }
  return index === 0 ? "hook" : "content"
}
