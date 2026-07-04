import { randomUUID } from "node:crypto"
import path from "node:path"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import {
  defaultAutomationSchema,
  normalizeAutomationSchema,
  type AutomationSchema,
  type AutomationSchedule,
  type AutomationStatus,
  type AutomationTemplate,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

export type AutomationRecordStatus = "live" | "paused" | "draft" | "unknown"

export type AutomationRecord = {
  id: string
  sourceAutomationId?: string
  sourceUrl?: string
  name: string
  status: AutomationRecordStatus
  account: string
  handle: string
  times: string[]
  favorite: boolean
  theme: string
  importedAt?: string
  updatedAt: string
  schema: AutomationSchema
  raw?: Record<string, unknown>
}

const defaultRootDir = path.join(process.cwd(), "data", "automations")
const dbFileName = "automations.json"

export async function listAutomationRecords(options: { rootDir?: string } = {}) {
  return await readAutomationRecords(options.rootDir)
}

export async function upsertAutomationRecords(input: { rootDir?: string; records: AutomationRecord[] }) {
  const current = await readAutomationRecords(input.rootDir)
  const next = [...current]

  for (const record of input.records) {
    const index = next.findIndex((item) =>
      record.sourceAutomationId
        ? item.sourceAutomationId === record.sourceAutomationId
        : item.id === record.id
    )
    if (index >= 0) {
      next[index] = { ...record, id: next[index].id, importedAt: next[index].importedAt ?? record.importedAt }
    } else {
      next.unshift(record)
    }
  }

  await writeAutomationRecords(input.rootDir, next)
  return next
}

export function createLocalAutomationRecord(input: {
  name?: string
  schema?: AutomationSchema
  template?: AutomationTemplate
  overrides?: Partial<Pick<AutomationSchema, "status" | "tiktok_account_id" | "schedule">>
} = {}): AutomationRecord {
  const now = new Date().toISOString()
  const id = `automation-local-${randomUUID()}`
  const name = clean(input.name) || clean(input.schema?.title) || "Untitled automation"
  const summary = automationSummary({
    id,
    name,
    status: "Live",
    account: "No TikTok account",
    handle: "",
    times: [],
    favorite: false,
    theme: "ugc",
  })
  const defaults = defaultAutomationSchema(summary)
  const schema: AutomationSchema = input.schema
    ? cloneLocalSchema(input.schema, summary, name, now)
    : {
        ...defaults,
        created_at: new Date(now),
        title: name,
        status: input.overrides?.status ?? "live",
        tiktok_account_id: input.overrides?.tiktok_account_id ?? defaults.tiktok_account_id,
        ...(input.template ? cloneTemplate(input.template, now) : cloneTemplate(defaults, now)),
        schedule: cloneSchedule(input.overrides?.schedule ?? defaults.schedule),
      }

  return {
    id,
    name,
    status: schema.status,
    account: summary.account,
    handle: summary.handle,
    times: summary.times,
    favorite: summary.favorite,
    theme: summary.theme,
    updatedAt: now,
    schema,
  }
}

export async function patchAutomationRecord(input: {
  rootDir?: string
  id: string
  name?: string
  status?: AutomationStatus
  favorite?: boolean
  schema?: AutomationSchema
}) {
  const records = await readAutomationRecords(input.rootDir)
  const updatedAt = new Date().toISOString()
  let updated: AutomationRecord | null = null
  const next = records.map((record) => {
    if (record.id !== input.id) {
      return record
    }
    updated = {
      ...record,
      name: clean(input.name) || record.name,
      status: input.status ?? input.schema?.status ?? record.status,
      favorite: typeof input.favorite === "boolean" ? input.favorite : record.favorite,
      schema: input.schema ?? record.schema,
      updatedAt,
    }
    return updated
  })

  await writeAutomationRecords(input.rootDir, next)
  return updated
}

export async function deleteAutomationRecord(input: {
  rootDir?: string
  id: string
}) {
  const records = await readAutomationRecords(input.rootDir)
  const deleted = records.find((record) => record.id === input.id) ?? null
  if (!deleted) {
    return null
  }

  await writeAutomationRecords(input.rootDir, records.filter((record) => record.id !== input.id))
  return deleted
}

export function normalizeReelfarmAutomation(raw: unknown): AutomationRecord {
  const record = isRecord(raw) ? raw : {}
  const now = new Date().toISOString()
  const sourceAutomationId = clean(record.id ?? record._id ?? record.uuid ?? record.automationId)
  const name = clean(record.name ?? record.title) || "Untitled automation"
  const status = normalizeStatus(record.status)
  const account = clean(record.account ?? record.tiktokAccount ?? record.pageName) || "No TikTok account"
  const handle = clean(record.handle ?? record.username ?? record.profile)
  const times = normalizeTimes(record.times ?? record.postingTimes ?? record.schedule)
  const favorite = Boolean(record.favorite ?? record.isFavorite)
  const theme = clean(record.theme ?? record.style ?? record.category) || "ugc"
  const summary = automationSummary({
    id: sourceAutomationId || randomUUID(),
    name,
    status,
    account,
    handle,
    times,
    favorite,
    theme,
  })
  const baseSchema = defaultAutomationSchema(summary)
  const settings = isRecord(record.settings) ? record.settings : record
  const schema = mergeImportedSchema(baseSchema, settings, name, status)

  return {
    id: `automation-${slugify(sourceAutomationId || name)}-${sourceAutomationId ? "" : Date.now()}`.replace(/-$/, ""),
    sourceAutomationId: sourceAutomationId || undefined,
    sourceUrl: clean(record.sourceUrl ?? record.url) || undefined,
    name,
    status,
    account,
    handle,
    times,
    favorite,
    theme,
    importedAt: now,
    updatedAt: now,
    schema,
    raw: record,
  }
}

export function automationRecordToSummary(record: AutomationRecord): Automation {
  return {
    id: record.id,
    name: record.name,
    status: statusLabel(record.status),
    account: record.account,
    handle: record.handle,
    times: record.times,
    favorite: record.favorite,
    theme: record.theme,
  }
}

function readAutomationRecords(rootDir = defaultRootDir): Promise<AutomationRecord[]> {
  return readJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "automations",
    normalize: normalizeAutomationRecord,
  })
}

