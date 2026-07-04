import { NextResponse } from "next/server"

import { importRemoteImagesToCollection } from "@/lib/image-collections"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const result = await importRemoteImagesToCollection({
      collectionName: payload?.collectionName,
      collectionCreatedAt: payload?.collectionCreatedAt,
      images: payload?.images,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import images" },
      { status: 400 }
    )
  }
}
