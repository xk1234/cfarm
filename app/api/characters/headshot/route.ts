import path from "node:path"

import { NextResponse } from "next/server"

import {
  normalizeCharacterAttributes,
  type Character,
} from "@/lib/character-model"
import { buildHeadshotPrompt } from "@/lib/character-headshot-prompt"
import {
  downloadRemoteImageToLocalAsset,
  getKieApiKey,
  runFluxKontextTask,
  uploadKieBase64Image,
} from "@/lib/kie-image"
import { kieFluxKontextModel } from "@/lib/realfarm-generation-model-registry"

export const dynamic = "force-dynamic"

const headshotFolder = path.join(
  process.cwd(),
  "data",
  "characters",
  "headshots"
)
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

    const prompt = buildHeadshotPrompt({
      name,
      attributes,
      customPrompt: payload.customPrompt,
    })
    if (!apiKey) {
      return NextResponse.json({ error: "Missing KIE_KEY" }, { status: 500 })
    }

    const sourceImageDataUrl = validSourceImageDataUrl(
      payload.sourceImageDataUrl
    )
    const inputImage = sourceImageDataUrl
      ? await uploadSourceImage(apiKey, sourceImageDataUrl, name)
      : undefined
    const { taskId, url: imageUrl } = await runFluxKontextTask({
      apiKey,
      prompt,
      inputImage,
      aspectRatio: "1:1",
      model: kieFluxKontextModel,
      pollLimit: fluxPollLimit,
      pollDelayMs: fluxPollDelayMs,
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
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate character headshot",
      },
      { status: 500 }
    )
  }
}

async function uploadSourceImage(
  apiKey: string,
  sourceImageDataUrl: string,
  name: string
) {
  const extension =
    sourceImageDataUrl
      .match(/^data:image\/([^;]+);base64,/i)?.[1]
      ?.replace("jpeg", "jpg") ?? "png"
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
    throw new Error(
      "Uploaded source image must be a PNG, JPG, or WEBP data URL"
    )
  }
  return input
}

function safeFilePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
}
