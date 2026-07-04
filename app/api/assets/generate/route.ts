import { NextResponse } from "next/server"

import {
  createGeneratedAssetRecord,
  parseAssetCategory,
  parseAssetKind,
  parseAssetScope,
} from "@/lib/assets"

export const dynamic = "force-dynamic"

type GenerateAssetRequest = {
  kind?: string
  scope?: string
  category?: string
  name?: string
  prompt?: string
  model?: string
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as GenerateAssetRequest
    const kind = parseAssetKind(payload.kind) ?? "image"
    const scope = parseAssetScope(payload.scope) ?? "global"
    const category = parseAssetCategory(payload.category)
    const prompt = clean(payload.prompt)
    const model = clean(payload.model) || "Local placeholder generator"

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const asset = await createGeneratedAssetRecord({
      kind,
      scope,
      category,
      name: clean(payload.name),
      prompt,
      model,
    })

    return NextResponse.json({ asset }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate asset" },
      { status: 500 }
    )
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
