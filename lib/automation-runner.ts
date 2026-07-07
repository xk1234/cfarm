import { randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { DateTime } from "luxon"

import { listAutomationRecords, type AutomationRecord } from "@/lib/automations"
import {
  deeplTargetLanguage,
  translateTextsWithDeepL,
} from "@/lib/deepl-translate"
import {
  defaultAutomationLanguage,
  defaultSlideshowTransition,
  slideshowDurationValue,
} from "@/lib/slideshow-publishing-config"
import {
  automationCollectionIds,
  automationFormatSection,
  automationHooks,
  automationPublishType,
  automationTotalSlideCount,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import { collectionAliases, slugify } from "@/lib/realfarm-collections"
import {
  defaultSlideshowTextModel,
  generateSlideshowText,
  type SlideshowTextGenerationResult,
} from "@/lib/slideshow-text-generation"
import {
  listPostFastPostRecords,
  type PostFastPostStatus,
} from "@/lib/postfast-posts"
import {
  createSlideshowResultRecord,
  defaultSlideshowSettings,
  listSlideshowRecords,
  type SlideshowRecord,
  type SlideshowSlide,
  type SlideshowTextItem,
} from "@/lib/slideshows"
import type { ResultRecord } from "@/lib/results"
import {
  automationSchemaToTempSlideTestingAutomation,
  type TempSlideSpec,
  type TempSlideStructuredOutput,
} from "@/lib/temp-slide-testing"

export type AutomationRunStatus = "succeeded" | "failed"

export type AutomationRunRecord = {
  id: string
  automationId: string
  automationTitle: string
  scheduledFor: string
  status: AutomationRunStatus
  postfastRecordId?: string
  slideshowId?: string
  videoUrl?: string
  thumbnailUrl?: string
  outputImages?: string[]
  outputDir?: string
  socialStatuses?: AutomationRunSocialStatus[]
  renderedSlides?: AutomationRunRenderedSlide[]
  plan: AutomationRunPlan
  createdAt: string
  updatedAt: string
  error?: string
}

export type AutomationRunPlan = {
  title: string
  caption: string
  hashtags: string
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
  hookCandidates?: string[]
  textModel?: string
  language: string
  translationProvider?: "deepl"
  debug?: {
    selectedHookIndex?: number
    textModelPrompt?: SlideshowTextGenerationResult["promptPayload"]
  }
}

export type AutomationRunSlide = {
  id: string
  role: "hook" | "content" | "cta"
  imageUrl: string
  imageCaption: string
  overlayImage?: {
    imageUrl: string
    imageCaption: string
    padding: number
  }
  text: string
  textPlacement: "top"
  aspectRatio?: string
  imageGrid?: string
  overlay?: boolean
  displayText?: boolean
  textItems?: SlideshowTextItem[]
}

export type AutomationRunRenderedSlide = {
  id: string
  role?: AutomationRunSlide["role"]
  imageUrl: string
  sourceImageUrl?: string
  imageCaption?: string
  text: string
  durationMs: number
  aspectRatio: string
}

type AutomationRunnerImage = {
  id: string
  imageUrl: string
  imageCaption: string
}

export type AutomationRunSocialStatus = {
  provider: AutomationSchema["social_integrations"][number]["provider"]
  integrationId: string
  name: string
  profile?: string
  status: PostFastPostStatus | "queued" | "disabled"
  error?: string
}

export type AutomationRunResult = {
  created: AutomationRunRecord[]
  results: ResultRecord[]
  skipped: {
    automationId: string
    reason: "not_live" | "not_due" | "already_ran" | "no_images"
    scheduledFor?: string
  }[]
}

type RawAutomationRunRecord = Omit<
  Partial<AutomationRunRecord>,
  "status" | "plan"
> & {
  status?: unknown
  plan?: Partial<AutomationRunPlan>
}

type AutomationRunsDb = {
  runs?: RawAutomationRunRecord[]
}

const defaultAutomationRootDir = path.join(process.cwd(), "data", "automations")
const defaultRunRootDir = path.join(process.cwd(), "data", "automations")
const runsFileName = "runs.json"

export async function listAutomationRuns(
  input: {
    runRootDir?: string
    slideshowRootDir?: string
    automationRootDir?: string
    postfastRootDir?: string
    automationId?: string
    limit?: number
  } = {}
) {
  const runs = await readAutomationRuns(input.runRootDir ?? defaultRunRootDir)
  const filteredRuns = input.automationId
    ? runs.filter((run) => run.automationId === input.automationId)
    : runs
  const limitedRuns = filteredRuns.slice(0, Math.max(1, input.limit ?? 50))
  const renderedRuns = await enrichRunsWithRenderedSlides(
    limitedRuns,
    input.slideshowRootDir
  )
  return enrichRunsWithSocialStatuses(
    renderedRuns,
    input.automationRootDir,
    input.postfastRootDir
  )
}

export async function deleteAutomationRuns(input: {
  runRootDir?: string
  automationId?: string
  slideshowIds?: string[]
}) {
  const automationId = clean(input.automationId)
  const slideshowIds = new Set(
    (input.slideshowIds ?? []).map(clean).filter(Boolean)
  )
  if (!automationId && slideshowIds.size === 0) {
    return []
  }

  const runRootDir = input.runRootDir ?? defaultRunRootDir
  const runs = await readAutomationRuns(runRootDir)
  const deleted = runs.filter(
    (run) =>
      (automationId && run.automationId === automationId) ||
      (run.slideshowId && slideshowIds.has(run.slideshowId))
  )
  if (deleted.length === 0) {
    return []
  }

  const deletedIds = new Set(deleted.map((run) => run.id))
  await writeAutomationRuns(
    runRootDir,
    runs.filter((run) => !deletedIds.has(run.id))
  )
  return deleted
}

export async function runDueAutomations(
  input: {
    automationRootDir?: string
    runRootDir?: string
    resultRootDir?: string
    postfastRootDir?: string
    slideshowRootDir?: string
    imageCollectionDbPath?: string
    automationId?: string
    schemaOverride?: AutomationSchema
    force?: boolean
    now?: Date
    lookbackMinutes?: number
    random?: () => number
  } = {}
): Promise<AutomationRunResult> {
  const now = input.now ?? new Date()
  const lookbackMinutes = input.lookbackMinutes ?? 24 * 60
  const runRootDir = input.runRootDir ?? defaultRunRootDir
  const slideshowRootDir =
    input.slideshowRootDir ??
    (input.postfastRootDir
      ? path.join(input.postfastRootDir, "slideshows")
      : undefined)
  const resultRootDir =
    input.resultRootDir ??
    (input.postfastRootDir
      ? path.join(input.postfastRootDir, "results")
      : undefined)
  const records = await listAutomationRecords({
    rootDir: input.automationRootDir ?? defaultAutomationRootDir,
  })
  const existingRuns = await readAutomationRuns(runRootDir)
  const result: AutomationRunResult = { created: [], results: [], skipped: [] }
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
      if (
        !input.force &&
        nextRuns.some(
          (run) =>
            run.automationId === record.id && run.scheduledFor === scheduledFor
        )
      ) {
        result.skipped.push({
          automationId: record.id,
          reason: "already_ran",
          scheduledFor,
        })
        continue
      }

      const effectiveRecord =
        input.schemaOverride && input.automationId === record.id
          ? { ...record, schema: input.schemaOverride }
          : record
      const createdRun = await createAutomationRun({
        record: effectiveRecord,
        scheduledFor,
        postfastRootDir: input.postfastRootDir,
        slideshowRootDir,
        resultRootDir,
        imageCollectionDbPath: input.imageCollectionDbPath,
        random: input.random,
      })
      const run = createdRun.run
      if (run.status === "failed") {
        result.skipped.push({
          automationId: record.id,
          reason: "no_images",
          scheduledFor,
        })
      }
      nextRuns.unshift(run)
      result.created.push(run)
      if (createdRun.result) {
        result.results.push(createdRun.result)
      }
    }
  }

  if (result.created.length > 0) {
    await writeAutomationRuns(runRootDir, nextRuns)
  }

  return result
}

