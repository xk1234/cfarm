import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import {
  benchmarkAndStoreGeneratedSlideshow,
  benchmarkComparisonForSlideshow,
  benchmarkContextFromSlides,
  benchmarkSlidesFromSlideshow,
  listBenchmarkCorpus,
  listGeneratedSlideshowBenchmarks,
} from "@/lib/slideshow-benchmarks"
import { listSlideshowRecords } from "@/lib/slideshows"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const slideshowId = url.searchParams.get("slideshowId")?.trim()
  if (slideshowId) {
    return NextResponse.json({
      comparison: await benchmarkComparisonForSlideshow(slideshowId),
    })
  }

  const [corpus, generated] = await Promise.all([
    listBenchmarkCorpus(),
    listGeneratedSlideshowBenchmarks(),
  ])
  return NextResponse.json({ corpus, generated })
}

export const POST = withHandler(async (request: Request) => {
  const url = new URL(request.url)
  const payload = (await request.json().catch(() => null)) as {
    slideshowId?: unknown
  } | null
  const slideshowId =
    typeof payload?.slideshowId === "string"
      ? payload.slideshowId.trim()
      : url.searchParams.get("slideshowId")?.trim()

  if (!slideshowId) {
    throw new ApiError(400, "A slideshow id is required for benchmarking.")
  }

  const [slideshow] = await listSlideshowRecords({
    id: slideshowId,
    limit: 1,
  })
  if (!slideshow) {
    throw new ApiError(404, "This slideshow no longer exists.")
  }
  if (slideshow.output_images.length === 0) {
    throw new ApiError(
      422,
      "This slideshow has no rendered slides to benchmark."
    )
  }

  const slides = benchmarkSlidesFromSlideshow(slideshow)
  let generated = true
  try {
    const benchmark = await benchmarkAndStoreGeneratedSlideshow({
      slideshowId,
      automationId: slideshow.automationId,
      title: slideshow.title,
      icp: benchmarkContextFromSlides({ title: slideshow.title, slides }),
      slides,
    })
    generated = !benchmark.cacheHit
  } catch (error) {
    console.error("[api/benchmarks] on-demand generation failed", {
      slideshowId,
      error,
    })
    throw new ApiError(
      502,
      error instanceof Error
        ? error.message
        : "The benchmark model failed without returning an error message."
    )
  }

  const comparison = await benchmarkComparisonForSlideshow(slideshowId)
  if (!comparison) {
    throw new ApiError(
      500,
      "Benchmark grading completed but its scores could not be loaded."
    )
  }

  return NextResponse.json({ comparison, generated })
})
