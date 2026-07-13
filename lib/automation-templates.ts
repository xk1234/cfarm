import { clean, isRecord } from "@/lib/guards"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import { defaultAutomationTemplateDefaults } from "@/lib/automation-template-defaults"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import {
  automationFormatSection,
  automationTone,
  defaultAutomationSchema,
  normalizeAutomationSchema,
  type AutomationAspectRatio,
  type AutomationImageGrid,
  type AutomationImageMode,
  type AutomationSchema,
  type AutomationTextItem,
  type RuntimeAutomationTemplate,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import { defaultAutomationPublishType } from "@/lib/slideshow-publishing-config"

export type AutomationTemplateTone =
  | "Conversational & Relatable"
  | "Motivational & Empowering"
  | "Educational & Informative"
  | "Bold & Provocative"
  | "Calm & Reflective"
  | "Witty & Humorous"
  | "Witty & Relatable"
  | "Practical & Aspirational"
  | "Authoritative & Reassuring"
  | "Custom"

export type AutomationTemplateTextItem = {
  id: string
  font: string
  font_size: string
  text_style: string
  text_position: string
  text_item_width: string
  word_length_min: number
  word_length_max: number
  content_direction: string
  text_mode: "prompt" | "static"
  static_text: string
  text_align: string
  text_anchor: string
}

export type AutomationTemplateFormat = {
  hook: {
    aspect_ratio: AutomationAspectRatio
    image_grid: AutomationImageGrid
    overlay: boolean
    display_text: boolean
    text_items: AutomationTemplateTextItem[]
  }
  content: {
    aspect_ratio: AutomationAspectRatio
    image_grid: AutomationImageGrid
    slide_count_mode: "static" | "varying"
    slide_count?: number
    slide_count_min?: number
    slide_count_max?: number
    overlay: boolean
    overlay_image?: {
      enabled: boolean
      collection_id?: string
      height: number
    }
    display_text: boolean
    text_items: AutomationTemplateTextItem[]
  }
  cta: {
    enabled: boolean
    image_mode: AutomationImageMode
    aspect_ratio: AutomationAspectRatio
    image_grid: AutomationImageGrid
    overlay: boolean
    display_text: boolean
    text_items: AutomationTemplateTextItem[]
  }
  tone?: AutomationTemplateTone
  custom_tone: string
}

export type AutomationTemplateDefinition = {
  created_at: string
  image_collection_ids: string
  format: AutomationTemplateFormat
  hooks: string[]
}

export type AutomationTemplateRecord = {
  id: string
  automationKind?: "slideshow" | "video"
  sourceAutomationId?: string
  sourceUrl?: string
  name: string
  theme: string
  createdAt: string
  updatedAt: string
  template: AutomationTemplateDefinition
}

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
const allDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const

export async function listAutomationTemplateRecords(
  options: { rootDir?: string } = {}
) {
  const rootDir = options.rootDir ?? defaultRootDir
  const records = await readJsonArrayStore({
    rootDir,
    fileName: dbFileName,
    key: "templates",
    normalize: normalizeAutomationTemplateRecord,
  })

  if (path.resolve(rootDir) !== path.resolve(defaultRootDir)) {
    return records
  }

  const seedRecords = await readAutomationTemplateSeedRecords(rootDir)
  return appendMissingAutomationTemplateSeeds(records, seedRecords)
}

export async function listAutomationTemplateExampleRuns(
  options: { rootDir?: string } = {}
) {
  const rootDir = options.rootDir ?? defaultRootDir
  const records = await readJsonArrayStore({
    rootDir,
    fileName: exampleRunsFileName,
    key: "runs",
    normalize: normalizeAutomationTemplateExampleRun,
  })

  if (path.resolve(rootDir) !== path.resolve(defaultRootDir)) {
    return records
  }

  const seedRecords = await readAutomationTemplateExampleRunSeeds(rootDir)
  return appendMissingAutomationTemplateExampleRunSeeds(records, seedRecords)
}

async function readAutomationTemplateExampleRunSeeds(rootDir: string) {
  try {
    const contents = await readFile(
      path.join(rootDir, exampleRunsFileName),
      "utf8"
    )
    const parsed = JSON.parse(contents) as Record<string, unknown>
    const runs = parsed.runs
    if (!Array.isArray(runs)) return []
    return runs.flatMap((run) => {
      const normalized = normalizeAutomationTemplateExampleRun(
        run as AutomationTemplateExampleRun
      )
      return normalized ? [normalized] : []
    })
  } catch {
    return []
  }
}

function appendMissingAutomationTemplateExampleRunSeeds(
  records: AutomationTemplateExampleRun[],
  seedRecords: AutomationTemplateExampleRun[]
) {
  const ids = new Set(records.map((record) => record.id))
  return [
    ...records,
    ...seedRecords.filter((record) => {
      if (ids.has(record.id)) return false
      ids.add(record.id)
      return true
    }),
  ]
}

async function readAutomationTemplateSeedRecords(rootDir: string) {
  try {
    const contents = await readFile(path.join(rootDir, dbFileName), "utf8")
    const parsed = JSON.parse(contents) as Record<string, unknown>
    const templates = parsed.templates
    if (!Array.isArray(templates)) {
      return []
    }
    return templates.flatMap((record) => {
      const normalized = normalizeAutomationTemplateRecord(
        record as AutomationTemplateRecord
      )
      return normalized ? [normalized] : []
    })
  } catch {
    return []
  }
}

function appendMissingAutomationTemplateSeeds(
  records: AutomationTemplateRecord[],
  seedRecords: AutomationTemplateRecord[]
) {
  const keys = new Set(records.map(automationTemplateIdentityKey))
  const missingSeeds = seedRecords.filter((record) => {
    const key = automationTemplateIdentityKey(record)
    if (keys.has(key)) {
      return false
    }
    keys.add(key)
    return true
  })

  return [...records, ...missingSeeds]
}

function automationTemplateIdentityKey(record: AutomationTemplateRecord) {
  return record.sourceAutomationId
    ? `source:${record.sourceAutomationId}`
    : `id:${record.id}`
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
    records: input.records,
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
        createdAt: next[index].createdAt || record.createdAt,
      }
    } else {
      next.unshift(record)
    }
  }

  await writeAutomationTemplateRecords({
    rootDir: input.rootDir,
    records: next,
  })
  return next
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
    created_at: record.template.created_at,
    socialIntegrations: [],
  }
}

