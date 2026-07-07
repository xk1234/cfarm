import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  kieFluxKontextModel,
  kieTopazImageUpscaleModel,
} from "@/lib/realfarm-generation-model-registry"

export type KieImageMode = "edit" | "upscale"

export type KieImageActionResult = {
  taskId: string
  imageUrl: string
}

const KIE_API_BASE_URL = "https://api.kie.ai"
const KIE_FILE_UPLOAD_BASE_URL = "https://kieai.redpandaai.co"
const FLUX_RESULT_POLL_LIMIT = 40
const TOPAZ_RESULT_POLL_LIMIT = 80
const LOCAL_ASSET_PREFIX = "/api/local-assets/"

type FetchLike = typeof fetch

export function getKieApiKey(env: Partial<NodeJS.ProcessEnv> = process.env) {
  return clean(env.KIE_KEY)
}

export function buildFluxKontextGeneratePayload(input: {
  prompt: string
  inputImage?: string
  aspectRatio: string
  model?: string
  outputFormat?: "png" | "jpeg"
}) {
  const inputImage = clean(input.inputImage)
  return {
    prompt: clean(input.prompt),
    ...(inputImage ? { inputImage } : {}),
    aspectRatio: clean(input.aspectRatio),
    outputFormat: input.outputFormat ?? "png",
    promptUpsampling: false,
    model: fluxKontextModelSlug(input.model),
  }
}

export function buildFluxKontextEditPayload(input: {
  imageUrl: string
  prompt: string
  model?: string
}) {
  return {
    prompt: clean(input.prompt),
    inputImage: clean(input.imageUrl),
    enableTranslation: true,
    outputFormat: "jpeg",
    promptUpsampling: false,
    model: clean(input.model) || kieFluxKontextModel,
    safetyTolerance: 2,
  }
}

export function buildTopazImageUpscalePayload(input: {
  imageUrl: string
  upscaleFactor?: string
}) {
  return {
    model: kieTopazImageUpscaleModel,
    input: {
      image_url: clean(input.imageUrl),
      upscale_factor: clean(input.upscaleFactor) || "2",
    },
  }
}

export function readKieTaskId(payload: unknown) {
  if (!isRecord(payload)) {
    return ""
  }
  return readString(readRecord(payload.data)?.taskId) || ""
}

export function readFluxKontextResultUrl(payload: unknown) {
  if (!isRecord(payload)) {
    return ""
  }
  const data = readRecord(payload.data)
  if (!data) {
    return ""
  }
  const successFlag = data?.successFlag
  if (successFlag !== 1 && successFlag !== "1") {
    return ""
  }
  return readString(readRecord(data.response)?.resultImageUrl) || ""
}

export function readTopazResultUrl(payload: unknown) {
  if (!isRecord(payload)) {
    return ""
  }
  const data = readRecord(payload.data)
  if (!data) {
    return ""
  }
  if (readString(data?.state) !== "success") {
    return ""
  }

  const resultJson = readString(data.resultJson)
  if (!resultJson) {
    return ""
  }

  try {
    const parsed = JSON.parse(resultJson) as {
      resultUrls?: unknown[]
      imageUrls?: unknown[]
      url?: unknown
    }
    return (
      parsed.resultUrls?.find(
        (value): value is string => typeof value === "string"
      ) ||
      parsed.imageUrls?.find(
        (value): value is string => typeof value === "string"
      ) ||
      (typeof parsed.url === "string" ? parsed.url : "")
    )
  } catch {
    return ""
  }
}

export function readKieMarketResultUrls(payload: unknown) {
  const data = readRecord(readRecord(payload)?.data)
  if (!data || readString(data.state) !== "success") {
    return []
  }

  const resultJson = readString(data.resultJson)
  if (!resultJson) {
    const directUrl =
      readString(readRecord(data.videoInfo)?.videoUrl) ||
      readString(readRecord(data.response)?.resultImageUrl)
    return directUrl ? [directUrl] : []
  }

  try {
    const parsed = JSON.parse(resultJson) as {
      resultUrls?: unknown[]
      imageUrls?: unknown[]
      videoUrls?: unknown[]
      videos?: unknown[]
      url?: unknown
      videoUrl?: unknown
      result_video_url?: unknown
    }
    return [
      ...(parsed.resultUrls ?? []),
      ...(parsed.imageUrls ?? []),
      ...(parsed.videoUrls ?? []),
      ...(parsed.videos ?? []),
      parsed.result_video_url,
      parsed.videoUrl,
      parsed.url,
    ].filter(
      (value): value is string => typeof value === "string" && value.length > 0
    )
  } catch {
    return []
  }
}

export async function editImageWithFluxKontext(input: {
  imageUrl: string
  prompt: string
  apiKey: string
}) {
  const imageUrl = await prepareKieInputImageUrl(input)
  const task = await createKieTask(
    "/api/v1/flux/kontext/generate",
    input.apiKey,
    buildFluxKontextEditPayload({
      ...input,
      imageUrl,
    })
  )
  return {
    taskId: task,
    imageUrl: await pollKieImageResult({
      path: `/api/v1/flux/kontext/record-info?taskId=${encodeURIComponent(task)}`,
      apiKey: input.apiKey,
      readResultUrl: readFluxKontextResultUrl,
      pollLimit: FLUX_RESULT_POLL_LIMIT,
    }),
  }
}

