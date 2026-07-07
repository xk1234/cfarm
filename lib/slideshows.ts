import { randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import {
  createResultRecord,
  deleteResultRecord,
  deleteResultRecordsForAutomation,
  listResultRecords,
  type ResultRecord,
  type ResultSlideshowPayload,
} from "@/lib/results"
import {
  defaultSlideshowDuration,
  defaultSlideshowTransition,
} from "@/lib/slideshow-publishing-config"
import {
  renderedSlideSvg,
  type SlideshowOverlayImage,
  type SlideshowSlide,
  type SlideshowTextItem,
} from "@/lib/slideshow-renderer"
export type {
  SlideshowOverlayImage,
  SlideshowSlide,
  SlideshowTextItem,
} from "@/lib/slideshow-renderer"

export type SlideshowStatus = "exported" | "failed"

export type SlideshowSettings = {
  duration: number
  background_color: string
  is_bg_overlay_on: boolean
  transition_style: string
  background_opacity: number
  is_bg_overlay_on_hook_image: boolean
  export_as_video: boolean
  sound_id: string
  sound_name: string
  sound_url: string
}

export type SlideshowRecord = {
  id: string
  automationId?: string
  output_dir?: string
  output_images: string[]
  video_url?: string
  thumbnail_url?: string
  title: string
  caption: string
  hashtags: string
  status: SlideshowStatus
  prompt: string
  image_collection: string
  slideshow_type: string
  created_at: string
  updated_at: string
  is_finished: boolean
  is_failed: boolean
  settings: SlideshowSettings
  images: SlideshowSlide[]
}

export type CreateSlideshowInput = {
  rootDir?: string
  resultRootDir?: string
  runId?: string
  automationId?: string
  title?: string
  caption?: string
  hashtags?: string
  status?: SlideshowStatus
  prompt?: string
  image_collection?: string
  slideshow_type?: string
  settings?: Partial<SlideshowSettings>
  images?: Partial<SlideshowSlide>[]
  slides?: Partial<SlideshowSlide>[]
  video_url?: string
  thumbnail_url?: string
  is_finished?: boolean
  is_failed?: boolean
}

type RawSlideshowRecord = Omit<Partial<SlideshowRecord>, "images"> & {
  images?: Partial<SlideshowSlide>[]
}

const defaultRootDir = path.join(process.cwd(), "data", "slideshows")
const dbFileName = "slideshows.json"
const execFileAsync = promisify(execFile)

export async function listSlideshowRecords(
  input: {
    rootDir?: string
    resultRootDir?: string
    limit?: number
    id?: string
  } = {}
) {
  const resultRecords = await listResultRecords({
    rootDir: resultRootDirFor(input),
    limit: Number.MAX_SAFE_INTEGER,
  })
  const resultSlideshows = resultRecords
    .map(resultRecordToSlideshowRecord)
    .filter((record): record is SlideshowRecord => Boolean(record))
  const resultSlideshowIds = new Set(
    resultSlideshows.map((record) => record.id)
  )
  const legacyRecords = await readLegacySlideshowRecords(input.rootDir)
  const records = [
    ...resultSlideshows,
    ...legacyRecords.filter((record) => !resultSlideshowIds.has(record.id)),
  ]
  const filtered = records.filter((record) => {
    if (input.id && record.id !== input.id) {
      return false
    }
    return true
  })
  return filtered.slice(0, Math.max(1, input.limit ?? 100))
}

export async function createSlideshowRecord(input: CreateSlideshowInput) {
  const { slideshow } = await createSlideshowResultRecord(input)
  return slideshow
}

export async function createSlideshowResultRecord(input: CreateSlideshowInput) {
  const now = new Date().toISOString()
  const id = `slideshow-${randomUUID()}`
  const record = normalizeSlideshowRecord({
    id,
    automationId: clean(input.automationId) || undefined,
    title: clean(input.title) || "New Slideshow",
    caption: clean(input.caption),
    hashtags: clean(input.hashtags),
    status: input.status ?? "exported",
    prompt: clean(input.prompt),
    image_collection: clean(input.image_collection),
    slideshow_type: clean(input.slideshow_type) || "educational",
    created_at: now,
    updated_at: now,
    is_finished: input.is_finished ?? true,
    is_failed: input.is_failed ?? false,
    settings: {
      ...defaultSlideshowSettings(),
      ...input.settings,
    },
    images: input.images ?? input.slides ?? [],
    video_url: clean(input.video_url) || undefined,
    thumbnail_url: clean(input.thumbnail_url) || undefined,
  })
  const recordWithOutputs = await writeSlideshowOutputs(input.rootDir, record)
  const result = await createResultRecord({
    rootDir: resultRootDirFor(input),
    automationId:
      recordWithOutputs.automationId ??
      `compat-automation-${recordWithOutputs.id}`,
    runId: clean(input.runId) || `compat-run-${recordWithOutputs.id}`,
    workflowType: "slideshow",
    title: recordWithOutputs.title,
    status: recordWithOutputs.status === "failed" ? "failed" : "succeeded",
    artifacts: {
      slideshowId: recordWithOutputs.id,
      videoUrl: recordWithOutputs.video_url,
      thumbnailUrl: recordWithOutputs.thumbnail_url,
      outputImages: recordWithOutputs.output_images,
      outputDir: recordWithOutputs.output_dir,
    },
    payload: slideshowRecordToResultPayload(recordWithOutputs),
    createdAt: recordWithOutputs.created_at,
    updatedAt: recordWithOutputs.updated_at,
  })

  return {
    slideshow: resultRecordToSlideshowRecord(result) ?? recordWithOutputs,
    result,
  }
}

export async function deleteSlideshowRecord(input: {
  rootDir?: string
  resultRootDir?: string
  id: string
}) {
  const resultRecords = await listResultRecords({
    rootDir: resultRootDirFor(input),
    limit: Number.MAX_SAFE_INTEGER,
  })
  const result = resultRecords.find(
    (record) =>
      record.artifacts.slideshowId === input.id || record.id === input.id
  )
  if (result) {
    const deletedResult = await deleteResultRecord({
      rootDir: resultRootDirFor(input),
      id: result.id,
    })
    const slideshow = deletedResult
      ? resultRecordToSlideshowRecord(deletedResult)
      : null
    if (slideshow) {
      await deleteSlideshowOutput(input.rootDir, slideshow)
    }
    return slideshow
  }

  const records = await readLegacySlideshowRecords(input.rootDir)
  const deletedLegacy = records.find((record) => record.id === input.id) ?? null
  if (!deletedLegacy) {
    return null
  }
  await deleteSlideshowOutput(input.rootDir, deletedLegacy)
  await writeLegacySlideshowRecords(
    input.rootDir,
    records.filter((record) => record.id !== input.id)
  )
  return deletedLegacy
}

export async function deleteSlideshowRecordsForAutomation(input: {
  rootDir?: string
  resultRootDir?: string
  automationId: string
  slideshowIds?: string[]
}) {
  const automationId = clean(input.automationId)
  if (!automationId) {
    return []
  }
  const slideshowIds = new Set(
    (input.slideshowIds ?? []).map(clean).filter(Boolean)
  )

  const deletedResults = await deleteResultRecordsForAutomation({
    rootDir: resultRootDirFor(input),
    automationId,
    slideshowIds: [...slideshowIds],
  })
  const deletedResultSlideshows = deletedResults
    .map(resultRecordToSlideshowRecord)
    .filter((record): record is SlideshowRecord => Boolean(record))

  const records = await readLegacySlideshowRecords(input.rootDir)
  const deletedLegacy = records.filter(
    (record) =>
      record.automationId === automationId || slideshowIds.has(record.id)
  )
  const deleted = [...deletedResultSlideshows, ...deletedLegacy]
  if (deleted.length === 0) {
    return []
  }

  await Promise.all(
    deleted.map((record) => deleteSlideshowOutput(input.rootDir, record))
  )
  await writeLegacySlideshowRecords(
    input.rootDir,
    records.filter(
      (record) =>
        record.automationId !== automationId && !slideshowIds.has(record.id)
    )
  )
  return dedupeSlideshows(deleted)
}

export function defaultSlideshowSettings(
  overrides: Partial<SlideshowSettings> = {}
): SlideshowSettings {
  return {
    duration: defaultSlideshowDuration,
    background_color: "#000000",
    is_bg_overlay_on: false,
    transition_style: defaultSlideshowTransition,
    background_opacity: 40,
    is_bg_overlay_on_hook_image: false,
    export_as_video: false,
    sound_id: "",
    sound_name: "",
    sound_url: "",
    ...overrides,
  }
}

function readLegacySlideshowRecords(rootDir = defaultRootDir) {
  return readJsonArrayStore<SlideshowRecord>({
    rootDir,
    fileName: dbFileName,
    key: "slideshows",
    normalize: normalizeSlideshowRecord,
  })
}

async function writeLegacySlideshowRecords(
  rootDir = defaultRootDir,
  records: SlideshowRecord[]
) {
  await writeJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "slideshows",
    records,
  })
}

