import { clean } from "@/lib/guards"
import { randomUUID } from "node:crypto"
import {
  copyFile,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { toDataUrl } from "@/lib/data-url"
import {
  deleteAssetFromAppwrite,
  mirrorDirToAppwrite,
  readAssetBytes,
} from "@/lib/asset-storage"
import {
  getRendiApiKey,
  runRendiFfmpegAndDownload,
  uploadLocalFileToRendi,
} from "@/lib/rendi-ffmpeg"
import {
  createResultRecord,
  deleteResultRecord,
  deleteResultRecordsForAutomation,
  listResultRecords,
  updateResultRecord,
  type ResultRecord,
  type ResultSlideshowPayload,
} from "@/lib/results"
import {
  defaultSlideshowDuration,
  defaultSlideshowTransition,
} from "@/lib/slideshow-publishing-config"
import {
  defaultSlideshowAspectRatio,
  defaultSlideshowFont,
  renderedSlideSvg,
  type SlideshowOverlayImage,
  type SlideshowOvalIconLayout,
  type SlideshowSlide,
  type SlideshowTextItem,
} from "@/lib/slideshow-renderer"
import { fetchWithTimeout } from "@/lib/http"
export type {
  SlideshowOverlayImage,
  SlideshowOvalIconLayout,
  SlideshowSlide,
  SlideshowTextItem,
} from "@/lib/slideshow-renderer"

export type SlideshowStatus = "exported" | "failed"

export type SlideshowSettings = {
  duration: number
  // One aspect ratio and font for the whole slideshow — every slide/text box
  // shares them (a carousel with mixed ratios gets cropped by TikTok/IG, and
  // the font is a brand constant). Not per-slide / per-text-item.
  aspect_ratio: string
  font: string
  background_color: string
  transition_style: string
  export_as_video: boolean
  sound_id: string
  sound_name: string
  sound_url: string
}

// Authoring inputs: everything that describes a slideshow independent of any
// render. This is the shape a caller conceptually fills in before rendering.
export type SlideshowDraft = {
  ownerId?: string
  id: string
  runId?: string
  automationId?: string
  title: string
  caption: string
  hashtags: string
  prompt: string
  image_collection: string
  slideshow_type: string
  created_at: string
  updated_at: string
  settings: SlideshowSettings
  images: SlideshowSlide[]
}

// Products of rendering a draft: the exported media and the render status.
export type SlideshowRenderOutputs = {
  status: SlideshowStatus
  output_dir?: string
  output_images: string[]
  video_url?: string
  thumbnail_url?: string
}

// A persisted slideshow is a draft together with its render outputs.
export type SlideshowRecord = SlideshowDraft & SlideshowRenderOutputs

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
  video_url?: string
  thumbnail_url?: string
  createdAt?: string
}

type RawSlideshowRecord = Omit<Partial<SlideshowRecord>, "images"> & {
  images?: Partial<SlideshowSlide>[]
}

const defaultRootDir = path.join(process.cwd(), "data", "slideshows")

export async function listSlideshowRecords(
  input: {
    rootDir?: string
    resultRootDir?: string
    limit?: number
    id?: string
    ids?: string[]
  } = {}
) {
  if (input.id) {
    const result = await resultRecordForSlideshow(input, input.id)
    const slideshow = result ? resultRecordToSlideshowRecord(result) : null
    return slideshow ? [slideshow] : []
  }
  const ids = [...new Set((input.ids ?? []).map(clean))].filter(Boolean)
  if (input.ids && ids.length === 0) return []
  const resultRecords = await listResultRecords({
    rootDir: resultRootDirFor(input),
    slideshowIds: ids.length ? ids : undefined,
    limit: Math.max(1, input.limit ?? (ids.length || 100)),
  })
  const resultSlideshows = resultRecords
    .map(resultRecordToSlideshowRecord)
    .filter((record): record is SlideshowRecord => Boolean(record))
  return resultSlideshows.slice(0, Math.max(1, input.limit ?? 100))
}

export async function createSlideshowRecord(input: CreateSlideshowInput) {
  const { slideshow } = await createSlideshowResultRecord(input)
  return slideshow
}

