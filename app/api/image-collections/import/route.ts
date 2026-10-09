import { NextResponse } from "next/server"

import { providerFail } from "@/lib/api"

import { importRemoteImagesToCollection } from "@/lib/image-collections"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const result = await importRemoteImagesToCollection({
      collectionName: payload?.collectionName,
      collectionCreatedAt: payload?.collectionCreatedAt,
      mediaType: payload?.mediaType,
      images: payload?.images,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return providerFail(error, "Failed to import images", 400)
  }
}