function dueAutomationSlots(
  schema: AutomationSchema,
  now: Date,
  lookbackMinutes: number
) {
  const zone = schema.schedule.timezone || DateTime.local().zoneName
  const nowLocal = DateTime.fromJSDate(now, { zone })
  const earliest = nowLocal.minus({ minutes: lookbackMinutes })
  const day = nowLocal.toFormat("ccc")

  return schema.schedule.posting_times
    .flatMap((postingTime) => {
      if (!postingTime.days.includes(day as never)) {
        return []
      }

      const slot = parseLocalSlot(nowLocal, postingTime.time)
      if (!slot || slot > nowLocal || slot < earliest) {
        return []
      }

      return [
        slot.toUTC().toISO({ suppressMilliseconds: false }) ??
          slot.toUTC().toISO(),
      ]
    })
    .filter((value): value is string => Boolean(value))
}

function parseLocalSlot(nowLocal: DateTime, time: string) {
  const formats = ["h:mm a", "h a", "H:mm", "HH:mm"]
  const zone = nowLocal.zoneName || "UTC"
  for (const format of formats) {
    const parsed = DateTime.fromFormat(time.trim().toUpperCase(), format, {
      zone,
    })
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
  postfastRootDir?: string
  slideshowRootDir?: string
  resultRootDir?: string
  imageCollectionDbPath?: string
  random?: () => number
}) {
  const now = new Date().toISOString()
  const plan = await createAutomationRunPlan(input.record.schema, {
    imageCollectionDbPath: input.imageCollectionDbPath,
    random: input.random,
  })
  const status: AutomationRunStatus =
    plan.slides.length > 0 ? "succeeded" : "failed"
  const run: AutomationRunRecord = {
    id: `automation-run-${randomUUID()}`,
    automationId: input.record.id,
    automationTitle: input.record.schema.title || input.record.name,
    scheduledFor: input.scheduledFor,
    status,
    plan,
    createdAt: now,
    updatedAt: now,
    error:
      status === "failed"
        ? "No images available for automation collections"
        : undefined,
  }
  if (status === "failed") {
    return { run }
  }

  const { slideshow, result } = await createSlideshowResultRecord({
    rootDir: input.slideshowRootDir,
    resultRootDir: input.resultRootDir,
    runId: run.id,
    automationId: input.record.id,
    title: plan.title || input.record.schema.title || input.record.name,
    caption: plan.caption,
    hashtags: plan.hashtags,
    prompt: automationSlideshowPrompt(input.record.schema, plan.hook),
    image_collection: plan.imageCollectionIds[0] ?? "",
    slideshow_type: "automation",
    status: "exported",
    is_finished: true,
    is_failed: false,
    settings: automationSlideshowSettings(input.record.schema),
    images: automationRunSlidesToSlideshowSlides(input.record.schema, plan),
  })

  const runWithSlideshowId = {
    ...run,
    slideshowId: slideshow.id,
    videoUrl: slideshow.video_url,
    thumbnailUrl: slideshow.thumbnail_url,
    outputImages: slideshow.output_images,
    outputDir: slideshow.output_dir,
  }
  const runWithStatuses = {
    ...runWithSlideshowId,
    socialStatuses: await socialStatusesForRun({
      run: runWithSlideshowId,
      schema: input.record.schema,
      postfastRootDir: input.postfastRootDir,
    }),
  }

  return {
    run: runWithRenderedSlides(runWithStatuses, slideshow),
    result,
  }
}