export async function upscaleImageWithTopaz(input: {
  imageUrl: string
  apiKey: string
  upscaleFactor?: string
}) {
  const imageUrl = await prepareKieInputImageUrl(input)
  const task = await createKieTask(
    "/api/v1/jobs/createTask",
    input.apiKey,
    buildTopazImageUpscalePayload({
      ...input,
      imageUrl,
    })
  )
  return {
    taskId: task,
    imageUrl: await pollKieImageResult({
      path: `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(task)}`,
      apiKey: input.apiKey,
      readResultUrl: readTopazResultUrl,
      pollLimit: TOPAZ_RESULT_POLL_LIMIT,
    }),
  }
}

export async function prepareKieInputImageUrl(input: {
  imageUrl: string
  apiKey: string
  fetchImpl?: FetchLike
}) {
  const imageUrl = clean(input.imageUrl)
  const localAssetPath = localAssetFilePath(imageUrl)
  if (!localAssetPath) {
    return imageUrl
  }

  const bytes = await readFile(localAssetPath)
  const fileName = `${Date.now()}-${path.basename(localAssetPath)}`
  return uploadKieBase64Image({
    apiKey: input.apiKey,
    base64Data: `data:${contentTypeFor(localAssetPath)};base64,${bytes.toString("base64")}`,
    fileName,
    uploadPath: "images/realfarm",
    fetchImpl: input.fetchImpl,
  })
}

export async function prepareKieInputFileUrl(input: {
  fileUrl: string
  apiKey: string
  uploadPath: string
  fetchImpl?: FetchLike
}) {
  const fileUrl = clean(input.fileUrl)
  const localAssetPath = localAssetFilePath(fileUrl)
  if (!localAssetPath) {
    return fileUrl
  }

  const bytes = await readFile(localAssetPath)
  const fileName = `${Date.now()}-${path.basename(localAssetPath)}`
  return uploadKieBase64Image({
    apiKey: input.apiKey,
    base64Data: `data:${contentTypeFor(localAssetPath)};base64,${bytes.toString("base64")}`,
    fileName,
    uploadPath: input.uploadPath,
    fetchImpl: input.fetchImpl,
  })
}

