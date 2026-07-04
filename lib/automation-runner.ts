import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { DateTime } from "luxon"

import { listAutomationRecords, type AutomationRecord } from "@/lib/automations"
import { deeplTargetLanguage, translateTextsWithDeepL } from "@/lib/deepl-translate"
import {
  automationCollectionIds,
  automationFormatSection,
  automationHooks,
  automationPublishType,
  automationTotalSlideCount,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import { collectionAliases, slugify } from "@/lib/realfarm-collections"
import { defaultSlideshowTextModel, generateSlideshowText } from "@/lib/slideshow-text-generation"
import { createSlideshowRecord, defaultSlideshowSettings, type SlideshowSlide } from "@/lib/slideshows"
import {
  automationSchemaToTempSlideTestingAutomation,
  type TempSlideSpec,
  type TempSlideStructuredOutput,
} from "@/lib/temp-slide-testing"

export type AutomationRunStatus = "scheduled" | "draft" | "failed"

export type AutomationRunRecord = {
  id: string
  automationId: string
  automationTitle: string
  scheduledFor: string
  status: AutomationRunStatus
  postizRecordId?: string
  slideshowId?: string
  plan: AutomationRunPlan
  createdAt: string
  updatedAt: string
  error?: string
}

export type AutomationRunPlan = {
  title: string
  hook: string
  imageCollectionIds: string[]
  slides: AutomationRunSlide[]
  slideCount: {
    mode: string
    count?: number
    min?: number
    max?: number
  }
  publishType: string
  autoMusic: boolean
  autoPost: boolean
  textModel?: string
  language: string
  translationProvider?: "deepl"
}

export type AutomationRunSlide = {
  id: string
  role: "hook" | "content" | "cta"
  imageUrl: string
  imageCaption: string
  text: string
  textPlacement: "top"
}

export type AutomationRunResult = {
  created: AutomationRunRecord[]
  skipped: { automationId: string; reason: "not_live" | "not_due" | "already_ran" | "no_images"; scheduledFor?: string }[]
}

type AutomationRunsDb = {
  runs?: AutomationRunRecord[]
}

const defaultAutomationRootDir = path.join(process.cwd(), "data", "automations")
const defaultRunRootDir = path.join(process.cwd(), "data", "automations")
const runsFileName = "runs.json"

export async function listAutomationRuns(input: {
  runRootDir?: string
  automationId?: string
  limit?: number
} = {}) {
  const runs = await readAutomationRuns(input.runRootDir ?? defaultRunRootDir)
  const filteredRuns = input.automationId
    ? runs.filter((run) => run.automationId === input.automationId)
    : runs
  return filteredRuns.slice(0, Math.max(1, input.limit ?? 50))
}

export async function runDueAutomations(input: {
  automationRootDir?: string
  runRootDir?: string
  postizRootDir?: string
  slideshowRootDir?: string
  imageCollectionDbPath?: string
  automationId?: string
  schemaOverride?: AutomationSchema
  force?: boolean
  now?: Date
  lookbackMinutes?: number
  random?: () => number
} = {}): Promise<AutomationRunResult> {
  const now = input.now ?? new Date()
  const lookbackMinutes = input.lookbackMinutes ?? 24 * 60
  const runRootDir = input.runRootDir ?? defaultRunRootDir
  const records = await listAutomationRecords({ rootDir: input.automationRootDir ?? defaultAutomationRootDir })
  const existingRuns = await readAutomationRuns(runRootDir)
  const result: AutomationRunResult = { created: [], skipped: [] }
  const nextRuns = [...existingRuns]

  for (const record of records) {
    if (input.automationId && record.id !== input.automationId) {
      continue
    }

    if (!input.force && record.schema.status !== "live") {
      result.skipped.push({ automationId: record.id, reason: "not_live" })
      continue
    }

    const dueSlots = input.force
      ? [now.toISOString()]
      : dueAutomationSlots(record.schema, now, lookbackMinutes)
    if (dueSlots.length === 0) {
      result.skipped.push({ automationId: record.id, reason: "not_due" })
      continue
    }

    for (const scheduledFor of dueSlots) {
      if (!input.force && nextRuns.some((run) => run.automationId === record.id && run.scheduledFor === scheduledFor)) {
        result.skipped.push({ automationId: record.id, reason: "already_ran", scheduledFor })
        continue
      }

      const effectiveRecord = input.schemaOverride && input.automationId === record.id
        ? { ...record, schema: input.schemaOverride }
        : record
      const run = await createAutomationRun({
        record: effectiveRecord,
        scheduledFor,
        postizRootDir: input.postizRootDir,
        slideshowRootDir: input.slideshowRootDir,
        imageCollectionDbPath: input.imageCollectionDbPath,
        random: input.random,
      })
      if (run.status === "failed") {
        result.skipped.push({ automationId: record.id, reason: "no_images", scheduledFor })
      }
      nextRuns.unshift(run)
      result.created.push(run)
    }
  }

  if (result.created.length > 0) {
    await writeAutomationRuns(runRootDir, nextRuns)
  }

  return result
}

function dueAutomationSlots(schema: AutomationSchema, now: Date, lookbackMinutes: number) {
  const zone = schema.schedule.timezone || DateTime.local().zoneName
  const nowLocal = DateTime.fromJSDate(now, { zone })
  const earliest = nowLocal.minus({ minutes: lookbackMinutes })
  const day = nowLocal.toFormat("ccc")

  return schema.schedule.posting_times.flatMap((postingTime) => {
    if (!postingTime.days.includes(day as never)) {
      return []
    }

    const slot = parseLocalSlot(nowLocal, postingTime.time)
    if (!slot || slot > nowLocal || slot < earliest) {
      return []
    }

    return [slot.toUTC().toISO({ suppressMilliseconds: false }) ?? slot.toUTC().toISO()]
  }).filter((value): value is string => Boolean(value))
}

function parseLocalSlot(nowLocal: DateTime, time: string) {
  const formats = ["h:mm a", "h a", "H:mm", "HH:mm"]
  const zone = nowLocal.zoneName || "UTC"
  for (const format of formats) {
    const parsed = DateTime.fromFormat(time.trim().toUpperCase(), format, { zone })
    if (parsed.isValid) {
      return nowLocal.set({
        hour: parsed.hour,
        minute: parsed.minute,
        second: 0,
        millisecond: 0,
      })
    }
  }
  return null
}

async function createAutomationRun(input: {
  record: AutomationRecord
  scheduledFor: string
  postizRootDir?: string
  slideshowRootDir?: string
  imageCollectionDbPath?: string
  random?: () => number
}) {
  const now = new Date().toISOString()
  const plan = await createAutomationRunPlan(input.record.schema, {
    imageCollectionDbPath: input.imageCollectionDbPath,
    random: input.random,
  })
  const status: AutomationRunStatus = plan.slides.length > 0 ? "scheduled" : "failed"
  const run: AutomationRunRecord = {
    id: `automation-run-${randomUUID()}`,
    automationId: input.record.id,
    automationTitle: input.record.schema.title || input.record.name,
    scheduledFor: input.scheduledFor,
    status,
    plan,
    createdAt: now,
    updatedAt: now,
    error: status === "failed" ? "No images available for automation collections" : undefined,
  }
  const slideshow = await createSlideshowRecord({
    rootDir: input.slideshowRootDir,
    title: input.record.schema.title || input.record.name,
    prompt: automationSlideshowPrompt(input.record.schema, plan.hook),
    image_collection: plan.imageCollectionIds[0] ?? "",
    slideshow_type: "automation",
    status: "draft",
    is_finished: status !== "failed",
    is_failed: status === "failed",
    settings: automationSlideshowSettings(input.record.schema),
    images: automationRunSlidesToSlideshowSlides(input.record.schema, plan),
  })

  return {
    ...run,
    slideshowId: slideshow.id,
  }
}

async function createAutomationRunPlan(schema: AutomationSchema, options: {
  imageCollectionDbPath?: string
  random?: () => number
} = {}): Promise<AutomationRunPlan> {
  const collectionIds = automationCollectionIds(schema)
  const content = automationFormatSection(schema, "content")
  const slideCount = automationTotalSlideCount(schema)
  const hook = automationHooks(schema)[0] || schema.title
  const textAutomation = automationSchemaToTempSlideTestingAutomation(schema)
  const textGeneration = await generateAutomationText({
    automation: textAutomation,
    hook,
  })
  const images = await loadAutomationImages({
    collectionIds,
    imageCollectionDbPath: options.imageCollectionDbPath,
  })
  const slides = await translateAutomationSlides({
    language: schema.image_collection_ids.language || "English",
    slides: createSlides({
      title: schema.title,
      hook,
      images,
      slideCount,
      textAutomation,
      generatedText: textGeneration?.result,
      random: options.random,
    }),
  })

  return {
    title: schema.title,
    hook,
    imageCollectionIds: collectionIds,
    slides,
    slideCount: {
      mode: "static",
      count: slideCount,
      min: content.slideCount,
      max: schema.prompt_formatting.num_of_slides,
    },
    publishType: automationPublishType(schema),
    autoMusic: schema.tiktok_post_settings.auto_music,
    autoPost: schema.tiktok_post_settings.auto_post,
    textModel: textGeneration?.model,
    language: schema.image_collection_ids.language || "English",
    translationProvider: deeplTargetLanguage(schema.image_collection_ids.language || "English") ? "deepl" : undefined,
  }
}

async function translateAutomationSlides(input: {
  language: string
  slides: AutomationRunSlide[]
}) {
  if (!deeplTargetLanguage(input.language)) {
    return input.slides
  }

  const apiKey = clean(process.env.DEEPL_API_KEY)
  if (!apiKey) {
    throw new Error("DEEPL_API_KEY is not configured")
  }

  const translatedTexts = await translateTextsWithDeepL({
    apiKey,
    targetLanguage: input.language,
    texts: input.slides.map((slide) => slide.text),
    apiUrl: clean(process.env.DEEPL_API_URL) || undefined,
  })
  return input.slides.map((slide, index) => ({
    ...slide,
    text: translatedTexts[index] || slide.text,
  }))
}

async function generateAutomationText(input: {
  automation: ReturnType<typeof automationSchemaToTempSlideTestingAutomation>
  hook: string
}) {
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) {
    return null
  }

  try {
    return await generateSlideshowText({
      automation: input.automation,
      model: defaultSlideshowTextModel,
      selectedHook: input.hook,
      apiKey,
    })
  } catch {
    return null
  }
}