async function enrichRunsWithRenderedSlides(
  runs: AutomationRunRecord[],
  slideshowRootDir?: string
) {
  const slideshowIds = new Set(
    runs.map((run) => run.slideshowId).filter((id): id is string => Boolean(id))
  )
  if (slideshowIds.size === 0) {
    return runs
  }

  const slideshows = await listSlideshowRecords({
    rootDir: slideshowRootDir,
    limit: Math.max(100, slideshowIds.size),
  })
  const slideshowsById = new Map(
    slideshows
      .filter((slideshow) => slideshowIds.has(slideshow.id))
      .map((slideshow) => [slideshow.id, slideshow])
  )

  return runs.map((run) => {
    const slideshow = run.slideshowId
      ? slideshowsById.get(run.slideshowId)
      : undefined
    return slideshow ? runWithRenderedSlides(run, slideshow) : run
  })
}

function runWithRenderedSlides(
  run: AutomationRunRecord,
  slideshow: SlideshowRecord
): AutomationRunRecord {
  const renderedSlides: AutomationRunRenderedSlide[] = []
  slideshow.images.forEach((slide, index) => {
    const imageUrl = slide.image_url.trim()
    if (!imageUrl) {
      return
    }
    const planSlide = run.plan.slides[index]
    const firstText =
      slide.textItems[0]?.text || planSlide?.text || run.plan.hook
    renderedSlides.push({
      id: slide.id || planSlide?.id || `rendered-slide-${index + 1}`,
      role: planSlide?.role,
      imageUrl,
      sourceImageUrl: slide.source_image_url,
      imageCaption: planSlide?.imageCaption,
      text: firstText,
      durationMs: slide.time_length_ms,
      aspectRatio: slide.aspect_ratio,
    })
  })

  return {
    ...run,
    videoUrl: slideshow.video_url,
    thumbnailUrl: slideshow.thumbnail_url,
    outputImages: slideshow.output_images,
    outputDir: slideshow.output_dir,
    renderedSlides,
  }
}