function resultRootDirFor(input: { rootDir?: string; resultRootDir?: string }) {
  return input.resultRootDir ?? input.rootDir
}

function resultRecordToSlideshowRecord(
  result: ResultRecord
): SlideshowRecord | null {
  if (result.payload?.type !== "slideshow") {
    return null
  }
  const payload = result.payload
  const slideshowId = result.artifacts.slideshowId || result.id
  const isFailed = result.status === "failed"

  return normalizeSlideshowRecord({
    id: slideshowId,
    automationId: result.automationId.startsWith("compat-automation-")
      ? undefined
      : result.automationId,
    output_dir: result.artifacts.outputDir,
    output_images: result.artifacts.outputImages,
    video_url: result.artifacts.videoUrl,
    thumbnail_url: result.artifacts.thumbnailUrl,
    title: result.title,
    caption: payload.caption,
    hashtags: payload.hashtags,
    status: isFailed ? "failed" : "exported",
    prompt: payload.prompt,
    image_collection: payload.imageCollectionId,
    slideshow_type: payload.slideshowType,
    created_at: result.createdAt,
    updated_at: result.updatedAt,
    is_finished: !isFailed,
    is_failed: isFailed,
    settings: payload.settings,
    images: payload.slides,
  })
}

function slideshowRecordToResultPayload(
  slideshow: SlideshowRecord
): ResultSlideshowPayload {
  return {
    type: "slideshow",
    caption: slideshow.caption,
    hashtags: slideshow.hashtags,
    prompt: slideshow.prompt,
    imageCollectionId: slideshow.image_collection,
    slideshowType: slideshow.slideshow_type,
    settings: slideshow.settings,
    slides: slideshow.images,
  }
}

