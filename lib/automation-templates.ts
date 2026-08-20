import { clean } from "@/lib/guards"
import path from "node:path"

import {
  readJsonArrayStore,
  upsertJsonArrayRecord,
  writeJsonArrayStore,
} from "@/lib/json-store"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/features/collections/domain/collections"
import {
  automationCollectionIds,
  defaultAutomationSchema,
  normalizeAutomationSchema,
  type AutomationSchema,
  type RuntimeAutomationTemplate,
} from "@/lib/realfarm-automation"
import {
  automationRecordToSummary,
  listAutomationRecords,
  normalizeReelfarmAutomation,
  upsertAutomationRecords,
  type AutomationRecord,
} from "@/lib/automations"
import type { Automation } from "@/lib/realfarm-data"

type LegacyStoredAutomationTemplate = {
  id: string
  automationKind?: "slideshow" | "video" | "ugc"
  sourceAutomationId?: string
  sourceUrl?: string
  name: string
  theme: string
  createdAt: string
  updatedAt: string
  schema: Omit<
    AutomationSchema,
    "created_at" | "title" | "status" | "schedule" | "social_integrations"
  > & {
    created_at: string
  }
}

export type StoredAutomationTemplate = AutomationRecord
export type StoredAutomationTemplateSchema = AutomationRecord["schema"]
export type AutomationTemplateRecord = AutomationRecord

export type AutomationTemplateExampleRun = {
  id: string
  automationId: string
  templateId: string
  sourceTemplateId?: string
  sourceVideoId?: string
  createdAt: string
  plan?: {
    slides?: {
      id?: string
      imageUrl?: string
      text?: string
      imageCaption?: string
      aspectRatio?: string
    }[]
  }
}

export type AutomationTemplateCollectionValidationIssue = {
  templateId: string
  templateName: string
  missingCollectionIds: string[]
}

const defaultRootDir = path.join(process.cwd(), "data", "starter-templates")
const dbFileName = "templates.json"
const exampleRunsFileName = "example-runs.json"

export async function listAutomationTemplateRecords(
  options: { rootDir?: string } = {}
) {
  const rootDir = options.rootDir ?? defaultRootDir
  return readJsonArrayStore<AutomationTemplateRecord>({
    rootDir,
    fileName: dbFileName,
    key: "templates",
    normalize: normalizeAutomationTemplateRecord,
  })
}

export async function listAutomationTemplateExampleRuns(
  options: { rootDir?: string } = {}
) {
  const rootDir = options.rootDir ?? defaultRootDir
  return readJsonArrayStore({
    rootDir,
    fileName: exampleRunsFileName,
    key: "runs",
    normalize: normalizeAutomationTemplateExampleRun,
  })
}

export function groupAutomationTemplateExampleRunsByTemplateId(
  runs: AutomationTemplateExampleRun[]
) {
  const groups = runs.reduce<Record<string, AutomationTemplateExampleRun[]>>(
    (groups, run) => {
      groups[run.templateId] = [...(groups[run.templateId] ?? []), run]
      return groups
    },
    {}
  )

  return Object.fromEntries(
    Object.entries(groups).map(([templateId, templateRuns]) => [
      templateId,
      templateRuns
        .toSorted(
          (first, second) =>
            new Date(second.createdAt).getTime() -
            new Date(first.createdAt).getTime()
        )
        .slice(0, 3),
    ])
  )
}

export async function writeAutomationTemplateRecords(input: {
  rootDir?: string
  records: AutomationTemplateRecord[]
}) {
  await writeJsonArrayStore({
    rootDir: input.rootDir ?? defaultRootDir,
    fileName: dbFileName,
    key: "templates",
    records: input.records.map(automationTemplateRecordForStorage),
  })
}

export async function upsertAutomationTemplateRecords(input: {
  rootDir?: string
  records: AutomationTemplateRecord[]
}) {
  const current = await listAutomationTemplateRecords({
    rootDir: input.rootDir,
  })
  const next = [...current]
  const changed: AutomationTemplateRecord[] = []

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
        createdAt: next[index].createdAt || record.createdAt,
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
      upsertJsonArrayRecord({
        rootDir: input.rootDir ?? defaultRootDir,
        fileName: dbFileName,
        key: "templates",
        record: automationTemplateRecordForStorage(record),
        position: "first",
      })
    )
  )
  return next
}

function automationTemplateRecordForStorage(
  record: AutomationTemplateRecord
): StoredAutomationTemplate {
  return record
}

