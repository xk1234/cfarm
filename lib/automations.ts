import { clean, isRecord } from "@/lib/guards"
import { randomUUID } from "node:crypto"
import path from "node:path"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import {
  defaultAutomationSchema,
  normalizeAutomationSchema,
  type AutomationSchema,
  type AutomationSchedule,
  type AutomationSocialIntegration,
  type AutomationStatus,
  type AutomationTemplate,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

export type AutomationRecordStatus = "live" | "paused" | "unknown"

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

export type AutomationKind = AutomationSchema["automationKind"]

const defaultRootDir = path.join(process.cwd(), "data", "automations")
const dbFileName = "automations.json"

export async function listAutomationRecords(
  options: { rootDir?: string } = {}
) {
  return await readAutomationRecords(options.rootDir)
}

export async function upsertAutomationRecords(input: {
  rootDir?: string
  records: AutomationRecord[]
}) {
  const current = await readAutomationRecords(input.rootDir)
  const next = [...current]

  for (const record of input.records) {
    const index = next.findIndex((item) =>
      record.sourceAutomationId
        ? item.sourceAutomationId === record.sourceAutomationId
        : item.id === record.id
    )
    if (index >= 0) {
      next[index] = {
        ...record,
        id: next[index].id,
        importedAt: next[index].importedAt ?? record.importedAt,
      }
    } else {
      next.unshift(record)
    }
  }

  await writeAutomationRecords(input.rootDir, next)
  return next
}

export function createLocalAutomationRecord(
  input: {
    name?: string
    automationKind?: AutomationKind
    schema?: AutomationSchema
    template?: AutomationTemplate
    overrides?: Partial<
      Pick<AutomationSchema, "status" | "social_integrations" | "schedule">
    >
  } = {}
): AutomationRecord {
  const now = new Date().toISOString()
  const id = `automation-local-${randomUUID()}`
  const name =
    clean(input.name) || clean(input.schema?.title) || "Untitled automation"
  const summary = automationSummary({
    id,
    name,
    status: "Live",
    account: "No social account",
    handle: "",
    times: [],
    favorite: false,
    theme: "ugc",
    automationKind:
      input.automationKind === "video" ? "video" : input.schema?.automationKind,
  })
  const defaults = defaultAutomationSchema(summary)
  const schema: AutomationSchema = input.schema
    ? cloneLocalSchema(input.schema, summary, name, now)
    : {
        ...defaults,
        created_at: new Date(now),
        title: name,
        status: input.overrides?.status ?? "live",
        social_integrations:
          input.overrides?.social_integrations ?? defaults.social_integrations,
        ...(input.template
          ? cloneTemplate(input.template)
          : cloneTemplate(defaults)),
        automationKind:
          input.automationKind === "video"
            ? "video"
            : input.template?.automationKind === "video"
              ? "video"
              : defaults.automationKind,
        schedule: cloneSchedule(input.overrides?.schedule ?? defaults.schedule),
      }
  const socialSummary = socialIntegrationSummary(schema.social_integrations)
  const scheduleTimes = automationScheduleTimes(schema)

  return {
    id,
    name,
    status: schema.status,
    account: socialSummary.account,
    handle: socialSummary.handle,
    times: scheduleTimes,
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
    const nextSchema = input.schema ?? record.schema
    const nextSocialSummary = socialIntegrationSummary(
      nextSchema.social_integrations
    )
    const nextTimes = automationScheduleTimes(nextSchema)
    updated = {
      ...record,
      name: clean(input.name) || record.name,
      status: input.status ?? nextSchema.status ?? record.status,
      favorite:
        typeof input.favorite === "boolean" ? input.favorite : record.favorite,
      account: nextSocialSummary.account,
      handle: nextSocialSummary.handle,
      times: nextTimes,
      schema: nextSchema,
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

  await writeAutomationRecords(
    input.rootDir,
    records.filter((record) => record.id !== input.id)
  )
  return deleted
}

export function normalizeReelfarmAutomation(raw: unknown): AutomationRecord {
  const record = isRecord(raw) ? raw : {}
  const now = new Date().toISOString()
  const sourceAutomationId = clean(
    record.id ?? record._id ?? record.uuid ?? record.automationId
  )
  const name = clean(record.name ?? record.title) || "Untitled automation"
  const status = normalizeStatus(record.status)
  const account =
    clean(record.account ?? record.tiktokAccount ?? record.pageName) ||
    "No social account"
  const handle = clean(record.handle ?? record.username ?? record.profile)
  const times = normalizeTimes(
    record.times ?? record.postingTimes ?? record.schedule
  )
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
    id: `automation-${slugify(sourceAutomationId || name)}-${sourceAutomationId ? "" : Date.now()}`.replace(
      /-$/,
      ""
    ),
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

export function automationRecordToSummary(
  record: AutomationRecord
): Automation {
  const socialSummary = socialIntegrationSummary(
    record.schema.social_integrations
  )
  const scheduleTimes = automationScheduleTimes(record.schema)
  return {
    id: record.id,
    name: record.name,
    status: statusLabel(record.status),
    account: socialSummary.account,
    handle: socialSummary.handle,
    times: scheduleTimes.length > 0 ? scheduleTimes : record.times,
    timezone: record.schema.schedule.timezone,
    favorite: record.favorite,
    theme: record.theme,
    automationKind: record.schema.automationKind,
    socialIntegrations: record.schema.social_integrations,
  }
}

function readAutomationRecords(
  rootDir = defaultRootDir
): Promise<AutomationRecord[]> {
  return readJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "automations",
    normalize: normalizeAutomationRecord,
  })
}

async function writeAutomationRecords(
  rootDir = defaultRootDir,
  records: AutomationRecord[]
) {
  await writeJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "automations",
    records,
  })
}

