import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  createSlideshowResultRecord,
  listSlideshowRecords,
  type CreateSlideshowInput,
} from "@/lib/slideshows"
import {
  benchmarkAndStoreGeneratedSlideshow,
  benchmarkContextFromSlides,
  benchmarkSlidesFromSlideshow,
} from "@/lib/slideshow-benchmarks"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const limitValue = Number(searchParams.get("limit"))
  const id = searchParams.get("id")?.trim()
  const limit =
    Number.isFinite(limitValue) && limitValue > 0 ? limitValue : undefined
  const allSlideshows = await listSlideshowRecords({
    limit: Number.MAX_SAFE_INTEGER,
  })
  const slideshows = allSlideshows
    .filter((slideshow) => !id || slideshow.id === id)
    .slice(0, Math.max(1, limit ?? 100))

  return NextResponse.json({
    slideshows,
    slideshowsCount: allSlideshows.length,
    videosCount: allSlideshows.filter(
      (slideshow) => slideshow.settings.export_as_video
    ).length,
  })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const { slideshow, result } = await createSlideshowResultRecord(
    isRecord(payload) ? (payload as CreateSlideshowInput) : {}
  )

  let benchmark = null
  let benchmarkError = ""
  try {
    const benchmarkSlides = benchmarkSlidesFromSlideshow(slideshow)
    benchmark = await benchmarkAndStoreGeneratedSlideshow({
      slideshowId: slideshow.id,
      runId: result.runId,
      automationId: slideshow.automationId,
      title: slideshow.title,
      icp: benchmarkContextFromSlides({
        title: slideshow.title,
        slides: benchmarkSlides,
      }),
      slides: benchmarkSlides,
    })
  } catch (error) {
    benchmarkError =
      error instanceof Error ? error.message : "Slideshow benchmark failed"
  }

  return NextResponse.json(
    {
      slideshow,
      result,
      benchmark,
      benchmarkError: benchmarkError || undefined,
    },
    { status: 201 }
  )
})
