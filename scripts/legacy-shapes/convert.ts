import { automationTemplateRecordToSchema } from "../../lib/automation-templates"
import { normalizeAutomationSchema } from "../../lib/realfarm-automation"
import type { Automation } from "../../lib/realfarm-data"

export type ConversionResult = {
  changed: boolean
  data: Record<string, unknown>
  droppedPaths: string[]
  warnings: string[]
}

const templateRuntimeFields = [
  "automationKind",
  "aspect_ratio",
  "font",
  "image_fit",
  "language",
  "prompt_formatting",
  "hooks",
  "image_collection_ids",
  "tone",
  "formatting",
  "tiktok_post_settings",
  "social_post_settings",
  "social_publish_as",
  "web_search_enabled",
  "video_format",
  "ugc",
] as const

const retiredAutomationPaths = [
  "schema.knowledge_context_enabled",
  "schema.knowledge_base_ids",
  "schema.schedule.interval",
] as const

export function convertAutomationTemplateV1toV2(
  rawData: unknown
): ConversionResult {
  const raw = object(rawData)
  if (!raw) return failure("Payload must be an object")
  if (!object(raw.template)) return unchanged(raw)
  if (object(raw.schema))
    return failure(
      "BLOCKED_CONFLICT: both template and schema are present",
      raw
    )

  try {
    const runtime = automationTemplateRecordToSchema(
      raw as never
    ) as unknown as Record<string, unknown>
    const schema: Record<string, unknown> = {}
    for (const field of templateRuntimeFields) {
      if (runtime[field] !== undefined)
        schema[field] = jsonValue(runtime[field])
    }
    schema.created_at = iso(runtime.created_at)
    const data: Record<string, unknown> = {}
    for (const field of [
      "id",
      "automationKind",
      "sourceAutomationId",
      "sourceUrl",
      "name",
      "theme",
      "createdAt",
      "updatedAt",
    ] as const) {
      if (raw[field] !== undefined) data[field] = jsonValue(raw[field])
    }
    data.schema = schema
    return result(raw, data, ["template"])
  } catch (error) {
    return failure(`Template conversion failed: ${message(error)}`, raw)
  }
}

export function convertAutomationV1toV2(rawData: unknown): ConversionResult {
  const raw = object(rawData)
  const sourceSchema = object(raw?.schema)
  if (!raw || !sourceSchema)
    return failure("Payload and schema must be objects", raw ?? {})

  const warnings: string[] = []
  if ("title" in sourceSchema && !equalSemantic(sourceSchema.title, raw.name))
    warnings.push(
      "BLOCKED_CONFLICT: schema.title differs from authoritative name"
    )
  if (
    "status" in sourceSchema &&
    !equalSemantic(sourceSchema.status, raw.status)
  )
    warnings.push(
      "BLOCKED_CONFLICT: schema.status differs from authoritative status"
    )
  if (warnings.length)
    return { changed: false, data: raw, droppedPaths: [], warnings }

  try {
    const summary: Automation = {
      id: string(raw.id),
      name: string(raw.name),
      status: raw.status === "paused" ? "paused" : "live",
      account: string(raw.account),
      handle: string(raw.handle),
      times: [],
      favorite: Boolean(raw.favorite),
      theme: string(raw.theme) || "ugc",
      socialIntegrations: [],
    }
    const normalized = jsonValue(
      normalizeAutomationSchema(sourceSchema as never, summary)
    ) as Record<string, unknown>
    delete normalized.title
    delete normalized.status
    const schedule = object(normalized.schedule)
    if (schedule) delete schedule.interval

    const data = jsonValue(raw) as Record<string, unknown>
    delete data.account
    delete data.handle
    delete data.times
    data.schema = normalized
    const dropped = [
      "account",
      "handle",
      "times",
      "schema.title",
      "schema.status",
      ...retiredAutomationPaths,
    ].filter((path) => hasPath(raw, path))
    return result(raw, data, dropped)
  } catch (error) {
    return failure(`Automation conversion failed: ${message(error)}`, raw)
  }
}

export function convertImageCollectionV1toV2(
  rawData: unknown
): ConversionResult {
  const raw = object(rawData)
  if (!raw) return failure("Payload must be an object")
  if (typeof raw.id === "string" && raw.id) return unchanged(raw)
  const name = string(raw.name)
  const id = slugify(name)
  if (!id) return failure("Image collection has no slug-safe name", raw)
  return result(raw, { ...raw, id }, [])
}

function result(
  before: Record<string, unknown>,
  data: Record<string, unknown>,
  droppedPaths: string[],
  warnings: string[] = []
): ConversionResult {
  return {
    changed: stable(before) !== stable(data),
    data,
    droppedPaths,
    warnings,
  }
}
function unchanged(data: Record<string, unknown>): ConversionResult {
  return { changed: false, data, droppedPaths: [], warnings: [] }
}
function failure(
  warning: string,
  data: Record<string, unknown> = {}
): ConversionResult {
  return { changed: false, data, droppedPaths: [], warnings: [warning] }
}
function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
function string(value: unknown): string {
  return typeof value === "string" ? value : ""
}
function iso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value))
  if (!Number.isFinite(date.valueOf())) throw new Error("invalid created_at")
  return date.toISOString()
}
function jsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
function equalSemantic(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b)
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  const rec = object(value)
  if (rec)
    return `{${Object.keys(rec)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(rec[k])}`)
      .join(",")}}`
  return JSON.stringify(value)
}
function hasPath(value: Record<string, unknown>, path: string): boolean {
  let cursor: unknown = value
  for (const part of path.split(".")) {
    const rec = object(cursor)
    if (!rec || !(part in rec)) return false
    cursor = rec[part]
  }
  return true
}
function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