function dedupeSlideshows(records: SlideshowRecord[]) {
  const seen = new Set<string>()
  return records.filter((record) => {
    if (seen.has(record.id)) {
      return false
    }
    seen.add(record.id)
    return true
  })
}

function normalizeSlideshowRecord(record: RawSlideshowRecord): SlideshowRecord {
  const now = new Date().toISOString()
  const id = clean(record.id) || `slideshow-${randomUUID()}`
  const images = Array.isArray(record.images) ? record.images : []
  const settings = normalizeSettings(record.settings)
  const isFailed = Boolean(record.is_failed) || record.status === "failed"

  return {
    id,
    automationId: clean(record.automationId) || undefined,
    output_dir: clean(record.output_dir) || undefined,
    output_images: Array.isArray(record.output_images)
      ? record.output_images.map(clean).filter(Boolean)
      : [],
    video_url: clean(record.video_url) || undefined,
    thumbnail_url: clean(record.thumbnail_url) || undefined,
    title: clean(record.title) || "New Slideshow",
    caption: clean(record.caption),
    hashtags: clean(record.hashtags),
    status: record.status === "failed" ? "failed" : "exported",
    prompt: clean(record.prompt),
    image_collection: clean(record.image_collection),
    slideshow_type: clean(record.slideshow_type) || "educational",
    created_at: normalizeDate(record.created_at, now),
    updated_at: normalizeDate(record.updated_at, now),
    is_finished:
      typeof record.is_finished === "boolean" ? record.is_finished : !isFailed,
    is_failed: isFailed,
    settings,
    images: images.map((slide, index) =>
      normalizeSlide(slide, index, settings.duration)
    ),
  }
}

