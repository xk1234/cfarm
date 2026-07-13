import { NextResponse } from "next/server"

import { readRouteId } from "@/lib/api"

import {
  deleteKnowledgeBase,
  queueKnowledgeBaseRefresh,
} from "@/lib/knowledge-bases"

export const dynamic = "force-dynamic"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await readRouteId(params)
  if (!id) {
    return NextResponse.json(
      { error: "Knowledge base id is required" },
      { status: 400 }
    )
  }
  const deleted = await deleteKnowledgeBase(id)
  return deleted
    ? NextResponse.json({ knowledgeBase: deleted })
    : NextResponse.json({ error: "Knowledge base not found" }, { status: 404 })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "Knowledge base id is required" },
        { status: 400 }
      )
    }
    const body = (await request.json().catch(() => ({}))) as {
      sourceIds?: string[]
    }
    const knowledgeBase = await queueKnowledgeBaseRefresh(
      id,
      body.sourceIds
    )
    return knowledgeBase
      ? NextResponse.json({ knowledgeBase })
      : NextResponse.json(
          { error: "Knowledge base not found" },
          { status: 404 }
        )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to refresh knowledge base",
      },
      { status: 400 }
    )
  }
}
