import path from "node:path"

import { clean, readRecord, readString } from "@/lib/guards"
import { fetchWithTimeout } from "@/lib/http"
import { prepareKieInputImageUrl, readKieTaskId } from "@/lib/kie-image"
import { downloadRemoteFileToLocalAsset } from "@/lib/local-asset-download"
import { pollUntil } from "@/lib/poll"
import {
  kieModelForCharacterImageToVideo,
  kling30CharacterImageToVideoProviderModel,
  seedanceCharacterImageToVideoProviderModel,
} from "@/lib/realfarm-generation-model-registry"

const KIE_API_BASE_URL = "https://api.kie.ai"
const CHARACTER_VIDEOS_FOLDER = path.join(
  process.cwd(),
  "data",
  "characters",
  "videos"
)
const VIDEO_RESULT_POLL_LIMIT = 120
const VIDEO_RESULT_POLL_DELAY_MS = 5000

export function buildKieImageToVideoPayload(input: {
  imageUrl: string
  prompt: string
  model: string
  duration?: string
  aspectRatio?: string
  sound?: boolean
}) {
  const model = kieVideoModelSlug(input.model)
  const prompt = clean(input.prompt)
  const imageUrl = clean(input.imageUrl)
  const duration = clean(input.duration) || "5"

  if (model === seedanceCharacterImageToVideoProviderModel) {
    return {
      model,
      input: {
        prompt,
        first_frame_url: imageUrl,
        return_last_frame: false,
        generate_audio: input.sound === true,
        resolution: "720p",
        aspect_ratio: normalizeVideoAspectRatio(input.aspectRatio),
        duration: Number(duration) || 5,
        web_search: false,
      },
    }
  }

  return {
    model,
    input: {
      prompt,
      image_urls: [imageUrl],
      sound: input.sound === true,
      duration,
      ...(model === kling30CharacterImageToVideoProviderModel
        ? {
            aspect_ratio: normalizeKlingAspectRatio(input.aspectRatio),
            mode: "pro",
            multi_shots: false,
          }
        : {}),
    },
  }
}

export function readKieVideoResultUrl(payload: unknown) {
  const data = readRecord(readRecord(payload)?.data)
  if (!data || readString(data.state) !== "success") {
    return ""
  }

  const resultJson = readString(data.resultJson)
  if (!resultJson) {
    return readString(readRecord(data.videoInfo)?.videoUrl)
  }

  try {
    const parsed = JSON.parse(resultJson) as {
      resultUrls?: unknown[]
      videoUrls?: unknown[]
      videos?: unknown[]
      url?: unknown
      videoUrl?: unknown
      result_video_url?: unknown
    }
    return (
      parsed.resultUrls?.find(isString) ||
      parsed.videoUrls?.find(isString) ||
      parsed.videos?.find(isString) ||
      readString(parsed.result_video_url) ||
      readString(parsed.videoUrl) ||
      readString(parsed.url)
    )
  } catch {
    return ""
  }
}

export async function generateCharacterVideoFromImage(input: {
  imageUrl: string
  prompt: string
  model: string
  apiKey: string
  duration?: string
  aspectRatio?: string
  sound?: boolean
}) {
  const imageUrl = await prepareKieInputImageUrl({
    imageUrl: input.imageUrl,
    apiKey: input.apiKey,
  })
  const taskId = await createKieVideoTask(
    input.apiKey,
    buildKieImageToVideoPayload({
      ...input,
      imageUrl,
    })
  )
  const remoteVideoUrl = await pollKieVideoResult(input.apiKey, taskId)
  const videoUrl = await downloadCharacterVideo(taskId, remoteVideoUrl)

  return {
    taskId,
    videoUrl,
  }
}

async function createKieVideoTask(apiKey: string, body: unknown) {
  const response = await fetchWithTimeout(
    `${KIE_API_BASE_URL}/api/v1/jobs/createTask`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    { timeoutMs: 30_000 }
  )
  const payload = await response.json().catch(() => ({}))
  const taskId = readKieTaskId(payload)
  if (!response.ok || !taskId) {
    throw new Error(
      readKieError(payload) || `Kie video task failed with ${response.status}`
    )
  }
  return taskId
}

async function pollKieVideoResult(apiKey: string, taskId: string) {
  return pollUntil(
    async () => {
      const response = await fetchWithTimeout(
        `${KIE_API_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        },
        { timeoutMs: 30_000 }
      )
      const payload = await response.json().catch(() => ({}))
      const videoUrl = readKieVideoResultUrl(payload)
      if (videoUrl) {
        return videoUrl
      }
      if (!response.ok || isFailedKieVideoResult(payload)) {
        throw new Error(
          readKieError(payload) ||
            `Kie video result failed with ${response.status}`
        )
      }
      return null
    },
    {
      intervalMs: VIDEO_RESULT_POLL_DELAY_MS,
      maxAttempts: VIDEO_RESULT_POLL_LIMIT,
      description: "Kie video task",
      timeoutMessage: "Kie video task timed out",
    }
  )
}

async function downloadCharacterVideo(taskId: string, videoUrl: string) {
  return downloadRemoteFileToLocalAsset({
    url: videoUrl,
    taskId,
    folder: CHARACTER_VIDEOS_FOLDER,
    publicPrefix: "/api/local-assets/characters/videos",
    fallbackName: "character-video",
    failureMessage: "Failed to download generated character video",
    extensionForContentType: videoExtensionForContentType,
  })
}

function kieVideoModelSlug(value: string) {
  const model = clean(value).toLowerCase()
  if (model.includes("seedance"))
    return kieModelForCharacterImageToVideo("Seedance 2.0")
  if (model.includes("3.0") || model.includes("kling 3"))
    return kieModelForCharacterImageToVideo("Kling 3.0 Video")
  return kieModelForCharacterImageToVideo(value)
}

function normalizeVideoAspectRatio(value: unknown) {
  const ratio = clean(value)
  return ["16:9", "9:16", "1:1", "4:3", "3:4"].includes(ratio) ? ratio : "9:16"
}

function normalizeKlingAspectRatio(value: unknown) {
  const ratio = clean(value)
  return ["16:9", "9:16", "1:1"].includes(ratio) ? ratio : "9:16"
}

function videoExtensionForContentType(contentType: string) {
  return contentType.includes("quicktime")
    ? ".mov"
    : contentType.includes("webm")
      ? ".webm"
      : ".mp4"
}

function isFailedKieVideoResult(payload: unknown) {
  const data = readRecord(readRecord(payload)?.data)
  return readString(data?.state) === "fail"
}

function readKieError(payload: unknown) {
  const record = readRecord(payload)
  const data = readRecord(record?.data)
  return (
    readString(record?.msg) ||
    readString(data?.errorMessage) ||
    readString(data?.failMsg)
  )
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}
