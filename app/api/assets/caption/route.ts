import { NextResponse } from "next/server"

import { updateAssetCaption } from "@/lib/assets"

export const dynamic = "force-dynamic"

type CaptionAssetRequest = {
  id?: string
  caption?: string
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CaptionAssetRequest
    const id = payload.id?.trim()
    if (!id) {
      return NextResponse.json({ error: "Asset id is required" }, { status: 400 })
    }

    const asset = await updateAssetCaption({
      id,
      caption: payload.caption ?? "",
    })
    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    }

    return NextResponse.json({ asset })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to caption asset" },
      { status: 500 }
    )
  }
}
