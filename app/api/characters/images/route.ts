import { NextResponse } from "next/server"

import { listCharacterImageGenerations } from "@/lib/character-image-generations"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const characterId = Number(searchParams.get("characterId"))
  const generations = await listCharacterImageGenerations({
    characterId: Number.isFinite(characterId) ? characterId : undefined,
  })

  return NextResponse.json({ generations })
}