export async function createSlideshowResultRecord(input: CreateSlideshowInput) {
  const now = normalizeDate(input.createdAt, new Date().toISOString())
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
    settings: {
      ...defaultSlideshowSettings(),
      ...input.settings,
    },
    images: input.images ?? [],
    video_url: clean(input.video_url) || undefined,
    thumbnail_url: clean(input.thumbnail_url) || undefined,
  })
  const recordWithOutputs = await writeSlideshowOutputs(input.rootDir, record)
  const result = await createResultRecord({
    rootDir: resultRootDirFor(input),
    automationId:
      recordWithOutputs.automationId ??
      `standalone-automation-${recordWithOutputs.id}`,
    runId: clean(input.runId) || `standalone-run-${recordWithOutputs.id}`,
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

export async function removeSlideshowSlide(input: {
  rootDir?: string
  resultRootDir?: string
  id: string
  slideIndex: number
}) {
  const slideIndex = Math.floor(input.slideIndex)
  const result = await resultRecordForSlideshow(input, input.id)
  if (!result || result.payload?.type !== "slideshow") {
    return null
  }
  const slides = result.payload.slides ?? []
  if (slideIndex < 0 || slideIndex >= slides.length) {
    throw new Error("Slide index is out of range")
  }
  if (slides.length <= 1) {
    throw new Error("A slideshow needs at least one slide")
  }

  const outputImages = result.artifacts.outputImages ?? []
  const updated = await updateResultRecord({
    rootDir: resultRootDirFor(input),
    id: result.id,
    update: (record) => ({
      ...record,
      payload: {
        ...(record.payload as ResultSlideshowPayload),
        slides: slides.filter((_, index) => index !== slideIndex),
      },
      artifacts: {
        ...record.artifacts,
        outputImages: outputImages.filter((_, index) => index !== slideIndex),
      },
    }),
  })
  return updated ? resultRecordToSlideshowRecord(updated) : null
}

export async function replaceSlideshowSlideImage(input: {
  rootDir?: string
  resultRootDir?: string
  id: string
  slideIndex: number
  imageUrl: string
}) {
  const slideIndex = Math.floor(input.slideIndex)
  const result = await resultRecordForSlideshow(input, input.id)
  if (!result || result.payload?.type !== "slideshow") {
    return null
  }
  const slideshow = resultRecordToSlideshowRecord(result)
  if (!slideshow) return null
  if (slideIndex < 0 || slideIndex >= slideshow.images.length) {
    throw new Error("Slide index is out of range")
  }

  const now = new Date().toISOString()
  const rerendered = await writeSlideshowOutputs(input.rootDir, {
    ...slideshow,
    updated_at: now,
    video_url: undefined,
    thumbnail_url: undefined,
    images: slideshow.images.map((slide, index) =>
      index === slideIndex
        ? {
            ...slide,
            image_url: input.imageUrl,
            source_image_url: input.imageUrl,
          }
        : slide
    ),
  })
  const updated = await updateResultRecord({
    rootDir: resultRootDirFor(input),
    id: result.id,
    update: (record) => ({
      ...record,
      payload: slideshowRecordToResultPayload(rerendered),
      artifacts: {
        ...record.artifacts,
        outputImages: rerendered.output_images,
        outputDir: rerendered.output_dir,
        videoUrl: rerendered.video_url,
        thumbnailUrl: rerendered.thumbnail_url,
      },
    }),
  })
  return updated ? resultRecordToSlideshowRecord(updated) : null
}

export async function updateSlideshowMetadata(input: {
  rootDir?: string
  resultRootDir?: string
  id: string
  title: string
  caption: string
  hashtags: string
}) {
  const result = await resultRecordForSlideshow(input, input.id)
  if (!result || result.payload?.type !== "slideshow") {
    return null
  }

  const title = clean(input.title)
  if (!title) {
    throw new Error("A slideshow title is required")
  }
  const updated = await updateResultRecord({
    rootDir: resultRootDirFor(input),
    id: result.id,
    update: (record) => ({
      ...record,
      title,
      payload: {
        ...(record.payload as ResultSlideshowPayload),
        caption: clean(input.caption),
        hashtags: clean(input.hashtags),
      },
    }),
  })
  return updated ? resultRecordToSlideshowRecord(updated) : null
}

export async function deleteSlideshowRecord(input: {
  rootDir?: string
  resultRootDir?: string
  id: string
}) {
  const result = await resultRecordForSlideshow(input, input.id)
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

  return null
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

  const deleted = deletedResultSlideshows
  if (deleted.length === 0) {
    return []
  }

  await Promise.all(
    deleted.map((record) => deleteSlideshowOutput(input.rootDir, record))
  )
  return deleted
}

export function defaultSlideshowSettings(
  overrides: Partial<SlideshowSettings> = {}
): SlideshowSettings {
  return {
    duration: defaultSlideshowDuration,
    aspect_ratio: defaultSlideshowAspectRatio,
    font: defaultSlideshowFont,
    background_color: "#000000",
    transition_style: defaultSlideshowTransition,
    export_as_video: false,
    sound_id: "",
    sound_name: "",
    sound_url: "",
    ...overrides,
  }
}

function resultRootDirFor(input: { rootDir?: string; resultRootDir?: string }) {
  return input.resultRootDir ?? input.rootDir
}

async function resultRecordForSlideshow(
  input: { rootDir?: string; resultRootDir?: string },
  slideshowId: string
) {
  const [targeted] = await listResultRecords({
    rootDir: resultRootDirFor(input),
    slideshowIds: [slideshowId],
    limit: 1,
  })
  return targeted ?? null
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
    runId: result.runId,
    automationId: result.automationId.startsWith("standalone-automation-")
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

function normalizeSlideshowRecord(record: RawSlideshowRecord): SlideshowRecord {
  const now = new Date().toISOString()
  const id = clean(record.id) || `slideshow-${randomUUID()}`
  const images = Array.isArray(record.images) ? record.images : []
  const settings = normalizeSettings(record.settings)

  return {
    id,
    runId: clean(record.runId) || undefined,
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
    settings,
    images: images.map((slide, index) => normalizeSlide(slide, index)),
  }
}

function normalizeSlide(
  slide: Partial<SlideshowSlide>,
  index: number
): SlideshowSlide {
  const imageUrl = clean(slide.image_url)
  return {
    id: clean(slide.id) || `slide-${index + 1}`,
    image_url: imageUrl,
    source_image_url: clean(slide.source_image_url) || undefined,
    overlayImage: normalizeOverlayImage(slide.overlayImage),
    overlay: Boolean(slide.overlay),
    iconLayout: normalizeOvalIconLayout(slide.iconLayout),
    textItems: Array.isArray(slide.textItems)
      ? slide.textItems.map((item, textIndex) =>
          normalizeTextItem(item, textIndex)
        )
      : [],
  }
}

function normalizeOvalIconLayout(
  value: Partial<SlideshowOvalIconLayout> | undefined
): SlideshowOvalIconLayout | undefined {
  if (value?.kind !== "oval-icons" || !Array.isArray(value.surrounding)) {
    return undefined
  }
  const surrounding = value.surrounding.flatMap((icon) => {
    const imageUrl = clean(icon.image_url)
    if (!imageUrl) return []
    return [
      {
        image_url: imageUrl,
        source_image_url: clean(icon.source_image_url) || undefined,
        image_caption: clean(icon.image_caption) || undefined,
        key: clean(icon.key) || undefined,
        x: normalizeNumber(icon.x, 50),
        y: normalizeNumber(icon.y, 50),
        scale: Math.max(0.7, Math.min(1.3, normalizeNumber(icon.scale, 1))),
        rotation: Math.max(
          -90,
          Math.min(90, normalizeNumber(icon.rotation, 0))
        ),
      },
    ]
  })
  return surrounding.length > 0
    ? { kind: "oval-icons", surrounding }
    : undefined
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
    fontSize: clean(item.fontSize) || "10px",
    textSize: normalizeTextSize(item.textSize, text),
    textStyle: clean(item.textStyle) || "outline",
    textAlign: clean(item.textAlign) || "center",
    textAnchor: clean(item.textAnchor) || "padded",
    textVerticalAnchor: clean(item.textVerticalAnchor) || "padded",
    textPlacement: item.textPlacement,
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
    aspect_ratio: clean(settings?.aspect_ratio) || defaultSlideshowAspectRatio,
    font: clean(settings?.font) || defaultSlideshowFont,
    transition_style:
      clean(settings?.transition_style) || defaultSlideshowTransition,
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
  const logicalOutputDir = path.join(rootDir, "outputs", record.id)
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-slideshow-"))
  await rm(logicalOutputDir, { recursive: true, force: true })

  try {
    const outputImages: string[] = []
    const outputs: Array<{
      publicUrl: string
      rasterPublicUrl: string
      sourcePublicUrl: string
      overlayPublicUrl?: string
      iconPublicUrls?: string[]
    }> = []
    for (const [index, slide] of record.images.entries()) {
      const sourceUrl = slide.source_image_url || slide.image_url
      const output = await materializeSlideImage({
        outputDir: scratchDir,
        slideshowId: record.id,
        slideIndex: index,
        slide,
        sourceUrl,
        aspectRatio: record.settings.aspect_ratio,
        font: record.settings.font,
      })
      outputs.push(output)
      outputImages.push(output.publicUrl)
    }
    const videoOutput = record.settings.export_as_video
      ? await materializeSlideshowVideo({
          outputDir: scratchDir,
          storageOutputDir: logicalOutputDir,
          slideshowId: record.id,
          durationSeconds: record.settings.duration,
          slideImagePaths: outputs.map((output) =>
            path.join(
              scratchDir,
              path.basename(
                new URL(output.rasterPublicUrl, "http://local").pathname
              )
            )
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
        const output = outputs[index]
        return {
          ...slide,
          source_image_url: output.sourcePublicUrl,
          overlayImage: slide.overlayImage
            ? {
                ...slide.overlayImage,
                source_image_url:
                  output.overlayPublicUrl ||
                  slide.overlayImage.source_image_url ||
                  slide.overlayImage.image_url,
              }
            : undefined,
          iconLayout: slide.iconLayout
            ? {
                ...slide.iconLayout,
                surrounding: slide.iconLayout.surrounding.map(
                  (icon, iconIndex) => ({
                    ...icon,
                    source_image_url:
                      output.iconPublicUrls?.[iconIndex] ||
                      icon.source_image_url ||
                      icon.image_url,
                  })
                ),
              }
            : undefined,
          image_url: output.publicUrl,
        }
      }),
    }

    await mirrorDirToAppwrite(scratchDir, logicalOutputDir)
    return outputRecord
  } finally {
    await rm(scratchDir, { recursive: true, force: true })
  }
}

async function deleteSlideshowOutput(
  rootDir = defaultRootDir,
  record: SlideshowRecord
) {
  const outputPrefix = `${outputDirUrl(record.id)}/`
  const generatedUrls = new Set([
    ...record.output_images,
    record.video_url,
    record.thumbnail_url,
    ...record.images.flatMap((slide) => [
      slide.image_url,
      slide.source_image_url,
      slide.overlayImage?.source_image_url,
      ...(slide.iconLayout?.surrounding.flatMap((icon) => [
        icon.image_url,
        icon.source_image_url,
      ]) ?? []),
    ]),
  ])
  await Promise.all(
    [...generatedUrls]
      .filter((url): url is string => Boolean(url?.startsWith(outputPrefix)))
      .map((url) => localAssetPathForUrl(url))
      .filter((assetPath): assetPath is string => Boolean(assetPath))
      .map((assetPath) => deleteAssetFromAppwrite(assetPath))
  )
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
  aspectRatio: string
  font: string
}) {
  const source = await materializeSlideSource(input)
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
  const iconSources = await Promise.all(
    (input.slide.iconLayout?.surrounding ?? []).map((icon, iconIndex) =>
      materializeSlideAsset({
        ...input,
        sourceUrl: icon.source_image_url || icon.image_url,
        prefix: `icon-${String(iconIndex + 1).padStart(2, "0")}`,
      })
    )
  )
  const fileName = `slide-${String(input.slideIndex + 1).padStart(3, "0")}.svg`
  const svg = renderedSlideSvg(
    input.slide,
    await imageDataUri(source.filePath, source.extension),
    overlaySource
      ? await imageDataUri(overlaySource.filePath, overlaySource.extension)
      : undefined,
    {
      aspectRatio: input.aspectRatio,
      font: input.font,
      iconUrls: await Promise.all(
        iconSources.map((icon) => imageDataUri(icon.filePath, icon.extension))
      ),
    }
  )
  const svgPath = path.join(input.outputDir, fileName)
  await writeFile(svgPath, svg)
  const rasterFileName = `slide-${String(input.slideIndex + 1).padStart(3, "0")}.png`
  const rasterPath = path.join(input.outputDir, rasterFileName)
  await renderSvgToPng(svg, rasterPath)

  return {
    fileName,
    publicUrl: outputFileUrl(input.slideshowId, rasterFileName),
    rasterPublicUrl: outputFileUrl(input.slideshowId, rasterFileName),
    sourcePublicUrl: source.publicUrl,
    overlayPublicUrl: overlaySource?.publicUrl,
    iconPublicUrls: iconSources.map((icon) => icon.publicUrl),
  }
}

async function renderSvgToPng(svg: string, outputPath: string) {
  const sharp = (await import("sharp")).default
  await sharp(Buffer.from(svg)).png().toFile(outputPath)
}

async function materializeSlideshowVideo(input: {
  outputDir: string
  storageOutputDir: string
  slideshowId: string
  durationSeconds: number
  slideImagePaths: string[]
}) {
  if (input.slideImagePaths.length === 0) {
    throw new Error("Video export requires at least one rendered slide")
  }
  const apiKey = getRendiApiKey()
  if (!apiKey) {
    throw new Error("RENDI_API_KEY is not configured")
  }

  const outputPath = path.join(input.storageOutputDir, "slideshow-export.mp4")
  const localOutputPath = path.join(input.outputDir, "slideshow-export.mp4")
  const thumbnailPath = path.join(input.outputDir, "slideshow-thumbnail.png")
  await copyFile(input.slideImagePaths[0], thumbnailPath)
  await encodePngSequenceToMp4ViaRendi({
    apiKey,
    outputPath,
    localOutputPath,
    durationSeconds: input.durationSeconds,
    slideImagePaths: input.slideImagePaths,
  })
  return {
    videoUrl: outputFileUrl(input.slideshowId, "slideshow-export.mp4"),
    thumbnailUrl: outputFileUrl(input.slideshowId, "slideshow-thumbnail.png"),
  }
}

// Encode the slide stills into an mp4 via the Rendi cloud ffmpeg API (no local
// ffmpeg). Each still is looped for `durationSeconds`, then concatenated.
async function encodePngSequenceToMp4ViaRendi(input: {
  apiKey: string
  outputPath: string
  localOutputPath: string
  durationSeconds: number
  slideImagePaths: string[]
}) {
  const duration = Math.max(
    1,
    input.durationSeconds || defaultSlideshowDuration
  )
  const inputFiles: Record<string, string> = {}
  const command: string[] = []
  for (const [index, slidePath] of input.slideImagePaths.entries()) {
    const stored = await uploadLocalFileToRendi({
      filePath: slidePath,
      apiKey: input.apiKey,
    })
    if (!stored.storage_url) {
      throw new Error("Rendi did not accept a slide image")
    }
    const alias = `in_slide_${index + 1}`
    inputFiles[alias] = stored.storage_url
    command.push("-loop", "1", "-t", String(duration), "-i", `{{${alias}}}`)
  }

  const count = input.slideImagePaths.length
  if (count === 1) {
    command.push("-vf", "fps=12,format=yuv420p")
  } else {
    const labels = Array.from({ length: count }, (_, i) => `[${i}:v]`).join("")
    command.push(
      "-filter_complex",
      `${labels}concat=n=${count}:v=1:a=0,fps=12,format=yuv420p[v]`,
      "-map",
      "[v]"
    )
  }
  command.push("-movflags", "+faststart", "{{out_video}}")

  await runRendiFfmpegAndDownload({
    apiKey: input.apiKey,
    ffmpegCommand: command.join(" "),
    inputFiles,
    outputFiles: { out_video: "slideshow-export.mp4" },
    outputAlias: "out_video",
    outputPath: input.outputPath,
    localOutputPath: input.localOutputPath,
    maxCommandRunSeconds: 300,
    vcpuCount: 4,
    metadata: { workflow: "slideshow_export" },
  })
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
  prefix: string
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

  throw new Error(`Unsupported slideshow image URL: ${input.sourceUrl}`)
}

async function normalizeMaterializedImageSource(input: {
  outputDir: string
  slideshowId: string
  slideIndex: number
  filePath: string
  fallbackExtension: string
  prefix: string
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
  if ([".avif", ".gif", ".webp"].includes(extension.toLowerCase())) {
    const sharp = (await import("sharp")).default
    const png = await sharp(bytes, { animated: false }).png().toBuffer()
    return toDataUrl(png, "image/png")
  }
  return toDataUrl(bytes, imageMimeType(extension))
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

  // Source assets live in Appwrite Storage; stage the bytes into the scratch dir.
  const bytes = await readAssetBytes(sourcePath)
  await writeFile(filePath, bytes)
  return true
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

  const response = await fetchWithTimeout(sourceUrl, undefined, {
    timeoutMs: 120_000,
  })
  if (!response.ok) {
    throw new Error(
      `Could not load slideshow image ${sourceUrl} (${response.status})`
    )
  }
  const body = Buffer.from(await response.arrayBuffer())
  return {
    body,
    extension:
      imageExtensionFromContentType(response.headers.get("content-type")) ||
      imageExtensionFromUrl(sourceUrl),
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
