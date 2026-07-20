import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import {
  createSlideshowResultRecord,
  listSlideshowRecords,
  type CreateSlideshowInput,
} from "@/lib/slideshows"
import { countResultRecords } from "@/lib/results"
import { enqueueReminder } from "@/lib/reminders"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const limitValue = Number(searchParams.get("limit"))
  const id = searchParams.get("id")?.trim()
  const limit = Math.min(
    100,
    Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 100
  )
  const [slideshows, slideshowsCount, videosCount] = await Promise.all([
    listSlideshowRecords({ id, limit: id ? 1 : limit }),
    countResultRecords({ workflowType: "slideshow" }),
    countResultRecords({ workflowType: "slideshow", hasVideo: true }),
  ])

  return NextResponse.json({
    slideshows,
    slideshowsCount,
    videosCount,
  })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const { slideshow, result } = await createSlideshowResultRecord(
    isRecord(payload) ? (payload as CreateSlideshowInput) : {}
  )
  await enqueueReminder({
    event: "generated",
    sourceType: "slideshow",
    sourceId: slideshow.id,
    text: `Slideshow generated\n${slideshow.title}`,
  }).catch(() => undefined)

  return NextResponse.json(
    {
      slideshow,
      result,
    },
    { status: 201 }
  )
})
