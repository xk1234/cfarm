import { clean } from "@/lib/guards"
import path from "node:path"

import { NextResponse } from "next/server"

import { persistAsset } from "@/lib/asset-storage"

import {
  buildKlingV25StartEndFramePayload,
  buildKlingMotionControlPayload,
  buildNanoBananaProPayload,
  buildPoseVariationPrompt,
  buildReferenceAnalysisOpenRouterRequest,
  buildReferenceRecreationPrompt,
  buildSeedreamBedroomSelfiePrompt,
  buildSeedreamV4EditPayload,
  buildWanClothingEditPayload,
  parseReferenceAnalysisContent,
  type BedroomSelfieTemplateId,
  type ReferenceRecreationAnalysis,
} from "@/lib/character-workflows"
import {
  findRandomMusicFile,
  postProcessCharacterVideo,
} from "@/lib/character-video-postprocess"
import { upsertCharacterImageGeneration } from "@/lib/character-image-generations"
import {
  createKieMarketTask,
  downloadRemoteImageToLocalAsset,
  getKieApiKey,
  pollKieMarketTask,
  prepareKieInputFileUrl,
} from "@/lib/kie-image"
import {
  type CharacterWorkflowKey,
  type CharacterWorkflowMetadata,
} from "@/lib/realfarm-character-ui"

export const dynamic = "force-dynamic"

type CharacterWorkflowRequest = {
  workflow?: string
  characterId?: number
  characterName?: string
  characterAttributes?: unknown
  characterImageUrl?: string
  referenceImageUrl?: string
  referenceAnalysis?: unknown
  motionVideoUrl?: string
  clothingImageUrl?: string
  prompt?: string
  aspectRatio?: string
  breastSize?: string
  selfieTemplate?: BedroomSelfieTemplateId
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

const characterImagesFolder = path.join(
  process.cwd(),
  "data",
  "characters",
  "images"
)
const characterVideosFolder = path.join(
  process.cwd(),
  "data",
  "characters",
  "videos"
)

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CharacterWorkflowRequest
    const workflow = clean(payload.workflow)
    const kieApiKey = getKieApiKey()

    if (!kieApiKey) {
      return NextResponse.json({ error: "Missing KIE_KEY" }, { status: 500 })
    }

    if (workflow === "recreate_reference") {
      return NextResponse.json(await runReferenceRecreation(payload, kieApiKey))
    }
    if (workflow === "motion_control") {
      return NextResponse.json(await runMotionControl(payload, kieApiKey))
    }
    if (workflow === "seedream_bedroom_selfie") {
      return NextResponse.json(await runSeedreamSelfie(payload, kieApiKey))
    }
    if (workflow === "outfit_transfer") {
      return NextResponse.json(await runOutfitTransfer(payload, kieApiKey))
    }
    if (workflow === "pose_variation_cut_video") {
      return NextResponse.json(
        await runPoseVariationCutVideo(payload, kieApiKey)
      )
    }

    return NextResponse.json(
      { error: "Unsupported character workflow" },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Character workflow generation failed",
      },
      { status: 500 }
    )
  }
}

async function runReferenceRecreation(
  payload: CharacterWorkflowRequest,
  kieApiKey: string
) {
  const characterImageUrl = requiredUrl(
    payload.characterImageUrl,
    "character image"
  )
  const referenceImageUrl = requiredUrl(
    payload.referenceImageUrl,
    "reference image"
  )

  const analysis =
    normalizeReferenceAnalysis(payload.referenceAnalysis) ??
    (await analyzeReferenceImage({
      apiKey: requiredOpenRouterApiKey(),
      referenceImageUrl,
    }))
  const preparedCharacterUrl = await prepareKieInputFileUrl({
    fileUrl: characterImageUrl,
    apiKey: kieApiKey,
    uploadPath: "images/realfarm",
  })
  const prompt = buildReferenceRecreationPrompt({
    characterName: clean(payload.characterName) || "the character",
    characterJson: payload.characterAttributes ?? {},
    analysis,
    userPrompt: payload.prompt,
  })
  const taskId = await createKieMarketTask({
    apiKey: kieApiKey,
    body: buildNanoBananaProPayload({
      prompt,
      imageUrls: [preparedCharacterUrl],
      aspectRatio: payload.aspectRatio,
    }),
  })
  const remoteImageUrl = await pollKieMarketTask({
    apiKey: kieApiKey,
    taskId,
    pollLimit: 80,
    pollDelayMs: 3000,
  })
  const imageUrl = await downloadRemoteImageToLocalAsset({
    imageUrl: remoteImageUrl,
    taskId,
    folder: characterImagesFolder,
    publicPrefix: "/api/local-assets/characters/images",
    fallbackName: "reference-recreate",
    failureMessage: "Failed to download recreated reference image",
  })
  const generation = await storeWorkflowGeneration({
    payload,
    taskId,
    prompt,
    imageUrl,
    model: "Nano Banana Pro",
    workflow: "recreate_reference",
    workflowLabel: "Recreate Reference",
    metadata: {
      workflow: "recreate_reference",
      workflowLabel: "Recreate Reference",
      recipe: { analysis, referenceImageUrl },
    },
  })

  return { imageUrl, taskId, analysis, generation }
}

