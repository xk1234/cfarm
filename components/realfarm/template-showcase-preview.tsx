"use client"

import { cn } from "@/lib/utils"

export type GeneratedShowcaseSlide = {
  id?: string
  role?: string
  section?: string
  imageUrl?: string
  text?: string
  imageCaption?: string
}

export type GeneratedShowcaseRun = {
  id: string
  plan?: {
    slides?: GeneratedShowcaseSlide[]
  }
}

export type TemplateExampleSlide = {
  id: string
  imageUrl: string
  text: string
  section: "hook" | "content" | "cta"
}

export type TemplateExampleSlideshow = {
  id: string
  label: string
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
  runs: GeneratedShowcaseRun[] | undefined
) {
  return (
    runs
      ?.map((run, runIndex) => {
        const slides = (run.plan?.slides ?? [])
          .map((slide, index) => ({
            id: `${run.id}-${slide.id ?? index}`,
            imageUrl: slide.imageUrl?.trim() ?? "",
            text: slide.text?.trim() || slide.imageCaption?.trim() || "",
            section: exampleSlideSection(slide, index),
          }))
          .filter((slide): slide is TemplateExampleSlide =>
            Boolean(slide.imageUrl)
          )

        return {
          id: run.id,
          label: `Slideshow ${runIndex + 1}`,
          slides,
        }
      })
      .filter(
        (slideshow): slideshow is TemplateExampleSlideshow =>
          slideshow.slides.length > 0
      ) ?? []
  )
}

export function TemplateGeneratedPreview({
  exampleSlides,
  tileCount = 3,
  columns = 3,
  index = 0,
  className,
}: {
  exampleSlides: TemplateExampleSlide[]
  tileCount?: number
  columns?: 2 | 3
  index?: number
  className?: string
}) {
  const hasGeneratedSlides = exampleSlides.length > 0

  return (
    <div
      className={cn(
        "grid overflow-hidden bg-[#deddd6]",
        columns === 2 ? "grid-cols-2" : "grid-cols-3",
        className
      )}
    >
      {Array.from({ length: tileCount }, (_, tileIndex) => {
        const slide = exampleSlides[tileIndex]
        return (
          <div
            key={slide?.id ?? `placeholder-${index}-${tileIndex}`}
            className="relative overflow-hidden bg-[#d7d6cf]"
          >
            {slide ? (
              <img
                src={slide.imageUrl}
                alt={slide.text || "Generated slideshow example"}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="h-full w-full bg-[linear-gradient(135deg,#e9e8e1_0%,#d7d6cf_48%,#c8c7c0_100%)]" />
            )}
            <div className="absolute inset-0 bg-black/20" />
            {slide?.text && slide.section !== "hook" ? (
              <div className="absolute inset-x-3 top-[38%] text-center font-tiktok text-[10px] leading-tight font-bold text-yellow-100 drop-shadow">
                {slide.text}
              </div>
            ) : !hasGeneratedSlides &&
              tileIndex === Math.floor(tileCount / 2) ? (
              <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 text-center text-[10px] leading-tight font-semibold text-[#77766f]">
                No example slideshow yet
              </div>
            ) : null}
          </div>
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
