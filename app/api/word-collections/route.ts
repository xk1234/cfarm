import { NextResponse } from "next/server"
import { z } from "zod"

import { validate } from "@/lib/api"
import {
  listWordCollections,
  upsertWordCollection,
} from "@/lib/word-collections"

export const dynamic = "force-dynamic"

const wordCollectionSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "name is required"),
  description: z.string().optional(),
  words: z.array(z.string()).default([]),
  source: z.enum(["manual", "ai", "research"]).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

export async function GET() {
  return NextResponse.json({ collections: await listWordCollections() })
}

export async function POST(request: Request) {
  try {
    const collection = validate(
      wordCollectionSchema,
      await request.json().catch(() => null)
    )
    const saved = await upsertWordCollection({ collection })
    return NextResponse.json({ collection: saved }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save word collection",
      },
      { status: 400 }
    )
  }
}

