import { NextResponse } from "next/server"

import {
  editImageWithFluxKontext,
  getKieApiKey,
  upscaleImageWithTopaz,
  type KieImageMode,
} from "@/lib/kie-image"

export const dynamic = "force-dynamic"

type ImageActionRequest = {
  mode?: string
  imageUrl?: string
  prompt?: string
  upscaleFactor?: string
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as ImageActionRequest
    const mode = payload.mode === "upscale" ? "upscale" : "edit"
    const imageUrl = clean(payload.imageUrl)
    const apiKey = getKieApiKey()

    if (!apiKey) {
      return NextResponse.json({ error: "Missing KIE_KEY" }, { status: 500 })
    }
    if (!imageUrl) {
      return NextResponse.json({ error: "Image URL is required" }, { status: 400 })
    }
    if (mode === "edit" && !clean(payload.prompt)) {
      return NextResponse.json({ error: "Edit prompt is required" }, { status: 400 })
    }

    const result = await runImageAction(mode, {
      imageUrl,
      apiKey,
      prompt: clean(payload.prompt),
      upscaleFactor: clean(payload.upscaleFactor),
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image action failed" },
      { status: 500 }
    )
  }
}

function runImageAction(
  mode: KieImageMode,
  input: { imageUrl: string; apiKey: string; prompt: string; upscaleFactor: string }
) {
  if (mode === "upscale") {
    return upscaleImageWithTopaz(input)
  }

  return editImageWithFluxKontext(input)
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
