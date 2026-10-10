import { NextResponse } from "next/server"

import { providerFail, withHandler } from "@/lib/api"
import { importRemoteImagesToCollection } from "@/lib/image-collections"
import { requireWorkspaceId } from "@/lib/workspace"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  const workspaceId = await requireWorkspaceId()
  try {
    const payload = await request.json()
    const result = await importRemoteImagesToCollection(workspaceId, {
      collectionName: payload?.collectionName,
      collectionCreatedAt: payload?.collectionCreatedAt,
      images: payload?.images,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return providerFail(error, "Failed to import images", 400)
  }
})
