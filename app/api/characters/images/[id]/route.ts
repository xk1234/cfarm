import { NextResponse } from "next/server"

import { readRouteId } from "@/lib/api"

import { deleteCharacterImageGeneration } from "@/lib/character-image-generations"

export const dynamic = "force-dynamic"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await readRouteId(params)
  if (!id) {
    return NextResponse.json({ error: "Missing generation id" }, { status: 400 })
  }

  const result = await deleteCharacterImageGeneration({ id })
  return NextResponse.json(result)
}