async function loadAutomationImages(input: {
  collectionIds: string[]
  imageCollectionDbPath?: string
}) {
  const collections = await readImageCollections(input.imageCollectionDbPath)
  const requested = new Set(input.collectionIds)
  const matching = collections
    .filter((collection) => requested.size === 0 || collection.aliases.some((alias) => requested.has(alias)))
    .flatMap((collection) =>
      collection.images.map((image, index) => ({
        id: `${collection.id}-${index}`,
        imageUrl: image.image_link,
        imageCaption: image.caption,
      }))
    )
  const fallback = collections.flatMap((collection) =>
    collection.images.map((image, index) => ({
      id: `${collection.id}-${index}`,
      imageUrl: image.image_link,
      imageCaption: image.caption,
    }))
  )

  return matching.length > 0 ? matching : fallback
}

function createSlides(input: {
  title: string
  hook: string
  images: { id: string; imageUrl: string; imageCaption: string }[]
  slideCount: number
  textAutomation?: ReturnType<typeof automationSchemaToTempSlideTestingAutomation>
  generatedText?: TempSlideStructuredOutput
  random?: () => number
}): AutomationRunSlide[] {
  const selectedImages = chooseImages(input.images, input.slideCount, input.random)
  return selectedImages.map((image, index) => ({
    id: `slide-${index + 1}`,
    role: index === 0 ? "hook" : index === selectedImages.length - 1 && selectedImages.length > 1 ? "cta" : "content",
    imageUrl: image.imageUrl,
    imageCaption: image.imageCaption,
    text: automationSlideText({
      title: input.title,
      hook: input.hook,
      slide: input.textAutomation?.slides[index],
      generatedText: input.generatedText,
    }),
    textPlacement: "top",
  }))
}