async function enrichRunsWithSocialStatuses(
  runs: AutomationRunRecord[],
  automationRootDir = defaultAutomationRootDir,
  postfastRootDir?: string
) {
  if (runs.length === 0) {
    return runs
  }

  const records = await listAutomationRecords({ rootDir: automationRootDir })
  const recordsById = new Map(records.map((record) => [record.id, record]))

  return Promise.all(
    runs.map(async (run) => {
      const record = recordsById.get(run.automationId)
      if (!record) {
        return run
      }
      return {
        ...run,
        socialStatuses: await socialStatusesForRun({
          run,
          schema: record.schema,
          postfastRootDir,
        }),
      }
    })
  )
}

async function socialStatusesForRun(input: {
  run: Pick<AutomationRunRecord, "id" | "status" | "slideshowId">
  schema: AutomationSchema
  postfastRootDir?: string
}): Promise<AutomationRunSocialStatus[]> {
  const integrations = input.schema.social_integrations.filter(
    (integration) => integration.integration_id
  )
  if (integrations.length === 0) {
    return []
  }

  const postRecords = await listPostFastPostRecords({
    rootDir: input.postfastRootDir,
  }).catch(() => [])

  return integrations.map((integration) => {
    const postRecord = postRecords.find(
      (record) =>
        record.integrationId === integration.integration_id &&
        ((input.run.slideshowId &&
          record.sourceType === "slideshow" &&
          record.sourceId === input.run.slideshowId) ||
          (record.sourceType === "automation" &&
            record.sourceId === input.run.id))
    )
    const status =
      postRecord?.status ??
      (integration.disabled
        ? "disabled"
        : input.run.status === "failed"
          ? "failed"
          : "queued")

    return {
      provider: integration.provider,
      integrationId: integration.integration_id,
      name: integration.name,
      profile: integration.profile,
      status,
      error: postRecord?.error,
    }
  })
}

