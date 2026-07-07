import { randomUUID } from "node:crypto"
import path from "node:path"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import type {
  SlideshowSettings,
  SlideshowSlide,
} from "@/lib/slideshows"

export type ResultWorkflowType = "slideshow" | "video"
export type ResultStatus = "succeeded" | "failed"

export type ResultArtifacts = {
  slideshowId?: string
  videoUrl?: string
  thumbnailUrl?: string
  outputImages: string[]
  outputDir?: string
}

export type ResultSlideshowPayload = {
  type: "slideshow"
  caption: string
  hashtags: string
  prompt: string
  imageCollectionId: string
  slideshowType: string
  settings: SlideshowSettings
  slides: SlideshowSlide[]
}

export type ResultVideoPayload = {
  type: "video"
  sourceUrl?: string
  settings?: Record<string, unknown>
}

export type ResultPayload = ResultSlideshowPayload | ResultVideoPayload

export type ResultRecord = {
  id: string
  automationId: string
  runId: string
  workflowType: ResultWorkflowType
  title: string
  status: ResultStatus
  createdAt: string
  updatedAt: string
  artifacts: ResultArtifacts
  payload?: ResultPayload
  destinationAccountIds: string[]
}

export type CreateResultInput = {
  rootDir?: string
  id?: string
  automationId: string
  runId: string
  workflowType: ResultWorkflowType
  title: string
  status?: ResultStatus
  artifacts?: Partial<ResultArtifacts>
  payload?: ResultPayload
  destinationAccountIds?: string[]
  createdAt?: string
  updatedAt?: string
}

type RawResultRecord = Omit<
  Partial<ResultRecord>,
  "artifacts" | "payload"
> & {
  artifacts?: Partial<ResultArtifacts>
  payload?: Partial<ResultPayload> & { type?: unknown }
}

const dbFileName = "results.json"

export async function listResultRecords(
  input: {
    rootDir?: string
    id?: string
    automationId?: string
    runId?: string
    limit?: number
  } = {}
) {
  const records = await readResultRecords(input.rootDir)
  const filtered = records.filter((record) => {
    if (input.id && record.id !== input.id) {
      return false
    }
    if (input.automationId && record.automationId !== input.automationId) {
      return false
    }
    if (input.runId && record.runId !== input.runId) {
      return false
    }
    return true
  })

  return filtered.slice(0, Math.max(1, input.limit ?? 100))
}

export async function createResultRecord(input: CreateResultInput) {
  const records = await readResultRecords(input.rootDir)
  const now = new Date().toISOString()
  const record = normalizeResultRecord({
    ...input,
    id: clean(input.id) || `result-${clean(input.runId) || randomUUID()}`,
    status: input.status ?? "succeeded",
    artifacts: input.artifacts ?? {},
    destinationAccountIds: input.destinationAccountIds ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? input.createdAt ?? now,
  })

  if (!record) {
    throw new Error("A result requires an automation id and run id")
  }

  const next = [
    record,
    ...records.filter(
      (item) => item.id !== record.id && item.runId !== record.runId
    ),
  ]
  await writeResultRecords(input.rootDir, next)
  return record
}

export async function deleteResultRecord(input: {
  rootDir?: string
  id: string
}) {
  const id = clean(input.id)
  if (!id) {
    return null
  }

  const records = await readResultRecords(input.rootDir)
  const deleted = records.find((record) => record.id === id) ?? null
  if (!deleted) {
    return null
  }

  await writeResultRecords(
    input.rootDir,
    records.filter((record) => record.id !== id)
  )
  return deleted
}

