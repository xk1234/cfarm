import { NextResponse } from "next/server"

import {
  createSlideshowRecord,
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
      limit: Number.isFinite(limitValue) && limitValue > 0 ? limitValue : undefined,
    }),
    listSlideshowRecords(),
  ])

  return NextResponse.json({
    slideshows,
    slideshowsCount: allSlideshows.length,
    videosCount: 0,
  })
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null)
  const slideshow = await createSlideshowRecord(isRecord(payload) ? payload as CreateSlideshowInput : {})

  return NextResponse.json({ slideshow }, { status: 201 })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")?.trim()

  if (!id) {
    return NextResponse.json({ error: "A slideshow id is required" }, { status: 400 })
  }

  const slideshow = await deleteSlideshowRecord({ id })
  if (!slideshow) {
    return NextResponse.json({ error: "Slideshow not found" }, { status: 404 })
  }

  return NextResponse.json({ slideshow })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
