import Image from "next/image"

export type AnalyticsSlide = {
  index: number
  imageUrl: string
}

export function PostSlidesStrip({ slides }: { slides: AnalyticsSlide[] }) {
  if (slides.length === 0) return null

  return (
    <section
      aria-labelledby="post-slides-heading"
      className="mt-5 rounded-[18px] border border-app-panel-border bg-app-surface p-5 lg:p-6"
    >
      <h2
        id="post-slides-heading"
        className="text-[17px] font-semibold tracking-[-0.02em] text-app-text"
      >
        Published slides
      </h2>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {slides.map((slide) => (
          <figure
            key={`${slide.index}:${slide.imageUrl}`}
            className="w-[132px] shrink-0"
          >
            <Image
              src={slide.imageUrl}
              alt={`Rendered slide ${slide.index}`}
              width={1080}
              height={1350}
              sizes="132px"
              unoptimized
              className="aspect-[4/5] w-full rounded-[11px] border border-app-panel-border object-cover"
            />
            <figcaption className="mt-1.5 text-center text-[9px] font-semibold text-app-text-faint">
              Slide {slide.index}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
