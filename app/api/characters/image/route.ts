import path from "node:path"

import { NextResponse } from "next/server"

import { upsertCharacterImageGeneration } from "@/lib/character-image-generations"
import {
  createFluxKontextTask,
  downloadRemoteImageToLocalAsset,
  getKieApiKey,
  pollFluxKontextTask,
  prepareKieInputImageUrl,
} from "@/lib/kie-image"
import { characterImageAspectRatios, type CharacterPromptAttachment } from "@/lib/realfarm-character-ui"

export const dynamic = "force-dynamic"

const characterImagesFolder = path.join(process.cwd(), "data", "characters", "images")
const fluxPollLimit = 70
const fluxPollDelayMs = 3000

type CharacterImageRequest = {
  characterId?: number
  prompt?: string
  model?: string
  aspectRatio?: string
  attachments?: Array<{
    kind?: string
    label?: string
    url?: string
  }>
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CharacterImageRequest
    const prompt = clean(payload.prompt)
    const aspectRatio = allowedAspectRatio(payload.aspectRatio)
    const apiKey = getKieApiKey()

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }
    if (!apiKey) {
      return NextResponse.json({ error: "Missing KIE_KEY" }, { status: 500 })
    }

    const inputImage = await prepareReferenceImage({
      apiKey,
      attachments: payload.attachments ?? [],
    })
    const taskId = await createFluxKontextTask({
      apiKey,
      prompt,
      inputImage,
      aspectRatio,
      model: payload.model,
    })
    const remoteImageUrl = await pollFluxKontextTask({
      apiKey,
      taskId,
      pollLimit: fluxPollLimit,
      pollDelayMs: fluxPollDelayMs,
      failedMessage: "Flux task failed",
      timeoutMessage: "Flux task timed out",
    })
    const imageUrl = await downloadCharacterImage(taskId, remoteImageUrl)
    const generation = await upsertCharacterImageGeneration({
      id: taskId,
      characterId: numberValue(payload.characterId),
      prompt,
      model: clean(payload.model) || "Flux",
      createdAt: new Date().toISOString(),
      attachments: normalizeAttachments(payload.attachments),
      aspectRatio,
      status: "ready",
      imageUrl,
      progress: 100,
    })

    return NextResponse.json({
      imageUrl,
      taskId,
      prompt,
      aspectRatio,
      generation,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate character image" },
      { status: 500 }
    )
  }
}

async function prepareReferenceImage(input: {
  apiKey: string
  attachments: NonNullable<CharacterImageRequest["attachments"]>
}) {
  const reference = input.attachments.find((attachment) => attachment.kind === "character_headshot" && clean(attachment.url)) ??
    input.attachments.find((attachment) => clean(attachment.url))
  const imageUrl = clean(reference?.url)
  if (!imageUrl) {
    return undefined
  }
  return prepareKieInputImageUrl({
    imageUrl,
    apiKey: input.apiKey,
  })
}

async function downloadCharacterImage(taskId: string, imageUrl: string) {
  return downloadRemoteImageToLocalAsset({
    imageUrl,
    taskId,
    folder: characterImagesFolder,
    publicPrefix: "/api/local-assets/characters/images",
    fallbackName: "character-image",
    failureMessage: "Failed to download generated character image",
  })
}

function allowedAspectRatio(value: unknown) {
  const ratio = clean(value)
  return characterImageAspectRatios.includes(ratio as (typeof characterImageAspectRatios)[number])
    ? ratio
    : characterImageAspectRatios[0]
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function normalizeAttachments(value: CharacterImageRequest["attachments"]): CharacterPromptAttachment[] {
  return Array.isArray(value)
    ? value.flatMap((attachment) => {
        const label = clean(attachment.label)
        const url = clean(attachment.url)
        const kind = attachment.kind === "character_headshot" ? "character_headshot" : attachment.kind === "asset" ? "asset" : undefined
        return label && url && kind ? [{ label, url, kind }] : []
      })
    : []
}
