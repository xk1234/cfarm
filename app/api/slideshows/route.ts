import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  createSlideshowResultRecord,
  listSlideshowRecords,
  type CreateSlideshowInput,
} from "@/lib/slideshows"
import { benchmarkAndStoreGeneratedSlideshow } from "@/lib/slideshow-benchmarks"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const limitValue = Number(searchParams.get("limit"))
  const id = searchParams.get("id")?.trim()
  const [slideshows, allSlideshows] = await Promise.all([
    listSlideshowRecords({
      id: id || undefined,
      limit:
        Number.isFinite(limitValue) && limitValue > 0 ? limitValue : undefined,
    }),
    listSlideshowRecords({ limit: Number.MAX_SAFE_INTEGER }),
  ])

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
    benchmark = await benchmarkAndStoreGeneratedSlideshow({
      slideshowId: slideshow.id,
      runId: result.runId,
      automationId: slideshow.automationId,
      title: slideshow.title,
      icp: [slideshow.title, slideshow.prompt].filter(Boolean).join(" · "),
      slides: slideshow.output_images.map((imageUrl, index) => ({
        id: `${slideshow.id}-slide-${index + 1}`,
        imageUrl,
        text: slideshow.images[index]?.textItems
          ?.map((item) => item.text)
          .filter(Boolean)
          .join("\n"),
        role: index === 0 ? "hook" : "content",
      })),
    })
  } catch (error) {
    benchmarkError =
      error instanceof Error ? error.message : "Slideshow benchmark failed"
  }

  return NextResponse.json(
    { slideshow, result, benchmark, benchmarkError: benchmarkError || undefined },
    { status: 201 }
  )
})

