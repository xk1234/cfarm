import { NextResponse } from "next/server"

import {
  normalizeCharacterAttributes,
  type Character,
} from "@/lib/character-model"
import { buildCharacterAttributesPrompt } from "@/lib/character-attributes-prompt"
import { openRouterChatCompletion } from "@/lib/openrouter"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"

export const dynamic = "force-dynamic"

type AttributeRequest = {
  name?: string
  sourceImageDataUrl?: string
  currentAttributes?: Partial<Character>
}

type OpenRouterResponse = {
  choices?: {
    message?: {
      content?: string
    }
  }[]
  error?: {
    message?: string
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as AttributeRequest
    const apiKey = process.env.OPENROUTER_API_KEY
    const sourceImageDataUrl = validSourceImageDataUrl(
      payload.sourceImageDataUrl
    )

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENROUTER_API_KEY" },
        { status: 500 }
      )
    }

    const extracted = await extractCharacterAttributes({
      apiKey,
      name: payload.name,
      sourceImageDataUrl,
      currentAttributes: payload.currentAttributes,
    })
    const name = extracted.name || payload.name?.trim() || "New character"
    const attributes = normalizeCharacterAttributes({ ...extracted, name })

    return NextResponse.json({ name, attributes })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to extract character attributes",
      },
      { status: 500 }
    )
  }
}

async function extractCharacterAttributes({
  apiKey,
  name,
  sourceImageDataUrl,
  currentAttributes,
}: {
  apiKey: string
  name?: string
  sourceImageDataUrl: string
  currentAttributes?: Partial<Character>
}) {
  const { ok, status, payload } = await openRouterChatCompletion({
    apiKey,
    model: openRouterModelForUseCase("characterAttributes"),
    headers: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "LumenClip Character Attribute Extractor",
    },
    messages: buildCharacterAttributesPrompt({
      name,
      sourceImageDataUrl,
      currentAttributes,
    }),
  })

  const body = payload as OpenRouterResponse
  if (!ok) {
    throw new Error(
      body.error?.message ||
        `Character attribute extraction failed with ${status}`
    )
  }

  return parseJsonObject(body.choices?.[0]?.message?.content)
}

function parseJsonObject(content: unknown) {
  const text = typeof content === "string" ? content.trim() : ""
  if (!text) {
    throw new Error("Character attribute extraction returned an empty response")
  }

  const unfenced = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  const jsonStart = unfenced.indexOf("{")
  const jsonEnd = unfenced.lastIndexOf("}")
  const jsonText =
    jsonStart >= 0 && jsonEnd > jsonStart
      ? unfenced.slice(jsonStart, jsonEnd + 1)
      : unfenced
  const parsed = JSON.parse(jsonText) as unknown
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Character attribute extraction did not return an object")
  }

  return parsed as Partial<Character>
}

function validSourceImageDataUrl(value: unknown) {
  const input = typeof value === "string" ? value.trim() : ""
  if (!input) {
    throw new Error("Upload an image first")
  }
  if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(input)) {
    throw new Error(
      "Uploaded source image must be a PNG, JPG, or WEBP data URL"
    )
  }
  return input
}