export async function uploadKieBase64Image(input: {
  apiKey: string
  base64Data: string
  fileName: string
  uploadPath: string
  fetchImpl?: FetchLike
  failureMessage?: string
}) {
  const response = await (input.fetchImpl ?? fetch)(
    `${KIE_FILE_UPLOAD_BASE_URL}/api/file-base64-upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        base64Data: input.base64Data,
        fileName: input.fileName,
        uploadPath: input.uploadPath,
      }),
    }
  )
  const payload = await response.json().catch(() => ({}))
  const uploadedUrl = readKieUploadedFileUrl(payload)
  if (!response.ok || !uploadedUrl) {
    throw new Error(
      readKieError(payload) ||
        input.failureMessage ||
        `Kie image upload failed with ${response.status}`
    )
  }

  return uploadedUrl
}

export async function createFluxKontextTask(input: {
  apiKey: string
  prompt: string
  inputImage?: string
  aspectRatio: string
  model?: string
  fetchImpl?: FetchLike
}) {
  return createKieTask(
    "/api/v1/flux/kontext/generate",
    input.apiKey,
    buildFluxKontextGeneratePayload(input),
    input.fetchImpl
  )
}

export async function createKieMarketTask(input: {
  apiKey: string
  body: unknown
  fetchImpl?: FetchLike
}) {
  return createKieTask(
    "/api/v1/jobs/createTask",
    input.apiKey,
    input.body,
    input.fetchImpl
  )
}

export async function pollKieMarketTask(input: {
  apiKey: string
  taskId: string
  pollLimit?: number
  pollDelayMs?: number
  fetchImpl?: FetchLike
}) {
  return pollKieImageResult({
    path: `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(input.taskId)}`,
    apiKey: input.apiKey,
    readResultUrl: (payload) => readKieMarketResultUrls(payload)[0] ?? "",
    pollLimit: input.pollLimit ?? TOPAZ_RESULT_POLL_LIMIT,
    pollDelayMs: input.pollDelayMs,
    fetchImpl: input.fetchImpl,
    failedMessage: "Kie market task failed",
    timeoutMessage: "Kie market task timed out",
  })
}

export async function pollFluxKontextTask(input: {
  apiKey: string
  taskId: string
  pollLimit?: number
  pollDelayMs?: number
  fetchImpl?: FetchLike
  failedMessage?: string
  timeoutMessage?: string
}) {
  return pollKieImageResult({
    path: `/api/v1/flux/kontext/record-info?taskId=${encodeURIComponent(input.taskId)}`,
    apiKey: input.apiKey,
    readResultUrl: readFluxKontextResultUrl,
    pollLimit: input.pollLimit ?? FLUX_RESULT_POLL_LIMIT,
    pollDelayMs: input.pollDelayMs,
    fetchImpl: input.fetchImpl,
    failedMessage: input.failedMessage,
    timeoutMessage: input.timeoutMessage,
  })
}

export async function downloadRemoteImageToLocalAsset(input: {
  imageUrl: string
  taskId: string
  folder: string
  publicPrefix: string
  fallbackName: string
  failureMessage: string
  fetchImpl?: FetchLike
}) {
  const response = await (input.fetchImpl ?? fetch)(input.imageUrl)
  if (!response.ok) {
    throw new Error(input.failureMessage)
  }

  const contentType = response.headers.get("content-type") ?? ""
  const extension = contentType.includes("webp")
    ? ".webp"
    : contentType.includes("jpeg") || contentType.includes("jpg")
      ? ".jpg"
      : ".png"
  const safeTaskId = input.taskId.replace(/[^a-zA-Z0-9_-]/g, "")
  const fileName = `${Date.now()}-${safeTaskId || input.fallbackName}${extension}`
  const filePath = path.join(input.folder, fileName)
  await mkdir(input.folder, { recursive: true })
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()))

  return `${input.publicPrefix}/${encodeURIComponent(fileName)}`
}

async function createKieTask(
  path: string,
  apiKey: string,
  body: unknown,
  fetchImpl?: FetchLike
) {
  const response = await (fetchImpl ?? fetch)(`${KIE_API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  const taskId = readKieTaskId(payload)
  if (!response.ok || !taskId) {
    throw new Error(
      readKieError(payload) || `Kie image task failed with ${response.status}`
    )
  }
  return taskId
}

async function pollKieImageResult(input: {
  path: string
  apiKey: string
  readResultUrl: (payload: unknown) => string
  pollLimit: number
  pollDelayMs?: number
  fetchImpl?: FetchLike
  failedMessage?: string
  timeoutMessage?: string
}) {
  for (let attempt = 0; attempt < input.pollLimit; attempt += 1) {
    const response = await (input.fetchImpl ?? fetch)(
      `${KIE_API_BASE_URL}${input.path}`,
      {
        headers: {
          Authorization: `Bearer ${input.apiKey}`,
        },
      }
    )
    const payload = await response.json().catch(() => ({}))
    const resultUrl = input.readResultUrl(payload)
    if (resultUrl) {
      return resultUrl
    }
    if (!response.ok || isFailedKieResult(payload)) {
      throw new Error(
        readKieError(payload) ||
          input.failedMessage ||
          `Kie image result failed with ${response.status}`
      )
    }
    if (attempt < input.pollLimit - 1) {
      await sleep(input.pollDelayMs ?? 3000)
    }
  }

  throw new Error(input.timeoutMessage || "Kie image task timed out")
}

function isFailedKieResult(payload: unknown) {
  if (!isRecord(payload)) {
    return false
  }
  const data = readRecord(payload.data)
  return (
    data?.successFlag === 2 || data?.successFlag === 3 || data?.state === "fail"
  )
}

function readKieError(payload: unknown) {
  if (!isRecord(payload)) {
    return ""
  }
  const data = readRecord(payload.data)
  return (
    readString(payload.msg) ||
    readString(data?.errorMessage) ||
    readString(data?.failMsg)
  )
}

function readKieUploadedFileUrl(payload: unknown) {
  if (!isRecord(payload)) {
    return ""
  }
  const data = readRecord(payload.data)
  return (
    readString(data?.downloadUrl) ||
    readString(data?.fileUrl) ||
    readString(data?.url) ||
    readString(payload.downloadUrl) ||
    readString(payload.fileUrl) ||
    readString(payload.url)
  )
}

function localAssetFilePath(imageUrl: string) {
  const assetPath = localAssetUrlPath(imageUrl)
  if (!assetPath) {
    return ""
  }

  const dataRoot = path.join(process.cwd(), "data")
  const decodedSegments = assetPath
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
  const requestedPath = path.normalize(path.join(dataRoot, ...decodedSegments))
  if (!requestedPath.startsWith(dataRoot + path.sep)) {
    throw new Error("Invalid local asset path")
  }

  return requestedPath
}

function localAssetUrlPath(imageUrl: string) {
  if (imageUrl.startsWith(LOCAL_ASSET_PREFIX)) {
    return imageUrl.slice(LOCAL_ASSET_PREFIX.length)
  }

  try {
    const url = new URL(imageUrl)
    if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      return ""
    }
    return url.pathname.startsWith(LOCAL_ASSET_PREFIX)
      ? url.pathname.slice(LOCAL_ASSET_PREFIX.length)
      : ""
  } catch {
    return ""
  }
}

function contentTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  const contentTypes: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
  }

  return contentTypes[extension] ?? "application/octet-stream"
}

function fluxKontextModelSlug(value: unknown) {
  const model = clean(value).toLowerCase()
  if (model.includes("flux")) return kieFluxKontextModel
  return kieFluxKontextModel
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : ""
}
