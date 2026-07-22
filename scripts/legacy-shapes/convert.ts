import {
  defaultAutomationSchema,
  normalizeAutomationSchema,
} from "../../lib/realfarm-automation"
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
    const runtime = convertLegacyTemplateRuntime(raw)
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

function convertLegacyTemplateRuntime(raw: Record<string, unknown>) {
  const template = object(raw.template)!
  const format = object(template.format) ?? {}
  const summary: Automation = {
    id: string(raw.id),
    name: string(raw.name),
    status: "live",
    account: "",
    handle: "",
    times: [],
    favorite: false,
    theme: string(raw.theme) || "template",
    socialIntegrations: [],
  }
  const base = defaultAutomationSchema(summary)
  const hook = legacySection(object(format.hook), "hook")
  const content = legacySection(object(format.content), "body")
  const ctaSource = object(format.cta)
  const cta = legacySection(ctaSource, "cta")
  cta.slideCount = ctaSource?.enabled === true ? 1 : 0
  const ids = parseObject(template.image_collection_ids) ?? base.image_collection_ids
  const hooks = Array.isArray(template.hooks)
    ? template.hooks.map(string).filter(Boolean)
    : []
  return normalizeAutomationSchema(
    {
      ...base,
      automationKind:
        raw.automationKind === "video" || raw.automationKind === "ugc"
          ? raw.automationKind
          : "slideshow",
      created_at: new Date(string(template.created_at)),
      aspect_ratio: hook.aspect_ratio as never,
      hooks: hooks.map((text, index) => ({
        id: `hook-${index + 1}`,
        text,
        enabled: true,
        createdAt: string(template.created_at),
      })),
      image_collection_ids: ids as never,
      tone: {
        value: string(format.custom_tone) || string(format.tone),
        preset: string(format.tone) || "Custom",
      },
      formatting: [hook, content, cta] as never,
      web_search_enabled: template.web_search_enabled === true,
      video_format: template.video_format as never,
    },
    summary
  ) as unknown as Record<string, unknown>
}

function legacySection(value: Record<string, unknown> | null, id: "hook" | "body" | "cta") {
  const section = value ?? {}
  const items = Array.isArray(section.text_items) ? section.text_items : []
  return {
    id,
    image_url: "",
    aspect_ratio: string(section.aspect_ratio) || "9:16",
    imageGrid: string(section.image_grid) || "none",
    slideCount:
      id === "body"
        ? Number(section.slide_count_min ?? section.slide_count) || 1
        : 1,
    slideCountMode: section.slide_count_mode,
    slideCountMin: Number(section.slide_count_min) || undefined,
    slideCountMax: Number(section.slide_count_max) || undefined,
    noText: section.display_text === false,
    overlay: section.overlay === true,
    aiImageSelection: section.ai_image_selection === true,
    overlayImage: object(section.overlay_image)
      ? {
          enabled: object(section.overlay_image)!.enabled === true,
          collectionId: string(object(section.overlay_image)!.collection_id),
          padding: Number(object(section.overlay_image)!.height) || 0,
        }
      : undefined,
    imageMode: section.image_mode,
    textItems: items.flatMap((item) => {
      const text = object(item)
      if (!text) return []
      return [{
        id: string(text.id), text: "", font: string(text.font),
        fontSize: string(text.font_size), textStyle: string(text.text_style),
        textPosition: string(text.text_position), textItemWidth: string(text.text_item_width),
        wordLengthMin: Number(text.word_length_min) || 0,
        wordLengthMax: Number(text.word_length_max) || 0,
        contentDirection: string(text.content_direction), textMode: text.text_mode,
        staticText: string(text.static_text), textAlign: string(text.text_align),
        textAnchor: string(text.text_anchor), textVerticalAnchor: string(text.text_vertical_anchor) || "padded",
      }]
    }),
  }
}

function parseObject(value: unknown) {
  if (object(value)) return object(value)
  if (typeof value !== "string") return null
  try { return object(JSON.parse(value)) } catch { return null }
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
    const migrationSchema = jsonValue(sourceSchema) as Record<string, unknown>
    delete migrationSchema.knowledge_context_enabled
    delete migrationSchema.knowledge_base_ids
    const migrationSchedule = object(migrationSchema.schedule)
    if (migrationSchedule) {
      const interval = object(migrationSchedule.interval)
      if (
        interval &&
        (!Array.isArray(migrationSchedule.posting_times) ||
          migrationSchedule.posting_times.length === 0)
      ) {
        migrationSchedule.posting_times = intervalPostingTimes(interval)
      }
      delete migrationSchedule.interval
    }
    const normalized = jsonValue(
      normalizeAutomationSchema(migrationSchema as never, summary)
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

function intervalPostingTimes(interval: Record<string, unknown>) {
  const start = clockMinutes(string(interval.start_time))
  const end = clockMinutes(string(interval.end_time))
  const step = Math.max(1, Number(interval.every_n_hours) || 1) * 60
  if (start === null || end === null || end < start) return []
  const days = Array.isArray(interval.days) ? interval.days.map(string) : []
  const slots = []
  for (let minute = start; minute <= end; minute += step) {
    const hour = Math.floor(minute / 60)
    slots.push({
      time: `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`,
      days,
    })
  }
  return slots
}

function clockMinutes(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!match) return null
  let hour = Number(match[1]) % 12
  if (match[3].toUpperCase() === "PM") hour += 12
  return hour * 60 + Number(match[2])
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
