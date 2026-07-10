import { NextResponse } from "next/server"

import {
  listWordCollections,
  upsertWordCollection,
} from "@/lib/word-collections"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ collections: await listWordCollections() })
}

export async function POST(request: Request) {
  try {
    const collection = await request.json()
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
