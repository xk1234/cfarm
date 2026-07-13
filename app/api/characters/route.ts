import { NextResponse } from "next/server"
import { z } from "zod"

import { validate, providerFail } from "@/lib/api"
import type { Character } from "@/lib/character-model"
import { listCharacters, saveCharacter } from "@/lib/characters"

export const dynamic = "force-dynamic"

// `attributes` is normalized/defaulted downstream, so it is only shape-checked
// as an object here; `name` is the one field the store depends on being present.
const characterPayloadSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "name is required"),
  attributes: z.record(z.string(), z.unknown()).default({}),
  preview_url: z.string().optional(),
})

export async function GET() {
  const characters = await listCharacters()
  return NextResponse.json({ characters })
}

export async function POST(request: Request) {
  try {
    const parsed = validate(
      characterPayloadSchema,
      await request.json().catch(() => null)
    )
    const character = await saveCharacter({
      id: parsed.id,
      name: parsed.name,
      preview_url: parsed.preview_url,
      attributes: parsed.attributes as Character,
    })
    return NextResponse.json({ character }, { status: 201 })
  } catch (error) {
    return providerFail(error, "Failed to save character", 400)
  }
}

