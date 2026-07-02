import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

import { normalizeCharacterAttributes, type Character } from "@/lib/character-model"

export const dynamic = "force-dynamic"

const fluxCreateUrl = "https://api.kie.ai/api/v1/flux/kontext/generate"
const fluxRecordUrl = "https://api.kie.ai/api/v1/flux/kontext/record-info"
const headshotFolder = path.join(process.cwd(), "data", "characters", "headshots")

type HeadshotRequest = {
  name?: string
  attributes?: Character
  customPrompt?: string
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as HeadshotRequest
    const attributes = normalizeCharacterAttributes(payload.attributes ?? {})
    const name = payload.name?.trim() || attributes.name || "New character"
    const apiKey = process.env.KIE_KEY ?? process.env.KIE_API_KEY ?? process.env.KIE_AI_API_KEY ?? process.env.FLUX_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: "Missing KIE_KEY" }, { status: 500 })
    }

    const prompt = buildHeadshotPrompt(name, attributes, payload.customPrompt)
    const taskId = await createFluxTask(apiKey, prompt)
    const imageUrl = await pollFluxTask(apiKey, taskId)
    const previewUrl = await downloadHeadshot(taskId, imageUrl)

    return NextResponse.json({
      preview_url: previewUrl,
      task_id: taskId,
      prompt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate character headshot" },
      { status: 500 }
    )
  }
}

function buildHeadshotPrompt(name: string, attributes: Character, customPrompt?: string) {
  const characterJson = JSON.stringify({ ...attributes, name }, null, 2)
  const extraPrompt = customPrompt?.trim()

  return [
    "Generate a photorealistic AI UGC character headshot on a clean white background.",
    "The image must be a front-facing shoulders-up portrait, centered, evenly lit, with natural skin texture, realistic facial proportions, and no text, watermark, logo, border, or UI elements.",
    "Keep the identity consistent with this character JSON. Treat the JSON as the source of truth for age, ethnicity, gender, hair, eyes, face, skin, build, clothing, posture, emotion, accessories, and voice cues.",
    "Character JSON:",
    characterJson,
    extraPrompt ? `Custom prompt: ${extraPrompt}` : "Custom prompt: professional neutral headshot, white background, passport-style crop but natural UGC realism.",
  ].join("\n\n")
}

async function createFluxTask(apiKey: string, prompt: string) {
  const response = await fetch(fluxCreateUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      aspectRatio: "1:1",
      outputFormat: "png",
      promptUpsampling: false,
      model: "flux-kontext-pro",
    }),
  })

  const json = await response.json().catch(() => undefined)
  const taskId = getNestedString(json, ["data", "taskId"])

  if (!response.ok || !taskId) {
    throw new Error(getNestedString(json, ["msg"]) || "Flux task creation failed")
  }

  return taskId
}

async function pollFluxTask(apiKey: string, taskId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    const response = await fetch(`${fluxRecordUrl}?taskId=${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })
    const json = await response.json().catch(() => undefined)

    if (!response.ok) {
      throw new Error(getNestedString(json, ["msg"]) || "Flux task polling failed")
    }

    const status = getNestedString(json, ["data", "status"])
    if (status === "SUCCESS") {
      const imageUrl = getNestedString(json, ["data", "response", "resultImageUrl"])
      if (!imageUrl) {
        throw new Error("Flux task completed without a result image")
      }
      return imageUrl
    }

    if (status === "CREATE_TASK_FAILED" || status === "GENERATE_FAILED") {
      throw new Error(getNestedString(json, ["data", "errorMessage"]) || `Flux task failed: ${status}`)
    }
  }

  throw new Error("Flux task timed out")
}

async function downloadHeadshot(taskId: string, imageUrl: string) {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error("Failed to download generated headshot")
  }

  const contentType = response.headers.get("content-type") ?? ""
  const extension = contentType.includes("webp")
    ? ".webp"
    : contentType.includes("jpeg") || contentType.includes("jpg")
      ? ".jpg"
      : ".png"
  const safeTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "")
  const fileName = `${Date.now()}-${safeTaskId || "headshot"}${extension}`
  const filePath = path.join(headshotFolder, fileName)
  await mkdir(headshotFolder, { recursive: true })
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()))

  return `/api/local-assets/characters/headshots/${encodeURIComponent(fileName)}`
}

function getNestedString(value: unknown, pathParts: string[]) {
  let current = value
  for (const part of pathParts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === "string" ? current : undefined
}