function normalizeSlide(
  slide: Partial<SlideshowSlide>,
  index: number,
  duration: number
): SlideshowSlide {
  const imageUrl = clean(slide.image_url)
  return {
    id: clean(slide.id) || `slide-${index + 1}`,
    image_url: imageUrl,
    source_image_url: clean(slide.source_image_url) || undefined,
    overlayImage: normalizeOverlayImage(slide.overlayImage),
    textItems: Array.isArray(slide.textItems)
      ? slide.textItems.map((item, textIndex) =>
          normalizeTextItem(item, textIndex)
        )
      : [],
    aspect_ratio: clean(slide.aspect_ratio) || "9:16",
    time_length_ms: normalizeDurationMs(slide.time_length_ms, duration),
  }
}

function normalizeOverlayImage(
  value: Partial<SlideshowOverlayImage> | undefined
): SlideshowOverlayImage | undefined {
  const imageUrl = clean(value?.image_url)
  if (!imageUrl) {
    return undefined
  }

  return {
    image_url: imageUrl,
    source_image_url: clean(value?.source_image_url) || undefined,
    padding: Math.max(0, normalizeNumber(value?.padding, 5)),
  }
}

function normalizeTextItem(
  item: Partial<SlideshowTextItem>,
  index: number
): SlideshowTextItem {
  const text = clean(item.text)
  return {
    id: clean(item.id) || `text-${index + 1}`,
    text,
    font: clean(item.font) || "TikTok Display Medium",
    fontSize: clean(item.fontSize) || "10px",
    textSize: normalizeTextSize(item.textSize, text),
    textStyle: clean(item.textStyle) || "outline",
    textAlign: clean(item.textAlign) || "center",
    textAnchor: clean(item.textAnchor) || "padded",
    textPosition: normalizeTextPosition(item.textPosition),
  }
}

function normalizeSettings(
  settings: Partial<SlideshowSettings> | undefined
): SlideshowSettings {
  return {
    ...defaultSlideshowSettings(),
    ...(settings ?? {}),
    duration: normalizeNumber(settings?.duration, defaultSlideshowDuration),
    transition_style:
      clean(settings?.transition_style) || defaultSlideshowTransition,
    background_opacity: normalizeNumber(settings?.background_opacity, 40),
    export_as_video: Boolean(settings?.export_as_video),
    sound_id: clean(settings?.sound_id),
    sound_name: clean(settings?.sound_name),
    sound_url: clean(settings?.sound_url),
  }
}

function normalizeTextSize(
  value: SlideshowTextItem["textSize"] | undefined,
  text: string
) {
  return {
    width: normalizeNumber(
      value?.width,
      Math.max(20, Math.min(100, text.length * 4))
    ),
    height: normalizeNumber(value?.height, 18),
  }
}

function normalizeTextPosition(
  value: SlideshowTextItem["textPosition"] | undefined
) {
  return {
    x: normalizeNumber(value?.x, 50),
    y: normalizeNumber(value?.y, 45),
  }
}

