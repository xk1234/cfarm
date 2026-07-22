import { clean, isRecord } from "@/lib/guards"
import { randomUUID } from "node:crypto"
import path from "node:path"

import {
  deleteJsonArrayRecord,
  readJsonArrayRecord,
  readJsonArrayStore,
  upsertJsonArrayRecord,
} from "@/lib/json-store"
import {
  automationHookItems,
  defaultAutomationSchema,
  normalizeAutomationSchema,
  type AutomationLifecycleStatus,
  type AutomationSchema,
  type AutomationSchedule,
  type AutomationSocialIntegration,
  type AutomationStatus,
  type RuntimeAutomationTemplate,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

// Alias of the canonical lifecycle status (defined in realfarm-automation),
// kept for existing import sites.
export type AutomationRecordStatus = AutomationLifecycleStatus

export type AutomationRecord = {
  ownerId?: string
  id: string
  sourceAutomationId?: string
  sourceUrl?: string
  name: string
  status: AutomationRecordStatus
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
  const changed: AutomationRecord[] = []

  for (const record of input.records) {
    const index = next.findIndex((item) =>
      record.sourceAutomationId
        ? item.sourceAutomationId === record.sourceAutomationId
        : item.id === record.id
    )
    if (index >= 0) {
      const updated = {
        ...record,
        id: next[index].id,
        importedAt: next[index].importedAt ?? record.importedAt,
      }
      next[index] = updated
      changed.push(updated)
    } else {
      next.unshift(record)
      changed.push(record)
    }
  }

  await Promise.all(
    changed.map((record) =>
      upsertAutomationRecord(input.rootDir, record, "first")
    )
  )
  return next
}

export function createLocalAutomationRecord(
  input: {
    name?: string
    automationKind?: AutomationKind
    schema?: AutomationSchema
    template?: RuntimeAutomationTemplate
    overrides?: Partial<
      Pick<AutomationSchema, "social_integrations" | "schedule"> & {
        status: AutomationStatus
      }
    >
  } = {}
): AutomationRecord {
  const now = new Date().toISOString()
  const id = `automation-local-${randomUUID()}`
  const name =
    clean(input.name) || "Untitled automation"
  const summary = automationSummary({
    id,
    name,
    status: "live",
    account: "No social account",
    handle: "",
    times: [],
    favorite: false,
    theme: "ugc",
    automationKind:
      input.automationKind === "video" || input.automationKind === "ugc"
        ? input.automationKind
        : input.schema?.automationKind,
  })
  const defaults = defaultAutomationSchema(summary)
  const schema: AutomationSchema = input.schema
    ? cloneLocalSchema(input.schema, summary, name, now)
    : {
        ...defaults,
        created_at: new Date(now),
        social_integrations:
          input.overrides?.social_integrations ?? defaults.social_integrations,
        ...(input.template
          ? cloneTemplate(input.template)
          : cloneTemplate(defaults)),
        automationKind:
          input.automationKind === "video" || input.automationKind === "ugc"
            ? input.automationKind
            : input.template?.automationKind === "video" ||
                input.template?.automationKind === "ugc"
              ? input.template.automationKind
              : defaults.automationKind,
        schedule: cloneSchedule(input.overrides?.schedule ?? defaults.schedule),
      }
  return {
    id,
    name,
    status: input.overrides?.status ?? "live",
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
  const updatedAt = new Date().toISOString()
  const record = await getAutomationRecord(input.id, input.rootDir)
  if (!record) return null
  const nextSchema = input.schema ?? record.schema
  const nextName = clean(input.name) || record.name
  const nextStatus = input.status ?? record.status
  const canonicalSchema = normalizeAutomationSchema(nextSchema, {
    ...automationRecordToSummary(record),
    name: nextName,
    status: nextStatus,
  })
  const updated: AutomationRecord = {
    ...record,
    name: nextName,
    status: nextStatus,
    favorite:
      typeof input.favorite === "boolean" ? input.favorite : record.favorite,
    schema: canonicalSchema,
    updatedAt,
  }
  await upsertAutomationRecord(input.rootDir, updated)
  return updated
}

export async function deleteAutomationRecord(input: {
  rootDir?: string
  id: string
}) {
  const deleted = await getAutomationRecord(input.id, input.rootDir)
  if (!deleted) {
    return null
  }

  await deleteJsonArrayRecord({
    ...automationStore(input.rootDir),
    id: input.id,
  })
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
    status: record.status,
    account: socialSummary.account,
    handle: socialSummary.handle,
    times: scheduleTimes,
    timezone: record.schema.schedule.timezone,
    schedule: record.schema.schedule,
    favorite: record.favorite,
    theme: record.theme,
    automationKind: record.schema.automationKind,
    postingMode: record.schema.posting_mode,
    generationLeadMinutes: record.schema.generation_lead_minutes,
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

export function getAutomationRecord(id: string, rootDir?: string) {
  return readJsonArrayRecord({
    ...automationStore(rootDir),
    id,
    normalize: normalizeAutomationRecord,
  })
}

function automationStore(rootDir = defaultRootDir) {
  return {
    rootDir,
    fileName: dbFileName,
    key: "automations",
  }
}

async function upsertAutomationRecord(
  rootDir: string | undefined,
  record: AutomationRecord,
  position?: "first" | "last"
) {
  await upsertJsonArrayRecord({
    ...automationStore(rootDir),
    record: automationRecordForStorage(record),
    position,
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
    status: normalizeStatus(record.status),
    account: socialIntegrationSummary(record.schema?.social_integrations ?? []).account,
    handle: socialIntegrationSummary(record.schema?.social_integrations ?? []).handle,
    times: record.schema ? automationScheduleTimes(record.schema) : [],
    favorite: Boolean(record.favorite),
    theme: clean(record.theme) || "ugc",
    automationKind:
      record.schema?.automationKind === "video" ? "video" : undefined,
  })
  const normalizedStatus = normalizeStatus(record.status)
  const schema = normalizeAutomationSchema(
    record.schema ?? defaultAutomationSchema(summary),
    summary
  )
  return {
    ...recordWithoutSource,
    status: normalizedStatus,
    favorite: Boolean(record.favorite),
    theme: clean(record.theme) || "ugc",
    updatedAt: clean(record.updatedAt) || new Date().toISOString(),
    schema,
  }
}

function automationRecordForStorage(record: AutomationRecord) {
  const normalized = normalizeAutomationRecord(record)
  if (!normalized) return record
  const stored = { ...normalized } as Partial<AutomationRecord>
  const { schema: runtimeSchema } = normalized
  const schema: Record<string, unknown> = { ...runtimeSchema }
  return { ...stored, schema }
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
  const legacyTone = Array.isArray(importedSchema.formatting)
    ? importedSchema.formatting.find(
        (item) => isRecord(item) && item.id === "_tone"
      )
    : undefined
  const schema = normalizeAutomationSchema(
    {
      ...base,
      ...importedSchema,
      tone: isRecord(importedSchema.tone)
        ? importedSchema.tone
        : isRecord(legacyTone)
          ? legacyTone
          : base.tone,
      ...(!Array.isArray(importedSchema.hooks) ? { hooks: undefined } : {}),
      schedule: {
        ...base.schedule,
        ...schedule,
        posting_times: Array.isArray(schedule.posting_times)
          ? (schedule.posting_times as AutomationSchema["schedule"]["posting_times"])
          : base.schedule.posting_times,
      },
    } as AutomationSchema,
    {
      id: title,
      name: title,
      status,
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
    created_at: Number.isFinite(parsedDate.getTime())
      ? parsedDate
      : new Date(createdAt),
    ...cloneTemplate(normalized),
    schedule: cloneSchedule(normalized.schedule),
  }
}

function cloneTemplate(
  template: RuntimeAutomationTemplate
): RuntimeAutomationTemplate {
  return {
    automationKind:
      template.automationKind === "video" || template.automationKind === "ugc"
        ? template.automationKind
        : "slideshow",
    aspect_ratio: template.aspect_ratio,
    font: template.font,
    image_fit: template.image_fit,
    language: template.language,
    prompt_formatting: structuredClone(template.prompt_formatting),
    hooks: structuredClone(
      template.hooks ??
        automationHookItems({
          formatting: template.formatting,
          prompt_formatting: template.prompt_formatting,
        })
    ),
    image_collection_ids: structuredClone(template.image_collection_ids ?? {}),
    tone: structuredClone(template.tone),
    formatting: structuredClone(template.formatting),
    tiktok_post_settings: structuredClone(template.tiktok_post_settings),
    web_search_enabled: Boolean(template.web_search_enabled),
    video_format: template.video_format
      ? structuredClone(template.video_format)
      : undefined,
    ugc: template.ugc ? structuredClone(template.ugc) : undefined,
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