async function createAutomationRunPlan(
  schema: AutomationSchema,
  options: {
    imageCollectionDbPath?: string
    random?: () => number
  } = {}
): Promise<AutomationRunPlan> {
  const collectionIds = automationCollectionIds(schema)
  const content = automationFormatSection(schema, "content")
  const slideCount = automationTotalSlideCount(schema)
  const hookCandidates = automationHooks(schema)
  const selectedHookIndex = selectRandomIndex(
    hookCandidates.length,
    options.random
  )
  const hook = hookCandidates[selectedHookIndex] || schema.title
  const textAutomation = automationSchemaToTempSlideTestingAutomation(schema)
  const textGeneration = await generateAutomationText({
    automation: textAutomation,
    hook,
  })
  const imageCollections = await readImageCollections(
    options.imageCollectionDbPath
  )
  const images = imagesForCollectionIds({
    collections: imageCollections,
    collectionIds,
    useFallback: true,
  })
  const slides = await translateAutomationSlides({
    language: schema.image_collection_ids.language || defaultAutomationLanguage,
    slides: createSlides({
      title: schema.title,
      hook,
      images,
      imageCollections,
      slideCount,
      textAutomation,
      generatedText: textGeneration?.result,
      random: options.random,
    }),
  })
  const caption =
    clean(textGeneration?.result.caption) || slideshowCaption(slides, hook)

  return {
    title: clean(textGeneration?.result.title) || schema.title,
    caption,
    hashtags: clean(textGeneration?.result.hashtags),
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
    hookCandidates,
    textModel: textGeneration?.model,
    language: schema.image_collection_ids.language || defaultAutomationLanguage,
    translationProvider: deeplTargetLanguage(
      schema.image_collection_ids.language || defaultAutomationLanguage
    )
      ? "deepl"
      : undefined,
    debug: {
      selectedHookIndex,
      textModelPrompt: textGeneration?.promptPayload,
    },
  }
}

async function translateAutomationSlides(input: {
  language: string
  slides: AutomationRunSlide[]
}) {
  if (!deeplTargetLanguage(input.language)) {
    return input.slides
  }

  const apiKey = clean(process.env.DEEPL_KEY)
  if (!apiKey) {
    throw new Error("DEEPL_KEY is not configured")
  }

  const targets = input.slides.flatMap((slide, slideIndex) => {
    if (slide.textItems?.length) {
      return slide.textItems.map((textItem, textIndex) => ({
        slideIndex,
        textIndex,
        text: textItem.text,
      }))
    }
    return [{ slideIndex, textIndex: -1, text: slide.text }]
  })
  if (targets.length === 0) {
    return input.slides
  }

  const translatedTexts = await translateTextsWithDeepL({
    apiKey,
    targetLanguage: input.language,
    texts: targets.map((target) => target.text),
  })
  const nextSlides = input.slides.map((slide) => ({
    ...slide,
    textItems: slide.textItems?.map((textItem) => ({ ...textItem })),
  }))

  targets.forEach((target, index) => {
    const translatedText = translatedTexts[index] || target.text
    const slide = nextSlides[target.slideIndex]
    if (!slide) {
      return
    }
    if (target.textIndex >= 0 && slide.textItems?.[target.textIndex]) {
      slide.textItems[target.textIndex] = {
        ...slide.textItems[target.textIndex],
        text: translatedText,
      }
      slide.text = slide.textItems[0]?.text || translatedText
      return
    }
    slide.text = translatedText
  })

  return nextSlides
}

async function generateAutomationText(input: {
  automation: ReturnType<typeof automationSchemaToTempSlideTestingAutomation>
  hook: string
}) {
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) {
    return null
  }

  return generateSlideshowText({
    automation: input.automation,
    model: defaultSlideshowTextModel,
    selectedHook: input.hook,
    apiKey,
  })
}

function imagesForCollectionIds(input: {
  collections: Awaited<ReturnType<typeof readImageCollections>>
  collectionIds: string[]
  useFallback: boolean
}): AutomationRunnerImage[] {
  const requested = new Set(input.collectionIds)
  const matching = input.collections
    .filter(
      (collection) =>
        (requested.size === 0 && input.useFallback) ||
        collection.aliases.some((alias) => requested.has(alias))
    )
    .flatMap((collection) =>
      collection.images.map((image, index) => ({
        id: `${collection.id}-${index}`,
        imageUrl: image.image_link,
        imageCaption: image.caption,
      }))
    )
  const fallback = input.collections.flatMap((collection) =>
    collection.images.map((image, index) => ({
      id: `${collection.id}-${index}`,
      imageUrl: image.image_link,
      imageCaption: image.caption,
    }))
  )

  return matching.length > 0 || !input.useFallback ? matching : fallback
}