function normalizeDurationMs(value: unknown, duration: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed)
    : Math.max(1, duration) * 1000
}

function normalizeNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeDate(value: unknown, fallback: string) {
  const date = new Date(typeof value === "string" ? value : fallback)
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback
}

async function writeSlideshowOutputs(
  rootDir = defaultRootDir,
  record: SlideshowRecord
) {
  const outputDir = path.join(rootDir, "outputs", record.id)
  await rm(outputDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  const outputImages: string[] = []
  const outputs: Array<{
    publicUrl: string
    rasterPublicUrl?: string
    sourcePublicUrl: string
    overlayPublicUrl?: string
  } | null> = []
  for (const [index, slide] of record.images.entries()) {
    const sourceUrl = slide.source_image_url || slide.image_url
    const output = await materializeSlideImage({
      outputDir,
      slideshowId: record.id,
      slideIndex: index,
      slide,
      sourceUrl,
    })
    outputs.push(output)
    if (output) {
      outputImages.push(output.publicUrl)
    }
  }
  const videoOutput =
    record.settings.export_as_video && outputImages.length > 0
      ? await materializeSlideshowVideo({
          outputDir,
          slideshowId: record.id,
          durationSeconds: record.settings.duration,
          slideImagePaths: outputs.flatMap((output) =>
            output?.rasterPublicUrl
              ? [
                  path.join(
                    outputDir,
                    path.basename(
                      new URL(output.rasterPublicUrl, "http://local").pathname
                    )
                  ),
                ]
              : []
          ),
        })
      : null

  const outputRecord: SlideshowRecord = {
    ...record,
    output_dir: outputDirUrl(record.id),
    output_images: outputImages,
    video_url: record.video_url || videoOutput?.videoUrl,
    thumbnail_url: record.thumbnail_url || videoOutput?.thumbnailUrl,
    images: record.images.map((slide, index) => {
      const sourceUrl = slide.source_image_url || slide.image_url
      const output = outputs[index]
      return {
        ...slide,
        source_image_url: output?.sourcePublicUrl || sourceUrl || undefined,
        overlayImage: slide.overlayImage
          ? {
              ...slide.overlayImage,
              source_image_url:
                output?.overlayPublicUrl ||
                slide.overlayImage.source_image_url ||
                slide.overlayImage.image_url,
            }
          : undefined,
        image_url: output?.publicUrl || slide.image_url,
      }
    }),
  }

  return outputRecord
}

async function deleteSlideshowOutput(
  rootDir = defaultRootDir,
  record: SlideshowRecord
) {
  await rm(path.join(rootDir, "outputs", record.id), {
    recursive: true,
    force: true,
  })
}

async function materializeSlideImage(input: {
  outputDir: string
  slideshowId: string
  slideIndex: number
  slide: SlideshowSlide
  sourceUrl: string
}) {
  const source = await materializeSlideSource(input)
  if (!source) {
    return null
  }
  const overlaySourceUrl =
    input.slide.overlayImage?.source_image_url ||
    input.slide.overlayImage?.image_url ||
    ""
  const overlaySource = overlaySourceUrl
    ? await materializeSlideOverlayImage({
        ...input,
        sourceUrl: overlaySourceUrl,
      })
    : null
  const fileName = `slide-${String(input.slideIndex + 1).padStart(3, "0")}.svg`
  const svg = renderedSlideSvg(
    input.slide,
    await imageDataUri(source.filePath, source.extension),
    overlaySource
      ? await imageDataUri(overlaySource.filePath, overlaySource.extension)
      : undefined
  )
  const svgPath = path.join(input.outputDir, fileName)
  await writeFile(svgPath, svg)
  const rasterFileName = `slide-${String(input.slideIndex + 1).padStart(3, "0")}.png`
  const rasterPath = path.join(input.outputDir, rasterFileName)
  const rasterized = await renderSvgToPng(svg, rasterPath)

  return {
    fileName,
    publicUrl: outputFileUrl(
      input.slideshowId,
      rasterized ? rasterFileName : fileName
    ),
    rasterPublicUrl: rasterized
      ? outputFileUrl(input.slideshowId, rasterFileName)
      : undefined,
    sourcePublicUrl: source.publicUrl,
    overlayPublicUrl: overlaySource?.publicUrl,
  }
}

async function renderSvgToPng(svg: string, outputPath: string) {
  try {
    const sharp = (await import("sharp")).default
    await sharp(Buffer.from(svg)).png().toFile(outputPath)
    return true
  } catch {
    return false
  }
}

async function materializeSlideshowVideo(input: {
  outputDir: string
  slideshowId: string
  durationSeconds: number
  slideImagePaths: string[]
}) {
  if (input.slideImagePaths.length === 0 || process.platform !== "darwin") {
    return null
  }

  const outputPath = path.join(input.outputDir, "slideshow-export.mp4")
  const thumbnailPath = path.join(input.outputDir, "slideshow-thumbnail.png")
  await copyFile(input.slideImagePaths[0], thumbnailPath).catch(() => undefined)

  try {
    await encodePngSequenceToMp4({
      outputPath,
      durationSeconds: input.durationSeconds,
      slideImagePaths: input.slideImagePaths,
    })
    return {
      videoUrl: outputFileUrl(input.slideshowId, "slideshow-export.mp4"),
      thumbnailUrl: outputFileUrl(input.slideshowId, "slideshow-thumbnail.png"),
    }
  } catch {
    return null
  }
}

async function encodePngSequenceToMp4(input: {
  outputPath: string
  durationSeconds: number
  slideImagePaths: string[]
}) {
  const scriptDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-video-"))
  const scriptPath = path.join(scriptDir, "render.swift")
  await writeFile(scriptPath, slideshowVideoSwiftSource())
  try {
    await execFileAsync(
      "swift",
      [
        scriptPath,
        input.outputPath,
        String(Math.max(1, input.durationSeconds || defaultSlideshowDuration)),
        ...input.slideImagePaths,
      ],
      { timeout: 120_000, maxBuffer: 1024 * 1024 }
    )
  } finally {
    await rm(scriptDir, { recursive: true, force: true })
  }
}

async function materializeSlideSource(input: {
  outputDir: string
  slideshowId: string
  slideIndex: number
  sourceUrl: string
}) {
  return materializeSlideAsset({ ...input, prefix: "source" })
}

async function materializeSlideOverlayImage(input: {
  outputDir: string
  slideshowId: string
  slideIndex: number
  sourceUrl: string
}) {
  return materializeSlideAsset({ ...input, prefix: "overlay" })
}

async function materializeSlideAsset(input: {
  outputDir: string
  slideshowId: string
  slideIndex: number
  sourceUrl: string
  prefix: "source" | "overlay"
}) {
  const requestedExtension = imageExtensionFromUrl(input.sourceUrl)
  const fileName = `${input.prefix}-${String(input.slideIndex + 1).padStart(3, "0")}${requestedExtension}`
  const filePath = path.join(input.outputDir, fileName)

  if (await copyLocalAsset(input.sourceUrl, filePath)) {
    return normalizeMaterializedImageSource({
      outputDir: input.outputDir,
      slideshowId: input.slideshowId,
      slideIndex: input.slideIndex,
      filePath,
      fallbackExtension: requestedExtension,
      prefix: input.prefix,
    })
  }

  const remote = await fetchRemoteAsset(input.sourceUrl)
  if (remote) {
    const actualExtension =
      imageExtensionFromBuffer(remote.body) ?? remote.extension
    const remoteFileName = `${input.prefix}-${String(input.slideIndex + 1).padStart(3, "0")}${actualExtension}`
    const remoteFilePath = path.join(input.outputDir, remoteFileName)
    await writeFile(remoteFilePath, remote.body)
    return {
      fileName: remoteFileName,
      filePath: remoteFilePath,
      extension: actualExtension,
      publicUrl: outputFileUrl(input.slideshowId, remoteFileName),
    }
  }

  return null
}

async function normalizeMaterializedImageSource(input: {
  outputDir: string
  slideshowId: string
  slideIndex: number
  filePath: string
  fallbackExtension: string
  prefix: "source" | "overlay"
}) {
  const bytes = await readFile(input.filePath)
  const extension = imageExtensionFromBuffer(bytes) ?? input.fallbackExtension
  const fileName = `${input.prefix}-${String(input.slideIndex + 1).padStart(3, "0")}${extension}`
  const filePath = path.join(input.outputDir, fileName)

  if (filePath !== input.filePath) {
    await rename(input.filePath, filePath)
  }

  return {
    fileName,
    filePath,
    extension,
    publicUrl: outputFileUrl(input.slideshowId, fileName),
  }
}

async function imageDataUri(filePath: string, extension: string) {
  const bytes = await readFile(filePath)
  return `data:${imageMimeType(extension)};base64,${bytes.toString("base64")}`
}

function imageMimeType(extension: string) {
  switch (extension.toLowerCase()) {
    case ".avif":
      return "image/avif"
    case ".gif":
      return "image/gif"
    case ".png":
      return "image/png"
    case ".svg":
      return "image/svg+xml"
    case ".webp":
      return "image/webp"
    case ".jpeg":
    case ".jpg":
    default:
      return "image/jpeg"
  }
}

async function copyLocalAsset(sourceUrl: string, filePath: string) {
  const sourcePath = localAssetPathForUrl(sourceUrl)
  if (!sourcePath) {
    return false
  }

  try {
    await copyFile(sourcePath, filePath)
    return true
  } catch {
    return false
  }
}

function localAssetPathForUrl(sourceUrl: string) {
  const value = clean(sourceUrl)
  if (!value) {
    return null
  }

  let pathname: string
  try {
    pathname = new URL(value, "http://local").pathname
  } catch {
    return null
  }

  const prefix = "/api/local-assets/"
  if (!pathname.startsWith(prefix)) {
    if (path.isAbsolute(value)) {
      return path.normalize(value)
    }
    return null
  }

  const dataRoot = path.join(process.cwd(), "data")
  const relativeParts = pathname
    .slice(prefix.length)
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))
  const requestedPath = path.normalize(path.join(dataRoot, ...relativeParts))

  return requestedPath.startsWith(dataRoot + path.sep) ? requestedPath : null
}

