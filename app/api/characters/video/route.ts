import { NextResponse } from "next/server"

import { generateCharacterVideoFromImage } from "@/lib/kie-video"

export const dynamic = "force-dynamic"

type CharacterVideoRequest = {
  imageUrl?: string
  prompt?: string
  model?: string
  duration?: string
  aspectRatio?: string
  sound?: boolean
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CharacterVideoRequest
    const imageUrl = clean(payload.imageUrl)
    const prompt = clean(payload.prompt)
    const apiKey = process.env.KIE_KEY ?? process.env.KIE_API_KEY ?? process.env.KIE_AI_API_KEY

    if (!imageUrl) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 })
    }
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }
    if (!apiKey) {
      return NextResponse.json({ error: "Missing KIE_KEY" }, { status: 500 })
    }

    const result = await generateCharacterVideoFromImage({
      imageUrl,
      prompt,
      model: clean(payload.model) || "Kling 2.6 Image to Video",
      duration: clean(payload.duration) || "5",
      aspectRatio: clean(payload.aspectRatio) || "9:16",
      sound: payload.sound === true,
      apiKey,
    })

    return NextResponse.json({
      ...result,
      prompt,
      model: clean(payload.model) || "Kling 2.6 Image to Video",
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate character video" },
      { status: 500 }
    )
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
