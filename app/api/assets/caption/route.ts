import { NextResponse } from "next/server"

import { providerFail } from "@/lib/api"

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
    return providerFail(error, "Failed to caption asset", 500)
  }
}
