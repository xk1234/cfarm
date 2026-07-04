import { randomUUID } from "node:crypto"
import path from "node:path"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

export type SlideshowStatus = "draft" | "exported" | "failed"

export type SlideshowSettings = {
  duration: number
  background_color: string
  is_bg_overlay_on: boolean
  transition_style: string
  background_opacity: number
  is_bg_overlay_on_hook_image: boolean
}

export type SlideshowTextItem = {
  id: string
  text: string
  font: string
  fontSize: string
  textSize: {
    width: number
    height: number
  }
  textStyle: string
  textAlign?: string
  textAnchor?: string
  textPosition: {
    x: number
    y: number
  }
}

export type SlideshowSlide = {
  id: string
  image_url: string
  textItems: SlideshowTextItem[]
  aspect_ratio: string
  time_length_ms: number
}

export type SlideshowRecord = {
  id: string
  title: string
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
  title?: string
  status?: SlideshowStatus
  prompt?: string
  image_collection?: string
  slideshow_type?: string
  settings?: Partial<SlideshowSettings>
  images?: Partial<SlideshowSlide>[]
  slides?: Partial<SlideshowSlide>[]
  is_finished?: boolean
  is_failed?: boolean
}

type RawSlideshowRecord = Omit<Partial<SlideshowRecord>, "images"> & {
  images?: Partial<SlideshowSlide>[]
}

const defaultRootDir = path.join(process.cwd(), "data", "slideshows")
const dbFileName = "slideshows.json"

export async function listSlideshowRecords(input: {
  rootDir?: string
  limit?: number
  id?: string
} = {}) {
  const records = await readSlideshowRecords(input.rootDir)
  const filtered = input.id ? records.filter((record) => record.id === input.id) : records
  return filtered.slice(0, Math.max(1, input.limit ?? 100))
}

export async function createSlideshowRecord(input: CreateSlideshowInput) {
  const records = await readSlideshowRecords(input.rootDir)
  const now = new Date().toISOString()
  const record = normalizeSlideshowRecord({
    id: `slideshow-${randomUUID()}`,
    title: clean(input.title) || "New Slideshow",
    status: input.status ?? "draft",
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
  })
  const next = [record, ...records.filter((item) => item.id !== record.id)]
  await writeSlideshowRecords(input.rootDir, next)
  return record
}

export async function deleteSlideshowRecord(input: {
  rootDir?: string
  id: string
}) {
  const records = await readSlideshowRecords(input.rootDir)
  const deleted = records.find((record) => record.id === input.id) ?? null
  if (!deleted) {
    return null
  }
  await writeSlideshowRecords(input.rootDir, records.filter((record) => record.id !== input.id))
  return deleted
}

export function defaultSlideshowSettings(overrides: Partial<SlideshowSettings> = {}): SlideshowSettings {
  return {
    duration: 4,
    background_color: "#000000",
    is_bg_overlay_on: false,
    transition_style: "hard",
    background_opacity: 40,
    is_bg_overlay_on_hook_image: false,
    ...overrides,
  }
}

function readSlideshowRecords(rootDir = defaultRootDir) {
  return readJsonArrayStore<SlideshowRecord>({
    rootDir,
    fileName: dbFileName,
    key: "slideshows",
    normalize: normalizeSlideshowRecord,
  })
}

async function writeSlideshowRecords(rootDir = defaultRootDir, records: SlideshowRecord[]) {
  await writeJsonArrayStore({ rootDir, fileName: dbFileName, key: "slideshows", records })
}

function normalizeSlideshowRecord(record: RawSlideshowRecord): SlideshowRecord {
  const now = new Date().toISOString()
  const images = Array.isArray(record.images) ? record.images : []
  const settings = normalizeSettings(record.settings)
  const isFailed = Boolean(record.is_failed) || record.status === "failed"

  return {
    id: clean(record.id) || `slideshow-${randomUUID()}`,
    title: clean(record.title) || "New Slideshow",
    status: record.status === "exported" || record.status === "failed" ? record.status : "draft",
    prompt: clean(record.prompt),
    image_collection: clean(record.image_collection),
    slideshow_type: clean(record.slideshow_type) || "educational",
    created_at: normalizeDate(record.created_at, now),
    updated_at: normalizeDate(record.updated_at, now),
    is_finished: typeof record.is_finished === "boolean" ? record.is_finished : !isFailed,
    is_failed: isFailed,
    settings,
    images: images.map((slide, index) => normalizeSlide(slide, index, settings.duration)),
  }
}

function normalizeSlide(slide: Partial<SlideshowSlide>, index: number, duration: number): SlideshowSlide {
  const imageUrl = clean(slide.image_url)
  return {
    id: clean(slide.id) || `slide-${index + 1}`,
    image_url: imageUrl,
    textItems: Array.isArray(slide.textItems)
      ? slide.textItems.map((item, textIndex) => normalizeTextItem(item, textIndex))
      : [],
    aspect_ratio: clean(slide.aspect_ratio) || "9:16",
    time_length_ms: normalizeDurationMs(slide.time_length_ms, duration),
  }
}

function normalizeTextItem(item: Partial<SlideshowTextItem>, index: number): SlideshowTextItem {
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

function normalizeSettings(settings: Partial<SlideshowSettings> | undefined): SlideshowSettings {
  return {
    ...defaultSlideshowSettings(),
    ...(settings ?? {}),
    duration: normalizeNumber(settings?.duration, 4),
    background_opacity: normalizeNumber(settings?.background_opacity, 40),
  }
}

function normalizeTextSize(value: SlideshowTextItem["textSize"] | undefined, text: string) {
  return {
    width: normalizeNumber(value?.width, Math.max(20, Math.min(100, text.length * 4))),
    height: normalizeNumber(value?.height, 18),
  }
}

function normalizeTextPosition(value: SlideshowTextItem["textPosition"] | undefined) {
  return {
    x: normalizeNumber(value?.x, 50),
    y: normalizeNumber(value?.y, 45),
  }
}

function normalizeDurationMs(value: unknown, duration: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : Math.max(1, duration) * 1000
}

function normalizeNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeDate(value: unknown, fallback: string) {
  const date = new Date(typeof value === "string" ? value : fallback)
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
