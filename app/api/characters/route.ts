import { NextResponse } from "next/server"

import { deleteCharacter, listCharacters, saveCharacter, type CharacterPayload } from "@/lib/characters"

export const dynamic = "force-dynamic"

export async function GET() {
  const characters = await listCharacters()
  return NextResponse.json({ characters })
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CharacterPayload
    const character = await saveCharacter(payload)
    return NextResponse.json({ character }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save character" },
      { status: 400 }
    )
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = Number(searchParams.get("id"))
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Missing character id" }, { status: 400 })
  }

  const result = await deleteCharacter(id)
  return NextResponse.json(result)
}