export function automationTemplateRecordToSummary(
  record: AutomationTemplateRecord
) {
  return automationRecordToSummary(record)
}

export function automationTemplateSchemaToRuntime(
  record: AutomationTemplateRecord
): AutomationSchema {
  const summary = automationTemplateRecordToSummary(record)
  return normalizeAutomationSchema(structuredClone(record.schema), summary)
}

export async function listUnifiedTemplateRecords() {
  const [records, starterTemplates] = await Promise.all([
    listAutomationRecords(),
    listAutomationTemplateRecords(),
  ])
  const missingStarters = missingStarterTemplateRecords(
    records,
    starterTemplates
  )
  if (missingStarters.length === 0) return records

  return upsertAutomationRecords({ records: missingStarters })
}

export function missingStarterTemplateRecords(
  records: AutomationRecord[],
  starterTemplates: AutomationTemplateRecord[]
) {
  const existingIds = new Set(records.map((record) => record.id))
  const existingSourceIds = new Set(
    records.flatMap((record) =>
      record.sourceAutomationId ? [record.sourceAutomationId] : []
    )
  )
  return starterTemplates
    .filter(
      (record) =>
        !existingIds.has(record.id) &&
        (!record.sourceAutomationId ||
          !existingSourceIds.has(record.sourceAutomationId))
    )
    .map((record) => ({
      ...record,
      hidden: true,
      status: "paused" as const,
      favorite: false,
    }))
}

export function validateAutomationTemplateCollectionIds(input: {
  records: AutomationTemplateRecord[]
  collections: CreatedImageCollection[]
}): AutomationTemplateCollectionValidationIssue[] {
  return input.records.flatMap((record) => {
    const missingCollectionIds = templateCollectionIds(record).filter(
      (collectionId) =>
        !findCollectionByIdOrAlias(input.collections, collectionId)
    )

    return missingCollectionIds.length > 0
      ? [
          {
            templateId: record.id,
            templateName: record.name,
            missingCollectionIds,
          },
        ]
      : []
  })
}

export function automationTemplateRecordToRuntimeTemplate(
  record: AutomationTemplateRecord
): RuntimeAutomationTemplate {
  const schema = automationTemplateSchemaToRuntime(record)
  return {
    automationKind: schema.automationKind,
    aspect_ratio: schema.aspect_ratio,
    font: schema.font,
    image_fit: schema.image_fit,
    language: schema.language,
    prompt_formatting: schema.prompt_formatting,
    hooks: schema.hooks,
    image_collection_ids: schema.image_collection_ids,
    tone: schema.tone,
    formatting: schema.formatting,
    slide_designs: schema.slide_designs,
    tiktok_post_settings: schema.tiktok_post_settings,
    web_search_enabled: schema.web_search_enabled,
    video_format: schema.video_format,
  }
}

export function automationSchemaToTemplateRecord(input: {
  id: string
  name: string
  sourceAutomationId?: string
  sourceUrl?: string
  theme: string
  createdAt: string
  updatedAt: string
  schema: AutomationSchema
  hooks?: string[]
}): StoredAutomationTemplate {
  const summary: Automation = {
    id: input.id,
    automationKind: input.schema.automationKind,
    name: input.name,
    hidden: true,
    status: "paused" as const,
    account: "",
    handle: "",
    times: [],
    favorite: false,
    theme: input.theme,
    socialIntegrations: [],
  }
  const normalized = normalizeAutomationSchema(
    {
      ...input.schema,
      hooks: (input.hooks ?? input.schema.hooks) as AutomationSchema["hooks"],
    },
    summary
  )
  const schema = storedAutomationTemplateSchema(normalized)
  return {
    id: input.id,
    sourceAutomationId: input.sourceAutomationId,
    sourceUrl: input.sourceUrl,
    name: input.name,
    hidden: true,
    status: "paused",
    favorite: false,
    theme: input.theme,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    schema,
  }
}

export function reelfarmAutomationToTemplateRecord(raw: unknown) {
  const automation = normalizeReelfarmAutomation(raw)
  const sourceAutomationId = automation.sourceAutomationId ?? automation.id
  return automationSchemaToTemplateRecord({
    id: `template-reelfarm-${slugify(sourceAutomationId)}`,
    sourceAutomationId,
    sourceUrl: automation.sourceUrl,
    name: sourceTemplateName(automation.name, automation.raw),
    theme: automation.theme,
    createdAt: automation.importedAt ?? automation.updatedAt,
    updatedAt: automation.updatedAt,
    schema: automation.schema,
    hooks: sourceTemplateHooks(automation.raw),
  })
}

