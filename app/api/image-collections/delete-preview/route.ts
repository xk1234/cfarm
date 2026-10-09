import { NextResponse } from "next/server"
import { z } from "zod"

import { providerFail, validate, withHandler } from "@/lib/api"
import { listImageCollections } from "@/lib/image-collections"
import { requireWorkspaceId } from "@/lib/workspace"

export const dynamic = "force-dynamic"

const schema = z.object({
  collections: z
    .array(
      z.object({
        name: z.string(),
        created_at: z.string(),
      })
    )
    .min(1),
})

export const POST = withHandler(async (request: Request) => {
  const workspaceId = await requireWorkspaceId()
  try {
    const input = validate(schema, await request.json().catch(() => null))
    const collections = await listImageCollections(workspaceId)
    const requested = new Set(
      input.collections.map((item) => `${item.name}::${item.created_at}`)
    )
    const selected = collections.filter((collection) =>
      requested.has(`${collection.name}::${collection.created_at}`)
    )
    return NextResponse.json({
      collections: selected.map((collection) => ({
        name: collection.name,
        created_at: collection.created_at,
        itemCount: collection.images.length,
      })),
      itemCount: selected.reduce(
        (total, collection) => total + collection.images.length,
        0
      ),
      recoveryDays: 30,
    })
  } catch (error) {
    return providerFail(error, "Failed to inspect collection dependencies", 400)
  }
})
