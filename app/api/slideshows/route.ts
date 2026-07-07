import { isRecord } from "@/lib/guards"
import { NextResponse } from "next/server"

import {
  createSlideshowResultRecord,
  deleteSlideshowRecord,
  listSlideshowRecords,
  type CreateSlideshowInput,
} from "@/lib/slideshows"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
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
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const { slideshow, result } = await createSlideshowResultRecord(
    isRecord(payload) ? (payload as CreateSlideshowInput) : {}
  )

  return NextResponse.json({ slideshow, result }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")?.trim()

  if (!id) {
    return NextResponse.json(
      { error: "A slideshow id is required" },
      { status: 400 }
    )
  }

  const slideshow = await deleteSlideshowRecord({ id })
  if (!slideshow) {
    return NextResponse.json({ error: "Slideshow not found" }, { status: 404 })
  }

  return NextResponse.json({ slideshow })
}