function overlayImageForSlide(input: {
  collections: Awaited<ReturnType<typeof readImageCollections>>
  slide: TempSlideSpec
  slideIndex: number
}): AutomationRunSlide["overlayImage"] {
  if (
    !input.slide.overlayImage?.enabled ||
    !input.slide.overlayImage.collectionId
  ) {
    return undefined
  }
  const images = imagesForCollectionIds({
    collections: input.collections,
    collectionIds: [input.slide.overlayImage.collectionId],
    useFallback: false,
  })
  const image = images[input.slideIndex % Math.max(1, images.length)]
  if (!image) {
    return undefined
  }

  return {
    imageUrl: image.imageUrl,
    imageCaption: image.imageCaption,
    padding: Math.max(0, input.slide.overlayImage.height),
  }
}

function createSlides(input: {
  title: string
  hook: string
  images: AutomationRunnerImage[]
  imageCollections: Awaited<ReturnType<typeof readImageCollections>>
  slideCount: number
  textAutomation?: ReturnType<
    typeof automationSchemaToTempSlideTestingAutomation
  >
  generatedText?: TempSlideStructuredOutput
  random?: () => number
}): AutomationRunSlide[] {
  const specs: TempSlideSpec[] =
    input.textAutomation?.slides ??
    Array.from({ length: input.slideCount }, (_, index) => ({
      id: `slide-${index + 1}`,
      index,
      section: index === 0 ? "hook" : "content",
      title: index === 0 ? "Hook" : `Content ${index}`,
      aspectRatio: "9:16",
      imageGrid: "none",
      overlay: false,
      displayText: true,
      collectionId: "",
      textItems: [],
    }))
  const selectedImages = chooseImages(input.images, specs.length, input.random)
  return specs.flatMap((slide, index) => {
    const image = selectedImages[index]
    if (!image) {
      return []
    }
    const textItems = automationSlideTextItems({
      title: input.title,
      hook: input.hook,
      slide: input.textAutomation?.slides[index],
      generatedText: input.generatedText,
    })
    const text = textItems[0]?.text || input.hook || input.title

    return [
      {
        id: `slide-${index + 1}`,
        role:
          slide.section === "cta"
            ? "cta"
            : slide.section === "hook"
              ? "hook"
              : "content",
        imageUrl: image.imageUrl,
        imageCaption: image.imageCaption,
        text,
        textPlacement: "top",
        aspectRatio: slide.aspectRatio,
        imageGrid: slide.imageGrid,
        overlay: slide.overlay,
        overlayImage: overlayImageForSlide({
          collections: input.imageCollections,
          slide,
          slideIndex: index,
        }),
        displayText: slide.displayText,
        textItems,
      },
    ]
  })
}

function automationSlideTextItems(input: {
  title: string
  hook: string
  slide?: TempSlideSpec
  generatedText?: TempSlideStructuredOutput
}): SlideshowTextItem[] {
  if (!input.slide || input.slide.section === "hook") {
    const textItem = input.slide?.textItems[0]
    return [
      slideshowTextItemFromTempTextItem({
        textItem,
        text: input.hook,
        fallbackId: "hook-text",
      }),
    ]
  }

  if (!input.slide.displayText) {
    return []
  }

  const textItems = input.slide.textItems.flatMap((textItem, index) => {
    const text =
      textItem.textMode === "static"
        ? textItem.staticText || input.title
        : input.generatedText?.text[textItem.id] ||
          textItem.contentDirection ||
          input.title
    if (!text.trim()) {
      return []
    }
    return [
      slideshowTextItemFromTempTextItem({
        textItem,
        text,
        fallbackId: `text-${index + 1}`,
      }),
    ]
  })

  if (textItems.length > 0) {
    return textItems
  }

  return [
    slideshowTextItemFromTempTextItem({
      textItem: undefined,
      text: input.title,
      fallbackId: "fallback-text",
    }),
  ]
}