async function writeAutomationRecords(rootDir = defaultRootDir, records: AutomationRecord[]) {
  await writeJsonArrayStore({ rootDir, fileName: dbFileName, key: "automations", records })
}

function normalizeAutomationRecord(record: AutomationRecord): AutomationRecord | null {
  if (!record?.id || !record.name) {
    return null
  }
  const recordWithoutSource = { ...record } as AutomationRecord & { source?: unknown }
  delete recordWithoutSource.source
  const summary = automationSummary({
    id: record.id,
    name: record.name,
    status: statusLabel(normalizeStatus(record.status)),
    account: record.account,
    handle: record.handle,
    times: Array.isArray(record.times) ? record.times.map(clean).filter(Boolean) : [],
    favorite: Boolean(record.favorite),
    theme: clean(record.theme) || "ugc",
  })
  const schema = normalizeAutomationSchema(record.schema ?? defaultAutomationSchema(summary), summary)

  return {
    ...recordWithoutSource,
    status: normalizeStatus(record.status),
    account: clean(record.account) || "No TikTok account",
    handle: clean(record.handle),
    times: Array.isArray(record.times) ? record.times.map(clean).filter(Boolean) : [],
    favorite: Boolean(record.favorite),
    theme: clean(record.theme) || "ugc",
    updatedAt: clean(record.updatedAt) || new Date().toISOString(),
    schema,
  }
}

function mergeImportedSchema(base: AutomationSchema, settings: Record<string, unknown>, title: string, status: AutomationRecordStatus): AutomationSchema {
  const importedSchema = isRecord(settings.schema) ? settings.schema : settings
  const schedule = isRecord(importedSchema.schedule) ? importedSchema.schedule : {}
  const schema = normalizeAutomationSchema({
    ...base,
    ...importedSchema,
    title,
    status: status === "paused" ? "paused" : "live",
    schedule: {
      ...base.schedule,
      ...schedule,
      posting_times: Array.isArray(schedule.posting_times) ? schedule.posting_times as AutomationSchema["schedule"]["posting_times"] : base.schedule.posting_times,
    },
  } as AutomationSchema, {
    id: base.title,
    name: title,
    status: statusLabel(status),
    account: "",
    handle: "",
    times: [],
    favorite: false,
    theme: "",
  })

  return schema
}

function cloneLocalSchema(schema: AutomationSchema, automation: Automation, title: string, createdAt: string): AutomationSchema {
  const normalized = normalizeAutomationSchema(schema, automation)
  const parsedDate = new Date(schema.created_at as unknown as string | Date)

  return {
    ...normalized,
    title,
    created_at: Number.isFinite(parsedDate.getTime()) ? parsedDate : new Date(createdAt),
    status: normalized.status === "paused" ? "paused" : "live",
    ...cloneTemplate(normalized, createdAt),
    schedule: cloneSchedule(normalized.schedule),
  }
}

function cloneTemplate(template: AutomationTemplate, createdAt: string): AutomationTemplate {
  return {
    prompt_formatting: structuredClone(template.prompt_formatting),
    image_collection_ids: structuredClone(template.image_collection_ids ?? {}),
    formatting: structuredClone(template.formatting),
    tiktok_post_settings: structuredClone(template.tiktok_post_settings),
  }
}

function cloneSchedule(schedule: AutomationSchedule): AutomationSchedule {
  return {
    timezone: schedule.timezone,
    posting_times: schedule.posting_times.slice(0, 5).map((postingTime) => ({
      time: postingTime.time || "11:00 AM",
      days: [...postingTime.days],
    })),
  }
}

function automationSummary(input: Automation): Automation {
  return input
}

function normalizeStatus(value: unknown): AutomationRecordStatus {
  const normalized = clean(value).toLowerCase()
  if (normalized === "live" || normalized === "paused" || normalized === "draft") {
    return normalized
  }
  return normalized ? "unknown" : "live"
}

function statusLabel(status: AutomationRecordStatus) {
  switch (status) {
    case "live":
      return "Live"
    case "paused":
      return "Paused"
    case "draft":
      return "Draft"
    default:
      return "Unknown"
  }
}

function normalizeTimes(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean)
  }
  if (typeof value === "string") {
    return value.split(/[,\n]/).map(clean).filter(Boolean)
  }
  return []
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || randomUUID()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