export function automationTemplateRecordToSchema(
  record: AutomationTemplateRecord
): AutomationSchema {
  const summary = automationTemplateRecordToSummary(record)
  const base = defaultAutomationSchema(summary)
  const schema = normalizeAutomationSchema(
    {
      ...base,
      created_at: new Date(record.template.created_at),
      title: record.name,
      status: "live",
      social_integrations: [],
      prompt_formatting: {
        style: record.template.format.custom_tone,
        narrative: record.template.hooks.join("\n"),
        num_of_slides: templateSlideCount(record.template.format),
      },
      image_collection_ids: parseImageCollectionIds(
        record.template.image_collection_ids,
        base.image_collection_ids
      ),
      formatting: templateFormatToRuntime(record.template.format),
      tiktok_post_settings: {
        ...base.tiktok_post_settings,
        publish_type:
          summary.automationKind === "video"
            ? "video"
            : defaultAutomationPublishType,
      },
      schedule: {
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Singapore",
        posting_times: [
          {
            time: defaultAutomationTemplateDefaults.schedule.defaultPostingTime,
            days: [...allDays],
          },
        ],
      },
    },
    summary
  )

  return schema
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
  const schema = automationTemplateRecordToSchema(record)
  return {
    automationKind: schema.automationKind,
    prompt_formatting: schema.prompt_formatting,
    image_collection_ids: schema.image_collection_ids,
    formatting: schema.formatting,
    tiktok_post_settings: schema.tiktok_post_settings,
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
}): AutomationTemplateRecord {
  return {
    id: input.id,
    automationKind: "slideshow",
    sourceAutomationId: input.sourceAutomationId,
    sourceUrl: input.sourceUrl,
    name: input.name,
    theme: input.theme,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    template: {
      created_at: new Date(input.schema.created_at).toISOString(),
      image_collection_ids: JSON.stringify(input.schema.image_collection_ids),
      format: automationSchemaToTemplateFormat(input.schema),
      hooks: input.hooks?.filter(Boolean) ?? [],
    },
  }
}

function automationSchemaToTemplateFormat(
  schema: AutomationSchema
): AutomationTemplateFormat {
  const hook = automationFormatSection(schema, "hook")
  const content = automationFormatSection(schema, "content")
  const cta = automationFormatSection(schema, "cta")
  const toneValue = automationTone(schema)
  const tone = toneLabel(toneValue)

  return {
    hook: {
      aspect_ratio: hook.aspect_ratio,
      image_grid: hook.imageGrid,
      overlay: hook.overlay,
      display_text: !hook.noText,
      text_items: hook.textItems.map(textItemToTemplate),
    },
    content: {
      aspect_ratio: content.aspect_ratio,
      image_grid: content.imageGrid,
      slide_count_mode: content.slideCountMode ?? "static",
      slide_count: content.slideCount,
      slide_count_min: content.slideCountMin,
      slide_count_max: content.slideCountMax,
      overlay: content.overlay,
      overlay_image: content.overlayImage
        ? {
            enabled: content.overlayImage.enabled,
            collection_id: content.overlayImage.collectionId,
            height: content.overlayImage.padding,
          }
        : undefined,
      display_text: !content.noText,
      text_items: content.textItems.map(textItemToTemplate),
    },
    cta: {
      enabled:
        cta.slideCount > 0 ||
        Boolean(schema.image_collection_ids.cta_slide.check),
      image_mode: cta.imageMode ?? "collection",
      aspect_ratio: cta.aspect_ratio,
      image_grid: cta.imageGrid,
      overlay: cta.overlay,
      display_text: !cta.noText,
      text_items: cta.textItems.map(textItemToTemplate),
    },
    tone,
    custom_tone: tone === "Custom" ? toneValue : "",
  }
}