function automationRunSlidesToSlideshowSlides(
  schema: AutomationSchema,
  plan: AutomationRunPlan
): SlideshowSlide[] {
  const settings = automationSlideshowSettings(schema)
  return plan.slides.map((slide, index) => {
    const section = automationFormatSection(
      schema,
      slide.role === "hook" ? "hook" : slide.role === "cta" ? "cta" : "content"
    )
    const textItem = section.textItems[0]
    const text = slide.text || plan.hook || schema.title
    const textPosition = textItemPosition(textItem, slide.role === "hook")
    const textItems = slide.textItems?.length
      ? slide.textItems
      : section.noText
        ? []
        : [
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
          ]

    return {
      id: slide.id || `slide-${index + 1}`,
      image_url: slide.imageUrl,
      overlayImage: slide.overlayImage
        ? {
            image_url: slide.overlayImage.imageUrl,
            padding: slide.overlayImage.padding,
          }
        : undefined,
      aspect_ratio: slide.aspectRatio || section.aspect_ratio || "9:16",
      time_length_ms: Math.max(1, settings.duration) * 1000,
      textItems,
    }
  })
}

function slideshowTextItemFromTempTextItem(input: {
  textItem: TempSlideSpec["textItems"][number] | undefined
  text: string
  fallbackId: string
}): SlideshowTextItem {
  return {
    id: input.textItem?.itemId || input.textItem?.id || input.fallbackId,
    text: input.text,
    font: input.textItem?.font || "TikTok Display Medium",
    fontSize: input.textItem?.fontSize || "10px",
    textSize: {
      width: textItemWidth(input.textItem?.textItemWidth, input.text),
      height: 18,
    },
    textStyle: input.textItem?.textStyle || "outline",
    textAlign: input.textItem?.textAlign || "center",
    textAnchor: input.textItem?.textAnchor || "padded",
    textPosition: tempTextItemPosition(input.textItem),
  }
}

function automationSlideshowSettings(schema: AutomationSchema) {
  const content = automationFormatSection(schema, "content")
  const tiktok = schema.tiktok_post_settings
  return defaultSlideshowSettings({
    duration: slideshowDurationValue(tiktok.slideshow_slide_duration),
    background_color: "#000000",
    is_bg_overlay_on: content.overlay,
    transition_style:
      clean(tiktok.slideshow_transition_style) || defaultSlideshowTransition,
    background_opacity:
      schema.image_collection_ids.background_opacity ??
      content.overlayOpacity ??
      40,
    is_bg_overlay_on_hook_image: Boolean(
      schema.image_collection_ids.is_bg_overlay_on_hook_image
    ),
    export_as_video: automationPublishType(schema) === "video",
    sound_id: clean(tiktok.slideshow_sound_id),
    sound_name: clean(tiktok.slideshow_sound_name),
    sound_url: clean(tiktok.slideshow_sound_url),
  })
}