function normalizeAutomationRecord(
  record: AutomationRecord
): AutomationRecord | null {
  if (!record?.id || !record.name) {
    return null
  }
  const recordWithoutSource = { ...record } as AutomationRecord & {
    source?: unknown
  }
  delete recordWithoutSource.source
  const summary = automationSummary({
    id: record.id,
    name: record.name,
    status: statusLabel(normalizeStatus(record.status)),
    account: record.account,
    handle: record.handle,
    times: Array.isArray(record.times)
      ? record.times.map(clean).filter(Boolean)
      : [],
    favorite: Boolean(record.favorite),
    theme: clean(record.theme) || "ugc",
    automationKind:
      record.schema?.automationKind === "video" ? "video" : undefined,
  })
  const schema = normalizeAutomationSchema(
    record.schema ?? defaultAutomationSchema(summary),
    summary
  )

  return {
    ...recordWithoutSource,
    status: normalizeStatus(record.status),
    account: clean(record.account) || "No social account",
    handle: clean(record.handle),
    times: Array.isArray(record.times)
      ? record.times.map(clean).filter(Boolean)
      : [],
    favorite: Boolean(record.favorite),
    theme: clean(record.theme) || "ugc",
    updatedAt: clean(record.updatedAt) || new Date().toISOString(),
    schema,
  }
}

function socialIntegrationSummary(integrations: AutomationSocialIntegration[]) {
  const activeIntegrations = integrations.filter(
    (integration) => !integration.disabled
  )
  const first = activeIntegrations[0]

  if (!first) {
    return { account: "No social account", handle: "Click to add account" }
  }

  const extraCount = activeIntegrations.length - 1
  const provider = socialProviderLabel(first.provider)
  const account = extraCount > 0 ? `${first.name} +${extraCount}` : first.name
  const profile = first.profile
    ? `@${first.profile.replace(/^@/, "")}`
    : provider

  return { account, handle: `${provider} · ${profile}` }
}

function socialProviderLabel(
  provider: AutomationSocialIntegration["provider"]
) {
  switch (provider) {
    case "youtube":
      return "YouTube"
    case "instagram":
      return "Instagram"
    case "tiktok":
      return "TikTok"
    case "tiktok-creative":
      return "TikTok Creative"
    case "tiktok-seller":
      return "TikTok Seller"
    case "facebook":
      return "Facebook"
    case "x":
      return "X"
    case "twitter":
      return "Twitter"
    case "linkedin":
      return "LinkedIn"
    case "threads":
      return "Threads"
    case "pinterest":
      return "Pinterest"
    case "bluesky":
      return "Bluesky"
    case "telegram":
      return "Telegram"
    case "google":
      return "Google"
    case "google-business-profile":
      return "Google Business Profile"
  }
}

function mergeImportedSchema(
  base: AutomationSchema,
  settings: Record<string, unknown>,
  title: string,
  status: AutomationRecordStatus
): AutomationSchema {
  const importedSchema = isRecord(settings.schema) ? settings.schema : settings
  const schedule = isRecord(importedSchema.schedule)
    ? importedSchema.schedule
    : {}
  const schema = normalizeAutomationSchema(
    {
      ...base,
      ...importedSchema,
      title,
      status: status === "paused" ? "paused" : "live",
      schedule: {
        ...base.schedule,
        ...schedule,
        posting_times: Array.isArray(schedule.posting_times)
          ? (schedule.posting_times as AutomationSchema["schedule"]["posting_times"])
          : base.schedule.posting_times,
      },
    } as AutomationSchema,
    {
      id: base.title,
      name: title,
      status: statusLabel(status),
      account: "",
      handle: "",
      times: [],
      favorite: false,
      theme: "",
      socialIntegrations: [],
    }
  )

  return schema
}

function cloneLocalSchema(
  schema: AutomationSchema,
  automation: Automation,
  title: string,
  createdAt: string
): AutomationSchema {
  const normalized = normalizeAutomationSchema(schema, automation)
  const parsedDate = new Date(schema.created_at as unknown as string | Date)

  return {
    ...normalized,
    title,
    created_at: Number.isFinite(parsedDate.getTime())
      ? parsedDate
      : new Date(createdAt),
    status: normalized.status === "paused" ? "paused" : "live",
    ...cloneTemplate(normalized),
    schedule: cloneSchedule(normalized.schedule),
  }
}

function cloneTemplate(template: AutomationTemplate): AutomationTemplate {
  return {
    automationKind: template.automationKind === "video" ? "video" : "slideshow",
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
      enabled: postingTime.enabled === false ? false : undefined,
    })),
    paused: schedule.paused,
    jitter_minutes: schedule.jitter_minutes,
    min_gap_minutes: schedule.min_gap_minutes,
    interval: schedule.interval
      ? {
          ...schedule.interval,
          days: [...schedule.interval.days],
        }
      : undefined,
  }
}

function automationScheduleTimes(schema: AutomationSchema) {
  return schema.schedule.posting_times
    .map((postingTime) => clean(postingTime.time))
    .filter(Boolean)
}

function automationSummary(
  input: Omit<Automation, "socialIntegrations"> &
    Partial<Pick<Automation, "socialIntegrations">>
): Automation {
  return {
    ...input,
    socialIntegrations: input.socialIntegrations ?? [],
  }
}

function normalizeStatus(value: unknown): AutomationRecordStatus {
  const normalized = clean(value).toLowerCase()
  if (normalized === "live" || normalized === "paused") {
    return normalized
  }
  if (normalized === "draft") {
    return "paused"
  }
  return normalized ? "unknown" : "live"
}

function statusLabel(status: AutomationRecordStatus) {
  switch (status) {
    case "live":
      return "Live"
    case "paused":
      return "Paused"
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
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || randomUUID()
  )
}