export async function deleteResultRecordsForAutomation(input: {
  rootDir?: string
  automationId?: string
  runIds?: string[]
  slideshowIds?: string[]
}) {
  const automationId = clean(input.automationId)
  const runIds = new Set((input.runIds ?? []).map(clean).filter(Boolean))
  const slideshowIds = new Set(
    (input.slideshowIds ?? []).map(clean).filter(Boolean)
  )
  if (!automationId && runIds.size === 0 && slideshowIds.size === 0) {
    return []
  }

  const records = await readResultRecords(input.rootDir)
  const deleted = records.filter(
    (record) =>
      (automationId && record.automationId === automationId) ||
      runIds.has(record.runId) ||
      (record.artifacts.slideshowId &&
        slideshowIds.has(record.artifacts.slideshowId))
  )
  if (deleted.length === 0) {
    return []
  }

  const deletedIds = new Set(deleted.map((record) => record.id))
  await writeResultRecords(
    input.rootDir,
    records.filter((record) => !deletedIds.has(record.id))
  )
  return deleted
}

function readResultRecords(rootDir = defaultRootDir()) {
  return readJsonArrayStore<ResultRecord>({
    rootDir,
    fileName: dbFileName,
    key: "results",
    normalize: normalizeResultRecord,
  })
}

async function writeResultRecords(
  rootDir = defaultRootDir(),
  records: ResultRecord[]
) {
  await writeJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "results",
    records,
  })
}

function defaultRootDir() {
  return path.join(process.cwd(), "data", "results")
}

function normalizeResultRecord(record: RawResultRecord): ResultRecord | null {
  const automationId = clean(record.automationId)
  const runId = clean(record.runId)
  if (!automationId || !runId) {
    return null
  }

  const now = new Date().toISOString()
  const payload = normalizePayload(record.payload)
  const workflowType =
    record.workflowType === "video" || payload?.type === "video"
      ? "video"
      : "slideshow"

  return {
    id: clean(record.id) || `result-${runId}`,
    automationId,
    runId,
    workflowType,
    title: clean(record.title) || "Automation result",
    status: record.status === "failed" ? "failed" : "succeeded",
    createdAt: normalizeDate(record.createdAt, now),
    updatedAt: normalizeDate(record.updatedAt, record.createdAt ?? now),
    artifacts: {
      slideshowId: clean(record.artifacts?.slideshowId) || undefined,
      videoUrl: clean(record.artifacts?.videoUrl) || undefined,
      thumbnailUrl: clean(record.artifacts?.thumbnailUrl) || undefined,
      outputImages: Array.isArray(record.artifacts?.outputImages)
        ? record.artifacts.outputImages.map(clean).filter(Boolean)
        : [],
      outputDir: clean(record.artifacts?.outputDir) || undefined,
    },
    payload,
    destinationAccountIds: Array.isArray(record.destinationAccountIds)
      ? record.destinationAccountIds.map(clean).filter(Boolean)
      : [],
  }
}

function normalizePayload(
  payload: RawResultRecord["payload"]
): ResultPayload | undefined {
  if (!payload) {
    return undefined
  }
  if (payload.type === "video") {
    return {
      type: "video",
      sourceUrl: clean((payload as ResultVideoPayload).sourceUrl) || undefined,
      settings: isRecord((payload as ResultVideoPayload).settings)
        ? (payload as ResultVideoPayload).settings
        : undefined,
    }
  }
  if (payload.type !== "slideshow") {
    return undefined
  }

  const slideshow = payload as Partial<ResultSlideshowPayload>
  return {
    type: "slideshow",
    caption: clean(slideshow.caption),
    hashtags: clean(slideshow.hashtags),
    prompt: clean(slideshow.prompt),
    imageCollectionId: clean(slideshow.imageCollectionId),
    slideshowType: clean(slideshow.slideshowType) || "automation",
    settings: slideshow.settings as SlideshowSettings,
    slides: Array.isArray(slideshow.slides)
      ? (slideshow.slides as SlideshowSlide[])
      : [],
  }
}

function normalizeDate(value: unknown, fallback: unknown) {
  const text = clean(value)
  if (text && Number.isFinite(new Date(text).getTime())) {
    return new Date(text).toISOString()
  }
  const fallbackText = clean(fallback)
  if (fallbackText && Number.isFinite(new Date(fallbackText).getTime())) {
    return new Date(fallbackText).toISOString()
  }
  return new Date().toISOString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