function templateFormatToRuntime(
  format: AutomationTemplateFormat
): AutomationSchema["formatting"] {
  return [
    {
      id: "hook",
      image_url: "",
      aspect_ratio: format.hook.aspect_ratio,
      imageGrid: format.hook.image_grid,
      slideCount: 1,
      noText: !format.hook.display_text,
      overlay: format.hook.overlay,
      textItems: format.hook.text_items.map(templateTextItemToRuntime),
    },
    {
      id: "body",
      image_url: "",
      aspect_ratio: format.content.aspect_ratio,
      imageGrid: format.content.image_grid,
      slideCount:
        format.content.slide_count_mode === "varying"
          ? (format.content.slide_count_min ?? format.content.slide_count ?? 1)
          : (format.content.slide_count ?? 1),
      slideCountMode: format.content.slide_count_mode,
      slideCountMin: format.content.slide_count_min,
      slideCountMax: format.content.slide_count_max,
      noText: !format.content.display_text,
      overlay: format.content.overlay,
      overlayImage: format.content.overlay_image
        ? {
            enabled: format.content.overlay_image.enabled,
            collectionId: format.content.overlay_image.collection_id,
            padding: format.content.overlay_image.height,
          }
        : undefined,
      textItems: format.content.text_items.map(templateTextItemToRuntime),
    },
    {
      id: "cta",
      image_url: "",
      aspect_ratio: format.cta.aspect_ratio,
      imageGrid: format.cta.image_grid,
      slideCount: format.cta.enabled ? 1 : 0,
      noText: !format.cta.display_text,
      overlay: format.cta.overlay,
      imageMode: format.cta.image_mode,
      textItems: format.cta.text_items.map(templateTextItemToRuntime),
    },
    {
      id: "_tone",
      value:
        format.tone === "Custom" ? format.custom_tone : tonePrompt(format.tone),
      preset: format.tone ?? "Custom",
    },
  ]
}

function textItemToTemplate(
  item: AutomationTextItem
): AutomationTemplateTextItem {
  return {
    id: item.id,
    font: item.font,
    font_size: item.fontSize,
    text_style: item.textStyle,
    text_position: item.textPosition,
    text_item_width: item.textItemWidth,
    word_length_min: item.wordLengthMin,
    word_length_max: item.wordLengthMax,
    content_direction: item.contentDirection,
    text_mode: item.textMode,
    static_text: item.staticText,
    text_align: item.textAlign,
    text_anchor: item.textAnchor,
  }
}

function templateTextItemToRuntime(
  item: AutomationTemplateTextItem
): AutomationTextItem {
  return {
    id: item.id,
    text: "",
    font: item.font,
    fontSize: item.font_size,
    textStyle: item.text_style,
    textPosition: item.text_position as AutomationTextItem["textPosition"],
    textItemWidth: item.text_item_width,
    wordLengthMin: item.word_length_min,
    wordLengthMax: item.word_length_max,
    contentDirection: item.content_direction,
    textMode: item.text_mode,
    staticText: item.static_text,
    textAlign: item.text_align as AutomationTextItem["textAlign"],
    textAnchor: item.text_anchor as AutomationTextItem["textAnchor"],
  }
}

