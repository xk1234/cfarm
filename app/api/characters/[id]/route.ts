import { NextResponse } from "next/server"

import { readRouteId } from "@/lib/api"

import { deleteCharacter } from "@/lib/characters"

export const dynamic = "force-dynamic"

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = await readRouteId(params)
  if (!id) {
    return NextResponse.json({ error: "Missing character id" }, { status: 400 })
  }

  const result = await deleteCharacter(id)
  return NextResponse.json(result)
}