function normalizeAutomationTemplateRecord(
  record: AutomationTemplateRecord
): AutomationTemplateRecord | null {
  if (!record?.id || !record.name || !record.schema) {
    return null
  }

  const legacy = record as AutomationTemplateRecord &
    Partial<LegacyStoredAutomationTemplate>
  const createdAt =
    clean(legacy.createdAt) ||
    clean(record.schema.created_at) ||
    new Date().toISOString()
  const summary: Automation = {
    id: clean(record.id),
    automationKind: automationTemplateKind(record),
    name: clean(record.name),
    hidden: typeof record.hidden === "boolean" ? record.hidden : true,
    status: record.status === "live" ? ("live" as const) : ("paused" as const),
    account: "",
    handle: "",
    times: [],
    favorite: Boolean(record.favorite),
    theme: clean(record.theme) || "template",
    socialIntegrations: [],
  }
  const base = defaultAutomationSchema(summary)
  const schema = normalizeAutomationSchema(
    {
      ...base,
      ...structuredClone(record.schema),
      created_at: new Date(createdAt),
      social_integrations: record.schema.social_integrations ?? [],
      schedule: record.schema.schedule ?? base.schedule,
    },
    summary
  )
  return {
    id: clean(record.id),
    sourceAutomationId: clean(record.sourceAutomationId) || undefined,
    sourceUrl: clean(record.sourceUrl) || undefined,
    name: clean(record.name),
    hidden: typeof record.hidden === "boolean" ? record.hidden : true,
    status: record.status === "live" ? "live" : "paused",
    favorite: Boolean(record.favorite),
    theme: clean(record.theme) || "template",
    createdAt,
    importedAt: clean(record.importedAt) || createdAt,
    updatedAt: clean(record.updatedAt) || new Date().toISOString(),
    schema,
  }
}

function storedAutomationTemplateSchema(
  schema: AutomationSchema
): StoredAutomationTemplateSchema {
  return structuredClone(schema)
}

function normalizeAutomationTemplateExampleRun(
  record: AutomationTemplateExampleRun
): AutomationTemplateExampleRun | null {
  const id = clean(record?.id)
  const templateId = clean(record?.templateId) || clean(record?.automationId)
  if (!id || !templateId) {
    return null
  }

  const slides = Array.isArray(record.plan?.slides)
    ? record.plan.slides
        .map((slide, index) => ({
          id: clean(slide.id) || String(index),
          imageUrl: clean(slide.imageUrl),
          text: clean(slide.text),
          imageCaption: clean(slide.imageCaption),
          aspectRatio: clean(slide.aspectRatio) || undefined,
        }))
        .filter((slide) => slide.imageUrl)
    : []

  return {
    id,
    automationId: clean(record.automationId) || templateId,
    templateId,
    sourceTemplateId: clean(record.sourceTemplateId) || undefined,
    sourceVideoId: clean(record.sourceVideoId) || undefined,
    createdAt: clean(record.createdAt) || new Date().toISOString(),
    plan: { slides },
  }
}

function automationTemplateKind(
  record: AutomationTemplateRecord | LegacyStoredAutomationTemplate | undefined
) {
  const kind =
    record && "automationKind" in record
      ? record.automationKind
      : record?.schema?.automationKind
  return kind === "video" || kind === "ugc" ? kind : "slideshow"
}

function templateCollectionIds(record: AutomationTemplateRecord) {
  return automationCollectionIds(automationTemplateSchemaToRuntime(record))
}

function sourceTemplateName(
  name: string,
  raw: Record<string, unknown> | undefined
) {
  const reelfarmTitle =
    typeof raw?.reelfarmTitle === "string" ? raw.reelfarmTitle.trim() : ""
  const title = typeof raw?.title === "string" ? raw.title.trim() : ""
  return (
    reelfarmTitle ||
    title ||
    name.replace(/\s*\(template\s+\d+\)\s*$/i, "").trim()
  )
}

function sourceTemplateHooks(raw: Record<string, unknown> | undefined) {
  const hooks =
    raw?.reelfarmSlideshowHooks ?? raw?.slideshow_hooks ?? raw?.hooks
  const values = Array.isArray(hooks)
    ? hooks
    : typeof hooks === "string"
      ? [hooks]
      : []
  const seen = new Set<string>()

  return values.flatMap(splitHookText).filter((hook) => {
    const normalized = hook.toLowerCase()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function splitHookText(value: unknown) {
  return typeof value === "string"
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/^\d+[.)]\s*/, ""))
        .filter(Boolean)
    : []
}