function requiredOpenRouterApiKey() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error(
      "Select an analyzed reference image first, or set OPENROUTER_API_KEY to analyze a raw reference URL"
    )
  }
  return apiKey
}

function normalizeReferenceAnalysis(
  value: unknown
): ReferenceRecreationAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }
  const record = value as Record<string, unknown>
  const requiredKeys: Array<keyof ReferenceRecreationAnalysis> = [
    "composition",
    "camera",
    "pose",
    "facial_expression",
    "hair",
    "clothing",
    "accessories",
    "environment",
    "lighting",
    "recreation_notes",
  ]
  return requiredKeys.every(
    (key) =>
      record[key] &&
      typeof record[key] === "object" &&
      !Array.isArray(record[key])
  )
    ? (record as ReferenceRecreationAnalysis)
    : null
}

async function runMotionControl(
  payload: CharacterWorkflowRequest,
  kieApiKey: string
) {
  const characterImageUrl = requiredUrl(
    payload.characterImageUrl,
    "character image"
  )
  const motionVideoUrl = requiredUrl(payload.motionVideoUrl, "motion video")
  const [preparedCharacterUrl, preparedMotionUrl] = await Promise.all([
    prepareKieInputFileUrl({
      fileUrl: characterImageUrl,
      apiKey: kieApiKey,
      uploadPath: "images/realfarm",
    }),
    prepareKieInputFileUrl({
      fileUrl: motionVideoUrl,
      apiKey: kieApiKey,
      uploadPath: "videos/realfarm",
    }),
  ])
  const prompt =
    clean(payload.prompt) ||
    "Same girl as reference image, identical face and features. Follow the movement and facial expressions in the video precisely. Smooth realistic animation, natural physics, stable camera."
  const taskId = await createKieMarketTask({
    apiKey: kieApiKey,
    body: buildKlingMotionControlPayload({
      prompt,
      characterImageUrl: preparedCharacterUrl,
      motionVideoUrl: preparedMotionUrl,
    }),
  })
  const remoteVideoUrl = await pollKieMarketTask({
    apiKey: kieApiKey,
    taskId,
    pollLimit: 120,
    pollDelayMs: 5000,
  })
  const videoUrl = await downloadRemoteVideoToLocalAsset(taskId, remoteVideoUrl)
  const generation = await storeWorkflowGeneration({
    payload,
    taskId,
    prompt,
    imageUrl: characterImageUrl,
    videoUrl,
    model: "Kling 3.0 Motion Control",
    workflow: "motion_control",
    workflowLabel: "Motion Control",
    metadata: {
      workflow: "motion_control",
      workflowLabel: "Motion Control",
      recipe: { motionVideoUrl, character_orientation: "image" },
    },
  })

  return { videoUrl, taskId, generation }
}

async function runSeedreamSelfie(
  payload: CharacterWorkflowRequest,
  kieApiKey: string
) {
  const characterImageUrl = requiredUrl(
    payload.characterImageUrl,
    "character image"
  )
  const preparedCharacterUrl = await prepareKieInputFileUrl({
    fileUrl: characterImageUrl,
    apiKey: kieApiKey,
    uploadPath: "images/realfarm",
  })
  const template = payload.selfieTemplate ?? "barely_awake_oversized_tee"
  const prompt = [
    buildSeedreamBedroomSelfiePrompt({
      template,
      breastSize: payload.breastSize,
    }),
    clean(payload.prompt),
  ]
    .filter(Boolean)
    .join("\n")
  const taskId = await createKieMarketTask({
    apiKey: kieApiKey,
    body: buildSeedreamV4EditPayload({
      prompt,
      imageUrls: [preparedCharacterUrl],
    }),
  })
  const remoteImageUrl = await pollKieMarketTask({
    apiKey: kieApiKey,
    taskId,
    pollLimit: 80,
    pollDelayMs: 3000,
  })
  const imageUrl = await downloadRemoteImageToLocalAsset({
    imageUrl: remoteImageUrl,
    taskId,
    folder: characterImagesFolder,
    publicPrefix: "/api/local-assets/characters/images",
    fallbackName: "seedream-selfie",
    failureMessage: "Failed to download Seedream selfie image",
  })
  const generation = await storeWorkflowGeneration({
    payload,
    taskId,
    prompt,
    imageUrl,
    model: "Seedream v4 Edit",
    workflow: "seedream_bedroom_selfie",
    workflowLabel: "Seedream Selfie",
    metadata: {
      workflow: "seedream_bedroom_selfie",
      workflowLabel: "Seedream Selfie",
      recipe: { template, breastSize: clean(payload.breastSize) || "d cup" },
    },
  })

  return { imageUrl, taskId, generation }
}

