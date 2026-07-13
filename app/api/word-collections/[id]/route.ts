import { NextResponse } from "next/server"

import { readRouteId } from "@/lib/api"

import { deleteWordCollection } from "@/lib/word-collections"

export const dynamic = "force-dynamic"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "Variable collection id is required" },
        { status: 400 }
      )
    }
    const deleted = await deleteWordCollection({ id })
    if (!deleted) {
      return NextResponse.json(
        { error: "Variable collection was not found" },
        { status: 404 }
      )
    }
    return NextResponse.json({ collection: deleted })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete variable collection",
      },
      { status: 400 }
    )
  }
}
