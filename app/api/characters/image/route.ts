import { clean } from "@/lib/guards"
import path from "node:path"

import { NextResponse } from "next/server"

import { buildNanoBananaProPayload } from "@/lib/character-workflows"
import { upsertCharacterImageGeneration } from "@/lib/character-image-generations"
import {
  createFluxKontextTask,
  createKieMarketTask,
  downloadRemoteImageToLocalAsset,
  getKieApiKey,
  pollFluxKontextTask,
  pollKieMarketTask,
  prepareKieInputFileUrl,
} from "@/lib/kie-image"
import {
  characterImageAspectRatios,
  characterWorkflowOptions,
  type CharacterPromptAttachment,
  type CharacterWorkflowKey,
  type CharacterWorkflowMetadata,
} from "@/lib/realfarm-character-ui"
import { defaultCharacterImageGenerationModel } from "@/lib/realfarm-generation-model-registry"

export const dynamic = "force-dynamic"

const characterImagesFolder = path.join(
  process.cwd(),
  "data",
  "characters",
  "images"
)
const fluxPollLimit = 70
const fluxPollDelayMs = 3000
const kieMarketPollLimit = 80
const kieMarketPollDelayMs = 3000

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
  workflow?: string
  workflowLabel?: string
  workflowMetadata?: unknown
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

    const model = clean(payload.model) || defaultCharacterImageGenerationModel
    const inputImages = await prepareReferenceImages({
      apiKey,
      attachments: payload.attachments ?? [],
    })
    const { taskId, remoteImageUrl } = isNanoBananaProModel(model)
      ? await generateNanoBananaProImage({
          apiKey,
          prompt,
          aspectRatio,
          inputImages,
        })
      : await generateFluxImage({
          apiKey,
          prompt,
          aspectRatio,
          inputImage: inputImages[0],
          model,
        })
    const imageUrl = await downloadCharacterImage(taskId, remoteImageUrl)
    const generation = await upsertCharacterImageGeneration({
      id: taskId,
      characterId: numberValue(payload.characterId),
      prompt,
      model,
      createdAt: new Date().toISOString(),
      attachments: normalizeAttachments(payload.attachments),
      aspectRatio,
      status: "ready",
      imageUrl,
      progress: 100,
      workflow: allowedWorkflow(payload.workflow),
      workflowLabel: clean(payload.workflowLabel) || undefined,
      workflowMetadata: normalizeWorkflowMetadata(payload.workflowMetadata),
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
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate character image",
      },
      { status: 500 }
    )
  }
}

async function generateNanoBananaProImage(input: {
  apiKey: string
  prompt: string
  aspectRatio: string
  inputImages: string[]
}) {
  const taskId = await createKieMarketTask({
    apiKey: input.apiKey,
    body: buildNanoBananaProPayload({
      prompt: input.prompt,
      imageUrls: input.inputImages,
      aspectRatio: input.aspectRatio,
    }),
  })
  const remoteImageUrl = await pollKieMarketTask({
    apiKey: input.apiKey,
    taskId,
    pollLimit: kieMarketPollLimit,
    pollDelayMs: kieMarketPollDelayMs,
  })
  return { taskId, remoteImageUrl }
}

async function generateFluxImage(input: {
  apiKey: string
  prompt: string
  aspectRatio: string
  inputImage?: string
  model: string
}) {
  const taskId = await createFluxKontextTask({
    apiKey: input.apiKey,
    prompt: input.prompt,
    inputImage: input.inputImage,
    aspectRatio: input.aspectRatio,
    model: input.model,
  })
  const remoteImageUrl = await pollFluxKontextTask({
    apiKey: input.apiKey,
    taskId,
    pollLimit: fluxPollLimit,
    pollDelayMs: fluxPollDelayMs,
    failedMessage: "Flux task failed",
    timeoutMessage: "Flux task timed out",
  })
  return { taskId, remoteImageUrl }
}

async function prepareReferenceImages(input: {
  apiKey: string
  attachments: NonNullable<CharacterImageRequest["attachments"]>
}) {
  const references = [
    ...input.attachments.filter(
      (attachment) =>
        attachment.kind === "character_headshot" && clean(attachment.url)
    ),
    ...input.attachments.filter(
      (attachment) =>
        attachment.kind !== "character_headshot" && clean(attachment.url)
    ),
  ]

  return Promise.all(
    references.map((reference) =>
      prepareKieInputFileUrl({
        fileUrl: clean(reference.url),
        apiKey: input.apiKey,
        uploadPath: "images/realfarm",
      })
    )
  )
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
  return characterImageAspectRatios.includes(
    ratio as (typeof characterImageAspectRatios)[number]
  )
    ? ratio
    : characterImageAspectRatios[0]
}


function isNanoBananaProModel(value: unknown) {
  return clean(value).toLowerCase() === "nano banana pro"
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function normalizeAttachments(
  value: CharacterImageRequest["attachments"]
): CharacterPromptAttachment[] {
  return Array.isArray(value)
    ? value.flatMap((attachment) => {
        const label = clean(attachment.label)
        const url = clean(attachment.url)
        const kind =
          attachment.kind === "character_headshot"
            ? "character_headshot"
            : attachment.kind === "asset"
              ? "asset"
              : undefined
        return label && url && kind ? [{ label, url, kind }] : []
      })
    : []
}

function allowedWorkflow(value: unknown): CharacterWorkflowKey | undefined {
  const workflow = clean(value)
  return characterWorkflowOptions.some((option) => option.key === workflow)
    ? (workflow as CharacterWorkflowKey)
    : undefined
}

function normalizeWorkflowMetadata(
  value: unknown
): CharacterWorkflowMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }
  const record = value as Partial<CharacterWorkflowMetadata>
  const workflow = allowedWorkflow(record.workflow)
  const workflowLabel = clean(record.workflowLabel)
  if (!workflow || !workflowLabel) {
    return undefined
  }
  return {
    workflow,
    workflowLabel,
    recipe:
      record.recipe &&
      typeof record.recipe === "object" &&
      !Array.isArray(record.recipe)
        ? (record.recipe as Record<string, unknown>)
        : undefined,
    note: clean(record.note) || undefined,
  }
}