async function runOutfitTransfer(
  payload: CharacterWorkflowRequest,
  kieApiKey: string
) {
  const characterImageUrl = requiredUrl(
    payload.characterImageUrl,
    "character image"
  )
  const clothingImageUrl = requiredUrl(
    payload.clothingImageUrl,
    "clothing image"
  )
  const [preparedCharacterUrl, preparedClothingUrl] = await Promise.all([
    prepareKieInputFileUrl({
      fileUrl: characterImageUrl,
      apiKey: kieApiKey,
      uploadPath: "images/realfarm",
    }),
    prepareKieInputFileUrl({
      fileUrl: clothingImageUrl,
      apiKey: kieApiKey,
      uploadPath: "images/realfarm",
    }),
  ])
  const body = buildWanClothingEditPayload({
    influencerImageUrl: preparedCharacterUrl,
    clothingImageUrl: preparedClothingUrl,
  })
  const prompt = body.input.prompt
  const taskId = await createKieMarketTask({ apiKey: kieApiKey, body })
  const remoteImageUrl = await pollKieMarketTask({
    apiKey: kieApiKey,
    taskId,
    pollLimit: 80,
    pollDelayMs: 3000,
  })
  const imageUrl = await downloadRemoteImageToLocalAsset({
    imageUrl: remoteImageUrl,
    taskId,
    folder: characterImagesFolder,
    publicPrefix: "/api/local-assets/characters/images",
    fallbackName: "outfit-transfer",
    failureMessage: "Failed to download outfit transfer image",
  })
  const generation = await storeWorkflowGeneration({
    payload,
    taskId,
    prompt,
    imageUrl,
    model: "Wan 2.7 Image",
    workflow: "outfit_transfer",
    workflowLabel: "Outfit Transfer",
    metadata: {
      workflow: "outfit_transfer",
      workflowLabel: "Outfit Transfer",
      recipe: { clothingImageUrl, providerModel: "wan/2-7-image" },
      note: "KIE docs currently expose wan/2-7-image for Wan image editing; wan-2.6-image-edit was not found in current docs.",
    },
  })

  return { imageUrl, taskId, generation }
}

async function runPoseVariationCutVideo(
  payload: CharacterWorkflowRequest,
  kieApiKey: string
) {
  const originalImageUrl = requiredUrl(
    payload.characterImageUrl,
    "original image"
  )
  const preparedOriginalUrl = await prepareKieInputFileUrl({
    fileUrl: originalImageUrl,
    apiKey: kieApiKey,
    uploadPath: "images/realfarm",
  })
  const posePrompt = [buildPoseVariationPrompt(), clean(payload.prompt)]
    .filter(Boolean)
    .join("\n")
  const imageTaskId = await createKieMarketTask({
    apiKey: kieApiKey,
    body: buildNanoBananaProPayload({
      prompt: posePrompt,
      imageUrls: [preparedOriginalUrl],
      aspectRatio: payload.aspectRatio,
    }),
  })
  const remoteEndImageUrl = await pollKieMarketTask({
    apiKey: kieApiKey,
    taskId: imageTaskId,
    pollLimit: 80,
    pollDelayMs: 3000,
  })
  const endImageUrl = await downloadRemoteImageToLocalAsset({
    imageUrl: remoteEndImageUrl,
    taskId: imageTaskId,
    folder: characterImagesFolder,
    publicPrefix: "/api/local-assets/characters/images",
    fallbackName: "pose-variation-end-frame",
    failureMessage: "Failed to download pose variation image",
  })
  const preparedEndImageUrl = await prepareKieInputFileUrl({
    fileUrl: endImageUrl,
    apiKey: kieApiKey,
    uploadPath: "images/realfarm",
  })
  const videoPrompt =
    "Generate a smooth handheld selfie transition from image 1 to image 2. Preserve identity, face structure, hairstyle, and outfit. The movement should emphasize a stronger head tilt, face leaning closer to camera, and a downward sideways tilted selfie angle. Natural realistic motion, stable face, no identity drift."
  const videoTaskId = await createKieMarketTask({
    apiKey: kieApiKey,
    body: buildKlingV25StartEndFramePayload({
      prompt: videoPrompt,
      startImageUrl: preparedOriginalUrl,
      endImageUrl: preparedEndImageUrl,
      duration: "5",
    }),
  })
  const remoteVideoUrl = await pollKieMarketTask({
    apiKey: kieApiKey,
    taskId: videoTaskId,
    pollLimit: 120,
    pollDelayMs: 5000,
  })
  const rawVideo = await downloadRemoteVideoFile({
    taskId: videoTaskId,
    videoUrl: remoteVideoUrl,
    suffix: "pose-variation-raw",
  })
  const musicPath = await findRandomMusicFile()
  const finalFileName = `${Date.now()}-${safeId(videoTaskId) || "pose-variation"}-pose-variation-final.mp4`
  const finalFilePath = path.join(characterVideosFolder, finalFileName)
  const postprocess = await postProcessCharacterVideo({
    inputVideoPath: rawVideo.filePath,
    outputVideoPath: finalFilePath,
    musicPath,
    seed: Date.now(),
  })
  const videoUrl = `/api/local-assets/characters/videos/${encodeURIComponent(finalFileName)}`
  const prompt = [posePrompt, videoPrompt].join("\n\n")
  const generation = await storeWorkflowGeneration({
    payload,
    taskId: videoTaskId,
    prompt,
    imageUrl: endImageUrl,
    videoUrl,
    model: "Nano Banana Pro + Kling 2.5 + Rendi FFmpeg",
    workflow: "pose_variation_cut_video",
    workflowLabel: "Pose Cut Video",
    metadata: {
      workflow: "pose_variation_cut_video",
      workflowLabel: "Pose Cut Video",
      recipe: {
        originalImageUrl,
        endImageUrl,
        rawVideoUrl: rawVideo.videoUrl,
        musicPath: postprocess.musicPath,
        microCuts: postprocess.segments,
        rendiCommandId: postprocess.rendiCommandId,
      },
    },
  })

  return {
    imageUrl: endImageUrl,
    videoUrl,
    rawVideoUrl: rawVideo.videoUrl,
    taskId: videoTaskId,
    imageTaskId,
    musicPath: postprocess.musicPath,
    microCuts: postprocess.segments,
    generation,
  }
}

