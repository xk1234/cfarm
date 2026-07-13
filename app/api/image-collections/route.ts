import { NextResponse } from "next/server"
import { z } from "zod"

import { validate, providerFail } from "@/lib/api"
import {
  deleteImageCollections,
  listImageCollections,
  upsertImageCollection,
} from "@/lib/image-collections"

export const dynamic = "force-dynamic"

const collectionSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  created_at: z.string(),
  pinned: z.boolean().optional().default(false),
  images: z
    .array(
      z.object({
        image_link: z.string(),
        caption: z.string().default(""),
        hash: z.string().optional(),
        last_used_at: z.string().optional(),
      })
    )
    .default([]),
})

const deleteSchema = z.object({
  collections: z
    .array(z.object({ name: z.string(), created_at: z.string() }))
    .default([]),
})

export async function GET() {
  return NextResponse.json({ collections: await listImageCollections() })
}

export async function POST(request: Request) {
  try {
    const collection = validate(
      collectionSchema,
      await request.json().catch(() => null)
    )
    const saved = await upsertImageCollection(collection)
    return NextResponse.json({ collection: saved }, { status: 201 })
  } catch (error) {
    return providerFail(error, "Failed to save image collection", 400)
  }
}

export async function DELETE(request: Request) {
  try {
    const { collections } = validate(
      deleteSchema,
      await request.json().catch(() => ({}))
    )
    const result = await deleteImageCollections(collections)
    return NextResponse.json(result)
  } catch (error) {
    return providerFail(error, "Failed to delete image collections", 400)
  }
}
