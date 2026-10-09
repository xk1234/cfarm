"use client"

import { cn } from "@/lib/utils"

export type SlidePreviewSlide = {
  id: string
  imageUrl: string
  text: string
}

export function SlidePreview({
  slides,
  tileCount = 3,
  columns = 3,
  index = 0,
  className,
  onSelectSlide,
  selectLabel = "Open slideshow",
}: {
  slides: SlidePreviewSlide[]
  tileCount?: number
  columns?: 1 | 2 | 3
  index?: number
  className?: string
  onSelectSlide?: (index: number) => void
  selectLabel?: string
}) {
  const hasSlides = slides.length > 0

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
        const slide = slides[tileIndex]
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
              // eslint-disable-next-line @next/next/no-img-element -- Slide previews can use local or provider asset URLs without a stable optimization host.
              <img
                src={slide.imageUrl}
                alt={slide.text || "Slide preview"}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="h-full w-full bg-[linear-gradient(135deg,#e9e8e1_0%,#d7d6cf_48%,#c8c7c0_100%)]" />
            )}
            {!hasSlides && tileIndex === Math.floor(tileCount / 2) ? (
              <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-[10px] leading-tight font-semibold text-app-muted-text">
                No slides yet
              </div>
            ) : null}
          </Tile>
        )
      })}
    </div>
  )
}