function normalizeAutomationTemplateRecord(
  record: AutomationTemplateRecord
): AutomationTemplateRecord | null {
  if (!record?.id || !record.name || !record.template) {
    return null
  }

  const template = record.template
  return {
    id: clean(record.id),
    automationKind: automationTemplateKind(record),
    sourceAutomationId: clean(record.sourceAutomationId) || undefined,
    sourceUrl: clean(record.sourceUrl) || undefined,
    name: clean(record.name),
    theme: clean(record.theme) || "template",
    createdAt:
      clean(record.createdAt) ||
      clean(template.created_at) ||
      new Date().toISOString(),
    updatedAt: clean(record.updatedAt) || new Date().toISOString(),
    template: {
      created_at:
        clean(template.created_at) ||
        clean(record.createdAt) ||
        new Date().toISOString(),
      image_collection_ids:
        typeof template.image_collection_ids === "string"
          ? template.image_collection_ids
          : JSON.stringify(template.image_collection_ids ?? {}),
      format: normalizeTemplateFormat(template.format),
      hooks: Array.isArray(template.hooks)
        ? template.hooks.map(clean).filter(Boolean)
        : [],
    },
  }
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

function normalizeTemplateFormat(
  format: AutomationTemplateFormat
): AutomationTemplateFormat {
  return {
    hook: {
      aspect_ratio: format?.hook?.aspect_ratio ?? "9:16",
      image_grid: format?.hook?.image_grid ?? "none",
      overlay: Boolean(format?.hook?.overlay),
      display_text: format?.hook?.display_text !== false,
      text_items: Array.isArray(format?.hook?.text_items)
        ? format.hook.text_items
        : [],
    },
    content: {
      aspect_ratio: format?.content?.aspect_ratio ?? "9:16",
      image_grid: format?.content?.image_grid ?? "none",
      slide_count_mode: format?.content?.slide_count_mode ?? "static",
      slide_count: Number(format?.content?.slide_count) || undefined,
      slide_count_min: Number(format?.content?.slide_count_min) || undefined,
      slide_count_max: Number(format?.content?.slide_count_max) || undefined,
      overlay: Boolean(format?.content?.overlay),
      overlay_image: format?.content?.overlay_image,
      display_text: format?.content?.display_text !== false,
      text_items: Array.isArray(format?.content?.text_items)
        ? format.content.text_items
        : [],
    },
    cta: {
      enabled: Boolean(format?.cta?.enabled),
      image_mode: format?.cta?.image_mode ?? "collection",
      aspect_ratio: format?.cta?.aspect_ratio ?? "9:16",
      image_grid: format?.cta?.image_grid ?? "none",
      overlay: Boolean(format?.cta?.overlay),
      display_text: format?.cta?.display_text !== false,
      text_items: Array.isArray(format?.cta?.text_items)
        ? format.cta.text_items
        : [],
    },
    tone: format?.tone ?? "Custom",
    custom_tone: clean(format?.custom_tone),
  }
}

function automationTemplateKind(
  record: Pick<AutomationTemplateRecord, "automationKind"> | undefined
) {
  return record?.automationKind === "video" ? "video" : "slideshow"
}

function templateSlideCount(format: AutomationTemplateFormat) {
  return (
    1 +
    (format.content.slide_count_mode === "varying"
      ? (format.content.slide_count_min ?? format.content.slide_count ?? 1)
      : (format.content.slide_count ?? 1)) +
    (format.cta.enabled ? 1 : 0)
  )
}

function parseImageCollectionIds(
  value: string,
  fallback: AutomationSchema["image_collection_ids"]
) {
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function templateCollectionIds(record: AutomationTemplateRecord) {
  const ids = new Set<string>()
  const parsed = parseTemplateImageCollectionIds(
    record.template.image_collection_ids
  )
  const firstSlide = isRecord(parsed.first_slide) ? parsed.first_slide : {}
  const ctaSlide = isRecord(parsed.cta_slide) ? parsed.cta_slide : {}

  addCollectionId(ids, firstSlide.collection)
  addCollectionId(ids, parsed.all_slides)
  addCollectionId(ids, ctaSlide.cta_collection_id)
  addCollectionId(
    ids,
    record.template.format.content.overlay_image?.collection_id
  )

  return [...ids]
}

function parseTemplateImageCollectionIds(value: string) {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function addCollectionId(ids: Set<string>, value: unknown) {
  const collectionId = clean(value)
  if (collectionId) {
    ids.add(collectionId)
  }
}

function toneLabel(value: string): AutomationTemplateTone {
  const normalized = value.trim().toLowerCase()
  if (normalized === "motivational & empowering")
    return "Motivational & Empowering"
  if (normalized === "educational & informative")
    return "Educational & Informative"
  if (normalized === "bold & provocative") return "Bold & Provocative"
  if (normalized === "calm & reflective") return "Calm & Reflective"
  if (normalized === "witty & humorous") return "Witty & Humorous"
  if (normalized === "witty & relatable") return "Witty & Relatable"
  if (normalized === "practical & aspirational")
    return "Practical & Aspirational"
  if (normalized === "authoritative & reassuring")
    return "Authoritative & Reassuring"
  if (normalized === "conversational & relatable")
    return "Conversational & Relatable"
  return "Custom"
}

function tonePrompt(tone?: AutomationTemplateTone) {
  return tone && tone !== "Custom" ? tone : ""
}
