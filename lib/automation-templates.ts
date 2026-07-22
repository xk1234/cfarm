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
} from "@/lib/realfarm-collections"
import {
  automationCollectionIds,
  defaultAutomationSchema,
  normalizeAutomationSchema,
  type AutomationSchema,
  type RuntimeAutomationTemplate,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
export type StoredAutomationTemplate = {
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

export type StoredAutomationTemplateSchema = StoredAutomationTemplate["schema"]
export type AutomationTemplateRecord = StoredAutomationTemplate

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

const defaultRootDir = path.join(process.cwd(), "data", "automation-templates")
const dbFileName = "templates.json"
const exampleRunsFileName = "example-runs.json"

export async function listAutomationTemplateRecords(
  options: { rootDir?: string } = {}
) {
  const rootDir = options.rootDir ?? defaultRootDir
  return readJsonArrayStore({
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
      templateRuns.slice(0, 3),
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
): Automation {
  return {
    id: record.id,
    automationKind: automationTemplateKind(record),
    name: record.name,
    // Templates are not lifecycle automations; the view type requires a status.
    status: "live",
    account: "",
    handle: "",
    times: [],
    favorite: false,
    theme: record.theme,
    created_at: record.schema.created_at,
    socialIntegrations: [],
  }
}

export function automationTemplateSchemaToRuntime(
  record: AutomationTemplateRecord
): AutomationSchema {
  const summary = automationTemplateRecordToSummary(record)
  const base = defaultAutomationSchema(summary)
  return normalizeAutomationSchema(
    {
      ...base,
      ...structuredClone(record.schema),
      created_at: new Date(record.schema.created_at),
      social_integrations: [],
      schedule: base.schedule,
    },
    summary
  )

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
    status: "live",
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
    automationKind: input.schema.automationKind,
    sourceAutomationId: input.sourceAutomationId,
    sourceUrl: input.sourceUrl,
    name: input.name,
    theme: input.theme,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    schema,
  }
}

function normalizeAutomationTemplateRecord(
  record: AutomationTemplateRecord
): AutomationTemplateRecord | null {
  if (
    !record?.id ||
    !record.name ||
    !record.schema
  ) {
    return null
  }

  const schema = automationTemplateSchemaToRuntime(record)
  return {
    id: clean(record.id),
    automationKind: automationTemplateKind(record),
    sourceAutomationId: clean(record.sourceAutomationId) || undefined,
    sourceUrl: clean(record.sourceUrl) || undefined,
    name: clean(record.name),
    theme: clean(record.theme) || "template",
    createdAt: clean(record.createdAt) || record.schema.created_at,
    updatedAt: clean(record.updatedAt) || new Date().toISOString(),
    schema: storedAutomationTemplateSchema(schema),
  }
}

function storedAutomationTemplateSchema(
  schema: AutomationSchema
): StoredAutomationTemplateSchema {
  const stored = structuredClone(schema) as unknown as Record<string, unknown>
  stored.created_at = new Date(schema.created_at).toISOString()
  delete stored.title
  delete stored.status
  delete stored.schedule
  delete stored.social_integrations
  return stored as StoredAutomationTemplateSchema
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
  record: Pick<AutomationTemplateRecord, "automationKind"> | undefined
) {
  return record?.automationKind === "video" ? "video" : "slideshow"
}

function templateCollectionIds(record: AutomationTemplateRecord) {
  return automationCollectionIds(automationTemplateSchemaToRuntime(record))
}
