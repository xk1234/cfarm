import path from "node:path"

import { NextResponse } from "next/server"

import { normalizeCharacterAttributes, type Character } from "@/lib/character-model"
import {
  createFluxKontextTask,
  downloadRemoteImageToLocalAsset,
  getKieApiKey,
  pollFluxKontextTask,
  uploadKieBase64Image,
} from "@/lib/kie-image"

export const dynamic = "force-dynamic"

const headshotFolder = path.join(process.cwd(), "data", "characters", "headshots")
const fluxPollLimit = 70
const fluxPollDelayMs = 3000

type HeadshotRequest = {
  name?: string
  attributes?: Character
  customPrompt?: string
  sourceImageDataUrl?: string
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as HeadshotRequest
    const attributes = normalizeCharacterAttributes(payload.attributes ?? {})
    const name = payload.name?.trim() || attributes.name || "New character"
    const apiKey = getKieApiKey()

    const prompt = buildHeadshotPrompt(name, attributes, payload.customPrompt)
    if (!apiKey) {
      return NextResponse.json({ error: "Missing KIE_KEY" }, { status: 500 })
    }

    const sourceImageDataUrl = validSourceImageDataUrl(payload.sourceImageDataUrl)
    const inputImage = sourceImageDataUrl ? await uploadSourceImage(apiKey, sourceImageDataUrl, name) : undefined
    const taskId = await createFluxKontextTask({
      apiKey,
      prompt,
      inputImage,
      aspectRatio: "1:1",
      model: "flux-kontext-pro",
    })
    const imageUrl = await pollFluxKontextTask({
      apiKey,
      taskId,
      pollLimit: fluxPollLimit,
      pollDelayMs: fluxPollDelayMs,
      failedMessage: "Flux task failed",
      timeoutMessage: "Flux task timed out",
    })
    const previewUrl = await downloadHeadshot(taskId, imageUrl)

    return NextResponse.json({
      preview_url: previewUrl,
      task_id: taskId,
      prompt,
      attributes,
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
    "Use the uploaded character image only as a visual reference when one is provided. Do not return the uploaded image itself; generate a new clean headshot from the reference plus the character JSON.",
    "Character JSON:",
    characterJson,
    extraPrompt ? `Custom prompt: ${extraPrompt}` : "Custom prompt: professional neutral headshot, white background, passport-style crop but natural UGC realism.",
  ].join("\n\n")
}

async function uploadSourceImage(apiKey: string, sourceImageDataUrl: string, name: string) {
  const extension = sourceImageDataUrl.match(/^data:image\/([^;]+);base64,/i)?.[1]?.replace("jpeg", "jpg") ?? "png"
  const fileName = `${Date.now()}-${safeFilePart(name) || "character-source"}.${extension}`
  return uploadKieBase64Image({
    apiKey,
    base64Data: sourceImageDataUrl,
    fileName,
    uploadPath: "images/realfarm/characters",
    failureMessage: "Failed to upload character source image",
  })
}

async function downloadHeadshot(taskId: string, imageUrl: string) {
  return downloadRemoteImageToLocalAsset({
    imageUrl,
    taskId,
    folder: headshotFolder,
    publicPrefix: "/api/local-assets/characters/headshots",
    fallbackName: "headshot",
    failureMessage: "Failed to download generated headshot",
  })
}

function validSourceImageDataUrl(value: unknown) {
  const input = typeof value === "string" ? value.trim() : ""
  if (!input) {
    return undefined
  }
  if (!/^data:image\/(?:png|jpe?g|webp);base64,/i.test(input)) {
    throw new Error("Uploaded source image must be a PNG, JPG, or WEBP data URL")
  }
  return input
}

function safeFilePart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)
}
