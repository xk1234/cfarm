import { NextResponse } from "next/server"
import { z } from "zod"

import { validate, providerFail, withHandler } from "@/lib/api"
import {
  deleteImageCollections,
  listImageCollections,
  restoreImageCollections,
  upsertImageCollection,
} from "@/lib/image-collections"
import { requireWorkspaceId } from "@/lib/workspace"

export const dynamic = "force-dynamic"

const collectionSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  created_at: z.string(),
  pinned: z.boolean().optional().default(false),
  mediaType: z.enum(["image", "video"]).optional(),
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

const restoreSchema = deleteSchema.extend({ action: z.literal("restore") })

export const GET = withHandler(async () => {
  const workspaceId = await requireWorkspaceId()
  return NextResponse.json({ collections: await listImageCollections(workspaceId) })
})

export const POST = withHandler(async (request: Request) => {
  const workspaceId = await requireWorkspaceId()
  try {
    const payload = await request.json().catch(() => null)
    if (payload?.action === "restore") {
      const { collections } = validate(restoreSchema, payload)
      return NextResponse.json(await restoreImageCollections(workspaceId, collections))
    }
    const collection = validate(collectionSchema, payload)
    const saved = await upsertImageCollection(workspaceId, collection)
    return NextResponse.json({ collection: saved }, { status: 201 })
  } catch (error) {
    return providerFail(error, "Failed to save image collection", 400)
  }
})

export const DELETE = withHandler(async (request: Request) => {
  const workspaceId = await requireWorkspaceId()
  try {
    const { collections } = validate(
      deleteSchema,
      await request.json().catch(() => ({}))
    )
    const result = await deleteImageCollections(workspaceId, collections)
    return NextResponse.json(result)
  } catch (error) {
    return providerFail(error, "Failed to delete image collections", 400)
  }
})