function automationSlideText(input: {
  title: string
  hook: string
  slide?: TempSlideSpec
  generatedText?: TempSlideStructuredOutput
}) {
  if (!input.slide || input.slide.section === "hook") {
    return input.hook
  }

  const textItem = input.slide.textItems[0]
  if (!textItem) {
    return input.title
  }
  if (textItem.textMode === "static") {
    return textItem.staticText || input.title
  }
  return input.generatedText?.text[textItem.id] || textItem.contentDirection || input.title
}

function automationRunSlidesToSlideshowSlides(schema: AutomationSchema, plan: AutomationRunPlan): SlideshowSlide[] {
  const settings = automationSlideshowSettings(schema)
  return plan.slides.map((slide, index) => {
    const section = automationFormatSection(schema, slide.role === "hook" ? "hook" : slide.role === "cta" ? "cta" : "content")
    const textItem = section.textItems[0]
    const text = slide.text || plan.hook || schema.title
    const textPosition = textItemPosition(textItem, slide.role === "hook")

    return {
      id: slide.id || `slide-${index + 1}`,
      image_url: slide.imageUrl,
      aspect_ratio: section.aspect_ratio || "9:16",
      time_length_ms: Math.max(1, settings.duration) * 1000,
      textItems: section.noText ? [] : [
        {
          id: textItem?.id || `text-${index + 1}`,
          text,
          font: textItem?.font || "TikTok Display Medium",
          fontSize: textItem?.fontSize || "10px",
          textSize: {
            width: textItemWidth(textItem?.textItemWidth, text),
            height: 18,
          },
          textStyle: textItem?.textStyle || "outline",
          textAlign: textItem?.textAlign || "center",
          textAnchor: textItem?.textAnchor || "padded",
          textPosition,
        },
      ],
    }
  })
}

