import { NextResponse } from "next/server"

import { withHandler, readRouteId } from "@/lib/api"
import { deleteSlideshowRecord } from "@/lib/slideshows"

export const dynamic = "force-dynamic"

export const DELETE = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "A slideshow id is required" },
        { status: 400 }
      )
    }

    const slideshow = await deleteSlideshowRecord({ id })
    if (!slideshow) {
      return NextResponse.json(
        { error: "Slideshow not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({ slideshow })
  }
)