async function analyzeReferenceImage(input: {
  apiKey: string
  referenceImageUrl: string
}): Promise<ReferenceRecreationAnalysis> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "CFarm Reference Recreation",
      },
      body: JSON.stringify(
        buildReferenceAnalysisOpenRouterRequest({
          referenceImageUrl: input.referenceImageUrl,
        })
      ),
    }
  )
  const body = (await response.json().catch(() => ({}))) as OpenRouterResponse
  if (!response.ok) {
    throw new Error(
      body.error?.message || `Reference analysis failed with ${response.status}`
    )
  }
  return parseReferenceAnalysisContent(body.choices?.[0]?.message?.content)
}

async function storeWorkflowGeneration(input: {
  payload: CharacterWorkflowRequest
  taskId: string
  prompt: string
  imageUrl: string
  videoUrl?: string
  model: string
  workflow: CharacterWorkflowKey
  workflowLabel: string
  metadata: CharacterWorkflowMetadata
}) {
  return upsertCharacterImageGeneration({
    id: input.taskId,
    characterId: numberValue(input.payload.characterId),
    prompt: input.prompt,
    model: input.model,
    createdAt: new Date().toISOString(),
    attachments: [],
    aspectRatio: clean(input.payload.aspectRatio) || "9:16",
    status: "ready",
    imageUrl: input.imageUrl,
    progress: 100,
    videoUrl: input.videoUrl,
    videoStatus: input.videoUrl ? "ready" : undefined,
    videoProgress: input.videoUrl ? 100 : undefined,
    workflow: input.workflow,
    workflowLabel: input.workflowLabel,
    workflowMetadata: input.metadata,
  })
}

async function downloadRemoteVideoToLocalAsset(
  taskId: string,
  videoUrl: string
) {
  const downloaded = await downloadRemoteVideoFile({ taskId, videoUrl })
  return downloaded.videoUrl
}

async function downloadRemoteVideoFile(input: {
  taskId: string
  videoUrl: string
  suffix?: string
}) {
  const response = await fetch(input.videoUrl)
  if (!response.ok) {
    throw new Error("Failed to download generated workflow video")
  }
  const contentType = response.headers.get("content-type") ?? ""
  const extension = contentType.includes("quicktime")
    ? ".mov"
    : contentType.includes("webm")
      ? ".webm"
      : ".mp4"
  const suffix = input.suffix ? `-${safeId(input.suffix)}` : ""
  const fileName = `${Date.now()}-${safeId(input.taskId) || "workflow-video"}${suffix}${extension}`
  const filePath = path.join(characterVideosFolder, fileName)
  await persistAsset(filePath, Buffer.from(await response.arrayBuffer()))
  return {
    filePath,
    videoUrl: `/api/local-assets/characters/videos/${encodeURIComponent(fileName)}`,
  }
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "")
}

function requiredUrl(value: unknown, label: string) {
  const url = clean(value)
  if (!url) {
    throw new Error(`Missing ${label}`)
  }
  return url
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

