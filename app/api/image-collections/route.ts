import { NextResponse } from "next/server"

import {
  deleteImageCollections,
  listImageCollections,
  upsertImageCollection,
  type ImageCollectionDeleteInput,
  type StoredImageCollection,
} from "@/lib/image-collections"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ collections: await listImageCollections() })
}

export async function POST(request: Request) {
  try {
    const collection = (await request.json()) as StoredImageCollection
    const saved = await upsertImageCollection(collection)
    return NextResponse.json({ collection: saved }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save image collection" },
      { status: 400 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { collections?: ImageCollectionDeleteInput[] }
    const result = await deleteImageCollections(Array.isArray(payload.collections) ? payload.collections : [])
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete image collections" },
      { status: 400 }
    )
  }
}