async function fetchRemoteAsset(sourceUrl: string) {
  if (!/^https?:\/\//i.test(sourceUrl)) {
    return null
  }

  try {
    const response = await fetch(sourceUrl)
    if (!response.ok) {
      return null
    }
    const body = Buffer.from(await response.arrayBuffer())
    return {
      body,
      extension:
        imageExtensionFromContentType(response.headers.get("content-type")) ||
        imageExtensionFromUrl(sourceUrl),
    }
  } catch {
    return null
  }
}

function imageExtensionFromUrl(sourceUrl: string) {
  let pathname = sourceUrl
  try {
    pathname = new URL(sourceUrl, "http://local").pathname
  } catch {
    // Keep the raw value for path.extname below.
  }
  const extension = path.extname(pathname).toLowerCase()
  return isSupportedImageExtension(extension) ? extension : ".jpg"
}

function imageExtensionFromContentType(contentType: string | null) {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase()
  if (normalized === "image/avif") return ".avif"
  if (normalized === "image/gif") return ".gif"
  if (normalized === "image/jpeg") return ".jpg"
  if (normalized === "image/png") return ".png"
  if (normalized === "image/svg+xml") return ".svg"
  if (normalized === "image/webp") return ".webp"
  return null
}

function imageExtensionFromBuffer(bytes: Buffer) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return ".png"
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return ".jpg"
  }
  if (
    bytes.subarray(0, 6).toString("ascii") === "GIF87a" ||
    bytes.subarray(0, 6).toString("ascii") === "GIF89a"
  ) {
    return ".gif"
  }
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp"
  }
  if (
    bytes.subarray(4, 12).toString("ascii") === "ftypavif" ||
    bytes.subarray(4, 12).toString("ascii") === "ftypavis"
  ) {
    return ".avif"
  }

  const textHeader = bytes.subarray(0, 256).toString("utf8").trimStart()
  if (textHeader.startsWith("<svg")) {
    return ".svg"
  }

  return null
}