function automationSlideshowSettings(schema: AutomationSchema) {
  const content = automationFormatSection(schema, "content")
  return defaultSlideshowSettings({
    duration: 4,
    background_color: "#000000",
    is_bg_overlay_on: content.overlay,
    transition_style: "hard",
    background_opacity: schema.image_collection_ids.background_opacity ?? content.overlayOpacity ?? 40,
    is_bg_overlay_on_hook_image: Boolean(schema.image_collection_ids.is_bg_overlay_on_hook_image),
  })
}

function automationSlideshowPrompt(schema: AutomationSchema, hook: string) {
  return [
    schema.prompt_formatting.narrative,
    schema.prompt_formatting.style,
    hook ? `Hook: ${hook}` : "",
  ].filter(Boolean).join("\n\n")
}

function textItemPosition(
  textItem: ReturnType<typeof automationFormatSection>["textItems"][number] | undefined,
  preferTop: boolean
) {
  const y = textItem?.textPosition === "bottom"
    ? 82
    : textItem?.textPosition === "center" && !preferTop
      ? 45
      : 16
  const x = textItem?.textAlign === "left" ? 28 : textItem?.textAlign === "right" ? 72 : 50
  return { x, y }
}

function textItemWidth(value: string | undefined, text: string) {
  const parsed = Number(value?.replace("%", ""))
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return Math.max(20, Math.min(100, text.length * 4))
}

function chooseImages<T>(items: T[], count: number, random = Math.random) {
  if (items.length === 0 || count <= 0) {
    return []
  }

  const pool = [...items]
  const selected: T[] = []
  while (selected.length < count) {
    if (pool.length === 0) {
      pool.push(...items)
    }
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
    selected.push(pool.splice(index, 1)[0])
  }
  return selected
}

async function readImageCollections(imageCollectionDbPath = path.join(process.cwd(), "data", "image-collections.json")) {
  try {
    const contents = await readFile(imageCollectionDbPath, "utf8")
    const parsed = JSON.parse(contents) as {
      collections?: {
        name?: string
        created_at?: string
        images?: { image_link?: string; caption?: string }[]
      }[]
    }
    return (parsed.collections ?? []).map((collection) => ({
      id: `collection-${slugify(`${clean(collection.name)}-${clean(collection.created_at)}`)}`,
      name: clean(collection.name),
      images: (collection.images ?? []).flatMap((image) => {
        const imageLink = clean(image.image_link)
        return imageLink ? [{ image_link: imageLink, caption: clean(image.caption) }] : []
      }),
    })).map((collection) => ({
      ...collection,
      aliases: collectionAliases({
        id: collection.id,
        title: collection.name,
        createdAt: "",
        source: "pinterest",
        images: collection.images.map((image, index) => ({
          id: `${collection.id}-${index}`,
          title: image.caption || collection.name,
          description: image.caption,
          imageUrl: image.image_link,
          sourceUrl: image.image_link,
          dominantColor: "#d9d8d0",
        })),
      }),
    }))
  } catch {
    return []
  }
}

function randomInteger(min: number, max: number, random = Math.random) {
  return min + Math.floor(random() * (max - min + 1))
}

function automationCaption(record: AutomationRecord, plan: AutomationRunPlan) {
  return `${record.schema.title || record.name}: ${plan.hook}`
}

async function readAutomationRuns(rootDir = defaultRunRootDir): Promise<AutomationRunRecord[]> {
  try {
    const contents = await readFile(path.join(rootDir, runsFileName), "utf8")
    const parsed = JSON.parse(contents) as AutomationRunsDb
    return Array.isArray(parsed.runs) ? parsed.runs.map(normalizeRun).flatMap((run) => run ? [run] : []) : []
  } catch {
    return []
  }
}

async function writeAutomationRuns(rootDir: string, runs: AutomationRunRecord[]) {
  await mkdir(rootDir, { recursive: true })
  await writeFile(path.join(rootDir, runsFileName), `${JSON.stringify({ runs }, null, 2)}\n`)
}

function normalizeRun(run: AutomationRunRecord): AutomationRunRecord | null {
  if (!run?.id || !run.automationId || !run.scheduledFor) {
    return null
  }
  return {
    ...run,
    status: run.status === "draft" || run.status === "failed" ? run.status : "scheduled",
    plan: run.plan ?? {
      title: run.automationTitle,
      hook: run.automationTitle,
      imageCollectionIds: [],
      slides: [],
      slideCount: { mode: "varying" },
      publishType: "slideshow",
      autoMusic: true,
      autoPost: false,
    },
    createdAt: clean(run.createdAt) || new Date().toISOString(),
    updatedAt: clean(run.updatedAt) || clean(run.createdAt) || new Date().toISOString(),
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