function automationSlideshowPrompt(schema: AutomationSchema, hook: string) {
  return [
    schema.prompt_formatting.narrative,
    schema.prompt_formatting.style,
    hook ? `Hook: ${hook}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

function textItemPosition(
  textItem:
    ReturnType<typeof automationFormatSection>["textItems"][number] | undefined,
  preferTop: boolean
) {
  const y =
    textItem?.textPosition === "bottom"
      ? 82
      : textItem?.textPosition === "center" && !preferTop
        ? 45
        : 16
  const x =
    textItem?.textAlign === "left"
      ? 28
      : textItem?.textAlign === "right"
        ? 72
        : 50
  return { x, y }
}

function tempTextItemPosition(
  textItem: TempSlideSpec["textItems"][number] | undefined
) {
  const y =
    textItem?.textPosition === "bottom"
      ? 82
      : textItem?.textPosition === "center"
        ? 45
        : 16
  const x =
    textItem?.textAlign === "left"
      ? 28
      : textItem?.textAlign === "right"
        ? 72
        : 50
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

function slideshowCaption(slides: AutomationRunSlide[], hook: string) {
  const firstHookText =
    slides.find((slide) => slide.role === "hook")?.text || hook
  return firstHookText.toLowerCase()
}

async function readImageCollections(
  imageCollectionDbPath = path.join(
    process.cwd(),
    "data",
    "image-collections.json"
  )
) {
  try {
    const contents = await readFile(imageCollectionDbPath, "utf8")
    const parsed = JSON.parse(contents) as {
      collections?: {
        name?: string
        created_at?: string
        images?: { image_link?: string; caption?: string }[]
      }[]
    }
    return (parsed.collections ?? [])
      .map((collection) => ({
        id: `collection-${slugify(`${clean(collection.name)}-${clean(collection.created_at)}`)}`,
        name: clean(collection.name),
        images: (collection.images ?? []).flatMap((image) => {
          const imageLink = clean(image.image_link)
          return imageLink
            ? [{ image_link: imageLink, caption: clean(image.caption) }]
            : []
        }),
      }))
      .map((collection) => ({
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

function selectRandomIndex(length: number, random = Math.random) {
  if (length <= 1) {
    return 0
  }
  const value = random()
  return Math.min(length - 1, Math.max(0, Math.floor(value * length)))
}

async function readAutomationRuns(
  rootDir = defaultRunRootDir
): Promise<AutomationRunRecord[]> {
  try {
    const contents = await readFile(path.join(rootDir, runsFileName), "utf8")
    const parsed = JSON.parse(contents) as AutomationRunsDb
    return Array.isArray(parsed.runs)
      ? parsed.runs.map(normalizeRun).flatMap((run) => (run ? [run] : []))
      : []
  } catch {
    return []
  }
}

async function writeAutomationRuns(
  rootDir: string,
  runs: AutomationRunRecord[]
) {
  await mkdir(rootDir, { recursive: true })
  await writeFile(
    path.join(rootDir, runsFileName),
    `${JSON.stringify({ runs }, null, 2)}\n`
  )
}

function normalizeRun(run: RawAutomationRunRecord): AutomationRunRecord | null {
  const id = clean(run?.id)
  const automationId = clean(run?.automationId)
  const scheduledFor = clean(run?.scheduledFor)
  if (!id || !automationId || !scheduledFor) {
    return null
  }
  const normalizedRun = {
    ...run,
    id,
    automationId,
    automationTitle: clean(run.automationTitle) || "Automation",
    scheduledFor,
    status: run.status === "failed" ? "failed" : "succeeded",
    createdAt: clean(run.createdAt) || new Date().toISOString(),
    updatedAt:
      clean(run.updatedAt) || clean(run.createdAt) || new Date().toISOString(),
  } as AutomationRunRecord

  return {
    ...normalizedRun,
    plan: normalizeRunPlan(normalizedRun),
  }
}

function normalizeRunPlan(run: AutomationRunRecord): AutomationRunPlan {
  const plan = run.plan
  const hook = clean(plan?.hook) || run.automationTitle
  const title = clean(plan?.title) || run.automationTitle
  return {
    title,
    caption: clean(plan?.caption) || hook.toLowerCase(),
    hashtags: clean(plan?.hashtags),
    hook,
    imageCollectionIds: Array.isArray(plan?.imageCollectionIds)
      ? plan.imageCollectionIds
      : [],
    slides: Array.isArray(plan?.slides) ? plan.slides : [],
    slideCount: plan?.slideCount ?? { mode: "varying" },
    publishType: clean(plan?.publishType) || "slideshow",
    autoMusic: typeof plan?.autoMusic === "boolean" ? plan.autoMusic : true,
    autoPost: typeof plan?.autoPost === "boolean" ? plan.autoPost : false,
    hookCandidates: plan?.hookCandidates,
    textModel: plan?.textModel,
    language: clean(plan?.language) || defaultAutomationLanguage,
    translationProvider: plan?.translationProvider,
    debug: plan?.debug,
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