function isSupportedImageExtension(extension: string) {
  return [".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(
    extension
  )
}

function outputDirUrl(slideshowId: string) {
  return `/api/local-assets/slideshows/outputs/${encodeURIComponent(slideshowId)}`
}

function outputFileUrl(slideshowId: string, fileName: string) {
  return `${outputDirUrl(slideshowId)}/${encodeURIComponent(fileName)}`
}

function slideshowVideoSwiftSource() {
  return `
import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

let arguments = CommandLine.arguments
guard arguments.count >= 4 else {
  fatalError("usage: render.swift output.mp4 durationSeconds image1.png ...")
}

let outputURL = URL(fileURLWithPath: arguments[1])
let durationSeconds = max(1.0, Double(arguments[2]) ?? 3.0)
let imageURLs = arguments.dropFirst(3).map { URL(fileURLWithPath: $0) }
guard let firstSource = CGImageSourceCreateWithURL(imageURLs[0] as CFURL, nil),
      let firstImage = CGImageSourceCreateImageAtIndex(firstSource, 0, nil) else {
  fatalError("could not load first image")
}

try? FileManager.default.removeItem(at: outputURL)

let width = firstImage.width
let height = firstImage.height
let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
let settings: [String: Any] = [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: 4_000_000,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
  ]
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let attributes: [String: Any] = [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height
]
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
guard writer.canAdd(input) else { fatalError("cannot add writer input") }
writer.add(input)
guard writer.startWriting() else { fatalError(writer.error?.localizedDescription ?? "writer failed") }
writer.startSession(atSourceTime: .zero)

let fps: Int32 = 12
let framesPerSlide = max(1, Int(round(durationSeconds * Double(fps))))
var frameIndex: Int64 = 0

func pixelBuffer(from image: CGImage) -> CVPixelBuffer? {
  var buffer: CVPixelBuffer?
  let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height, kCVPixelFormatType_32ARGB, nil, &buffer)
  guard status == kCVReturnSuccess, let pixelBuffer = buffer else { return nil }
  CVPixelBufferLockBaseAddress(pixelBuffer, [])
  defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, []) }
  guard let context = CGContext(
    data: CVPixelBufferGetBaseAddress(pixelBuffer),
    width: width,
    height: height,
    bitsPerComponent: 8,
    bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
  ) else { return nil }
  context.interpolationQuality = .high
  context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
  return pixelBuffer
}

for imageURL in imageURLs {
  guard let source = CGImageSourceCreateWithURL(imageURL as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
        let buffer = pixelBuffer(from: image) else {
    continue
  }
  for _ in 0..<framesPerSlide {
    while !input.isReadyForMoreMediaData {
      Thread.sleep(forTimeInterval: 0.01)
    }
    let time = CMTime(value: frameIndex, timescale: fps)
    adaptor.append(buffer, withPresentationTime: time)
    frameIndex += 1
  }
}

input.markAsFinished()
let semaphore = DispatchSemaphore(value: 0)
writer.finishWriting {
  semaphore.signal()
}
semaphore.wait()
if writer.status != .completed {
  fatalError(writer.error?.localizedDescription ?? "video export failed")
}
`
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
