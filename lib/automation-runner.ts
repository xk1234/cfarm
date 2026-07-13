import { clean, isRecord } from "@/lib/guards"
import { randomUUID } from "node:crypto"
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
  isAutomationHookInstruction,
  updateAutomationFormatSection,
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
import { publishAutomationRun } from "@/lib/publishing"
import {
  createSlideshowResultRecord,
  defaultSlideshowSettings,
  listSlideshowRecords,
  type SlideshowRecord,
  type SlideshowSlide,
  type SlideshowTextItem,
} from "@/lib/slideshows"
import { slideshowTextPositionX } from "@/lib/slideshow-renderer"
import type { ResultRecord, ResultStatus } from "@/lib/results"
import {
  automationSchemaToTempSlideTestingAutomation,
  type TempSlideSpec,
  type TempSlideStructuredOutput,
} from "@/lib/temp-slide-testing"
import {
  hasNearDuplicateText,
  normalizedTextSignature,
} from "@/lib/text-similarity"
import {
  expandAllHookCombinations,
  type HookExpansionResult,
} from "@/lib/hook-expansion"
import {
  appendUsageRecords,
  recentUsageRecords,
  recentUsageKeys,
  usageKeyForHook,
  usageKeyForHookCombination,
  type UsageRecord,
} from "@/lib/usage-ledger"
import { listWordCollections } from "@/lib/word-collections"
import {
  knowledgeContext,
  knowledgeContextPrompt,
  listKnowledgeBases,
} from "@/lib/knowledge-bases"
import { selectSlideshowImageWithAi } from "@/lib/slideshow-image-matching"
import { benchmarkAndStoreGeneratedSlideshow } from "@/lib/slideshow-benchmarks"
import {
  readJsonArrayStore,
  withJsonArrayStore,
  writeJsonArrayStore,
} from "@/lib/json-store"

// A run's terminal states are exactly a result's outcomes, plus "running".
export type AutomationRunStatus = ResultStatus | "running"

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
  benchmarkId?: string
  benchmarkError?: string
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
  hookTemplate?: string
  hookSubstitutions?: Record<string, string>
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
  reuseWarnings?: AutomationRunReuseWarning[]
  hookCandidates?: string[]
  textModel?: string
  language: string
  translationProvider?: "deepl"
  debug?: {
    selectedHookIndex?: number
    textGenerationError?: string
    textSimilarityRetry?: boolean
    textModelPrompt?: SlideshowTextGenerationResult["promptPayload"]
    textGenerationResult?: TempSlideStructuredOutput
  }
}

export type AutomationRunReuseWarning = {
  kind: "image"
  key: string
  slideId?: string
  lastUsedAt?: string
  reason: string
}

export type AutomationRunSlide = {
  id: string
  role: "hook" | "content" | "cta"
  imageUrl: string
  imageKey?: string
  imageCaption: string
  overlayImage?: {
    imageUrl: string
    imageCaption: string
    padding: number
  }
  text: string
  textPlacement: NonNullable<SlideshowTextItem["textPlacement"]>
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
  key: string
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
    reason:
      | "not_live"
      | "not_due"
      | "already_ran"
      | "no_images"
      | "insufficient_unique_images"
      | "hooks_exhausted"
    scheduledFor?: string
  }[]
}

class HookCombinationsExhaustedError extends Error {
  readonly reason = "hooks_exhausted" as const

  constructor() {
    super("No unused hook combinations remain for this automation.")
    this.name = "HookCombinationsExhaustedError"
  }
}

class InsufficientUniqueImagesError extends Error {
  readonly reason = "insufficient_unique_images" as const

  constructor(required: number, available: number) {
    super(
      `This slideshow needs ${required} unique images, but only ${available} are available.`
    )
    this.name = "InsufficientUniqueImagesError"
  }
}

type RawAutomationRunRecord = Omit<
  Partial<AutomationRunRecord>,
  "status" | "plan"
> & {
  status?: unknown
  plan?: Partial<AutomationRunPlan>
}

const defaultAutomationRootDir = path.join(process.cwd(), "data", "automations")
const defaultRunRootDir = path.join(process.cwd(), "data", "automations")
const runsFileName = "runs.json"
const runningClaimGuardMinutes = 10

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
  const runRootDir = input.runRootDir ?? defaultRunRootDir
  const runs = await readAutomationRuns(runRootDir)
  const now = Date.now()
  let reconciled = false
  const settledRuns = runs.map((run) => {
    if (run.status !== "running") return run
    const updatedAt = new Date(run.updatedAt || run.createdAt).getTime()
    if (
      Number.isFinite(updatedAt) &&
      now - updatedAt >= runningClaimGuardMinutes * 60 * 1000
    ) {
      reconciled = true
      return {
        ...run,
        status: "failed" as const,
        error: "Generation timed out before completion",
        updatedAt: new Date(now).toISOString(),
      }
    }
    return run
  })
  if (reconciled) {
    await writeAutomationRuns(runRootDir, settledRuns)
  }
  const filteredRuns = input.automationId
    ? settledRuns.filter((run) => run.automationId === input.automationId)
    : settledRuns
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
    wordCollectionRootDir?: string
    usageLedgerRootDir?: string
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
  const usageLedgerRootDir =
    input.usageLedgerRootDir ??
    (input.runRootDir
      ? path.join(input.runRootDir, "usage-ledger")
      : input.postfastRootDir
        ? path.join(input.postfastRootDir, "usage-ledger")
        : undefined)
  const records = await listAutomationRecords({
    rootDir: input.automationRootDir ?? defaultAutomationRootDir,
  })
  const result: AutomationRunResult = { created: [], results: [], skipped: [] }

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
      : dueAutomationSlots(record.schema, now, lookbackMinutes, input.random)
    if (dueSlots.length === 0) {
      result.skipped.push({ automationId: record.id, reason: "not_due" })
      continue
    }

    for (const scheduledFor of dueSlots) {
      const effectiveRecord =
        input.schemaOverride && input.automationId === record.id
          ? { ...record, schema: input.schemaOverride }
          : record
      const imageCollections = await readImageCollections(
        input.imageCollectionDbPath
      )
      if (
        imagesForCollectionIds({
          collections: imageCollections,
          collectionIds: automationCollectionIds(effectiveRecord.schema),
        }).length === 0
      ) {
        result.skipped.push({
          automationId: record.id,
          reason: "no_images",
          scheduledFor,
        })
        continue
      }
      const claim = await claimAutomationRunSlot({
        runRootDir,
        record: effectiveRecord,
        scheduledFor,
        now,
        force: Boolean(input.force),
      })
      if (!claim.run) {
        result.skipped.push({
          automationId: record.id,
          reason: "already_ran",
          scheduledFor,
        })
        continue
      }

      const priorRuns = await readAutomationRuns(runRootDir)
      const recentImageKeys = recentRunImageKeys(priorRuns, record.id)
      const priorHooks = priorSuccessfulHookUsage(priorRuns, record.id)
      const createdRun = await createAutomationRun({
        claimedRun: claim.run,
        record: effectiveRecord,
        postfastRootDir: input.postfastRootDir,
        slideshowRootDir,
        resultRootDir,
        imageCollectionDbPath: input.imageCollectionDbPath,
        wordCollectionRootDir: input.wordCollectionRootDir,
        usageLedgerRootDir,
        recentImageKeys,
        usedHookKeys: priorHooks.hooks,
        usedHookCombinationKeys: priorHooks.combinations,
        now,
        random: input.random,
      }).catch(async (error) => {
        await updateAutomationRun(
          runRootDir,
          failedClaimedAutomationRun(claim.run!, error)
        )
        throw error
      })
      const run = createdRun.run
      if (run.status === "failed") {
        result.skipped.push({
          automationId: record.id,
          reason: createdRun.failureReason ?? "no_images",
          scheduledFor,
        })
      }
      await updateAutomationRun(runRootDir, run)
      result.created.push(run)
      if (createdRun.result) {
        result.results.push(createdRun.result)
      }
    }
  }

  return result
}

export async function previewAutomationRunPlan(
  schema: AutomationSchema,
  input: {
    automationId?: string
    imageCollectionDbPath?: string
    wordCollectionRootDir?: string
    usageLedgerRootDir?: string
    now?: Date
    random?: () => number
    textModel?: string
    systemPrompt?: string
    promptInstructions?: string
    includeTextGenerationResult?: boolean
  } = {}
) {
  // Keep debug/benchmark previews on the exact planner used by persisted
  // automation runs. Previewing may omit write-side effects, but it must not
  // grow a separate slideshow generation implementation.
  const plan = await createAutomationRunPlan(schema, input)
  const status: Exclude<AutomationRunStatus, "running"> =
    plan.slides.length > 0 ? "succeeded" : "failed"

  return {
    status,
    error:
      status === "failed"
        ? "No images available for automation collections"
        : undefined,
    plan,
  }
}

function dueAutomationSlots(
  schema: AutomationSchema,
  now: Date,
  lookbackMinutes: number,
  random: () => number = Math.random
) {
  if (schema.schedule.paused) {
    return []
  }
  const zone = schema.schedule.timezone || DateTime.local().zoneName
  const nowLocal = DateTime.fromJSDate(now, { zone })
  const earliest = nowLocal.minus({ minutes: lookbackMinutes })
  const jitterMinutes = Math.max(0, Number(schema.schedule.jitter_minutes) || 0)
  const explicitSlots = schema.schedule.posting_times.flatMap((postingTime) => {
    if (postingTime.enabled === false) {
      return []
    }
    return dueSlotForDays({
      nowLocal,
      earliest,
      time: postingTime.time,
      days: postingTime.days,
      jitterMinutes,
      random,
    })
  })
  const intervalSlots = intervalScheduleSlots({
    schema,
    nowLocal,
    earliest,
    jitterMinutes,
    random,
  })

  return [...explicitSlots, ...intervalSlots].filter((value): value is string =>
    Boolean(value)
  )
}

function dueSlotForDays(input: {
  nowLocal: DateTime
  earliest: DateTime
  time: string
  days: AutomationSchema["schedule"]["posting_times"][number]["days"]
  jitterMinutes: number
  random: () => number
}) {
  const day = input.nowLocal.toFormat("ccc")
  if (!input.days.includes(day as never)) {
    return []
  }

  const baseSlot = parseLocalSlot(input.nowLocal, input.time)
  if (!baseSlot || baseSlot > input.nowLocal || baseSlot < input.earliest) {
    return []
  }

  const scheduledSlot = applyJitter(baseSlot, input.jitterMinutes, input.random)
  return [
    scheduledSlot.toUTC().toISO({ suppressMilliseconds: false }) ??
      scheduledSlot.toUTC().toISO(),
  ]
}

function intervalScheduleSlots(input: {
  schema: AutomationSchema
  nowLocal: DateTime
  earliest: DateTime
  jitterMinutes: number
  random: () => number
}) {
  const interval = input.schema.schedule.interval
  if (!interval || interval.enabled === false) {
    return []
  }
  const day = input.nowLocal.toFormat("ccc")
  if (!interval.days.includes(day as never)) {
    return []
  }
  const start = parseLocalSlot(input.nowLocal, interval.start_time)
  const end = parseLocalSlot(input.nowLocal, interval.end_time)
  if (!start || !end || end < start) {
    return []
  }

  const slots: string[] = []
  let slot = start
  while (slot <= end) {
    if (slot <= input.nowLocal && slot >= input.earliest) {
      const scheduledSlot = applyJitter(slot, input.jitterMinutes, input.random)
      const iso =
        scheduledSlot.toUTC().toISO({ suppressMilliseconds: false }) ??
        scheduledSlot.toUTC().toISO()
      if (iso) {
        slots.push(iso)
      }
    }
    slot = slot.plus({ hours: interval.every_n_hours })
  }
  return slots
}

function applyJitter(
  slot: DateTime,
  jitterMinutes: number,
  random: () => number
) {
  if (jitterMinutes <= 0) {
    return slot
  }
  const offset = Math.round((random() * 2 - 1) * jitterMinutes)
  return slot.plus({ minutes: offset })
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
  claimedRun: AutomationRunRecord
  record: AutomationRecord
  postfastRootDir?: string
  slideshowRootDir?: string
  resultRootDir?: string
  imageCollectionDbPath?: string
  wordCollectionRootDir?: string
  usageLedgerRootDir?: string
  recentImageKeys?: Set<string>
  usedHookKeys?: Set<string>
  usedHookCombinationKeys?: Set<string>
  now: Date
  random?: () => number
}) {
  const now = new Date().toISOString()
  let plan: AutomationRunPlan
  try {
    plan = await createAutomationRunPlan(input.record.schema, {
      automationId: input.record.id,
      imageCollectionDbPath: input.imageCollectionDbPath,
      wordCollectionRootDir: input.wordCollectionRootDir,
      usageLedgerRootDir: input.usageLedgerRootDir,
      recentImageKeys: input.recentImageKeys,
      usedHookKeys: input.usedHookKeys,
      usedHookCombinationKeys: input.usedHookCombinationKeys,
      now: input.now,
      random: input.random,
    })
  } catch (error) {
    if (
      error instanceof HookCombinationsExhaustedError ||
      error instanceof InsufficientUniqueImagesError
    ) {
      return {
        run: failedClaimedAutomationRun(input.claimedRun, error),
        failureReason: error.reason,
      }
    }
    throw error
  }
  const status: AutomationRunStatus =
    plan.slides.length > 0 ? "succeeded" : "failed"
  const run: AutomationRunRecord = {
    ...input.claimedRun,
    automationTitle: input.record.schema.title || input.record.name,
    status,
    plan,
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
    settings: automationSlideshowSettings(input.record.schema),
    images: automationRunSlidesToSlideshowSlides(input.record.schema, plan),
  })

  let benchmarkId: string | undefined
  let benchmarkError: string | undefined
  try {
    const benchmark = await benchmarkAndStoreGeneratedSlideshow({
      slideshowId: slideshow.id,
      runId: run.id,
      automationId: input.record.id,
      title: slideshow.title,
      icp: [
        input.record.schema.title || input.record.name,
        input.record.schema.prompt_formatting.narrative,
        plan.hook ? `Hook topic: ${plan.hook}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      slides: slideshow.output_images.map((imageUrl, index) => ({
        id: `${slideshow.id}-slide-${index + 1}`,
        imageUrl,
        text: plan.slides[index]?.text || "",
        role: plan.slides[index]?.role,
      })),
    })
    benchmarkId = benchmark.id
  } catch (error) {
    benchmarkError =
      error instanceof Error ? error.message : "Slideshow benchmark failed"
  }

  const runWithSlideshowId = {
    ...run,
    slideshowId: slideshow.id,
    videoUrl: slideshow.video_url,
    thumbnailUrl: slideshow.thumbnail_url,
    outputImages: slideshow.output_images,
    outputDir: slideshow.output_dir,
    benchmarkId,
    benchmarkError,
  }

  // A8.1 — auto-publish. When the automation has auto_post enabled and at least
  // one active integration, publish the run through the shared publishing seam.
  // Publishing must never fail the run; failures are recorded on the post record
  // and surface through socialStatusesForRun below.
  // NOTE: binary media upload (rendered slides -> PostFast media keys, via the
  // /api/postfast/upload path) is a follow-up; content is posted from caption +
  // hashtags today and media is threaded through once upload is wired.
  if (plan.autoPost) {
    const activeIntegrations = input.record.schema.social_integrations.filter(
      (integration) => integration.integration_id && !integration.disabled
    )
    if (activeIntegrations.length > 0) {
      try {
        await publishAutomationRun({
          runId: run.id,
          integrations: activeIntegrations,
          content: automationPublishContent(plan),
          postfastRootDir: input.postfastRootDir,
        })
      } catch {
        // Swallow: socialStatusesForRun will show queued/failed appropriately.
      }
    }
  }

  const runWithStatuses = {
    ...runWithSlideshowId,
    socialStatuses: await socialStatusesForRun({
      run: runWithSlideshowId,
      schema: input.record.schema,
      postfastRootDir: input.postfastRootDir,
    }),
  }
  await recordRunUsage({
    runId: run.id,
    automationId: input.record.id,
    plan,
    rootDir: input.usageLedgerRootDir,
    usedAt: input.now.toISOString(),
  })

  return {
    run: runWithRenderedSlides(runWithStatuses, slideshow),
    result,
  }
}

function automationPublishContent(plan: AutomationRunPlan): string {
  const caption = clean(plan.caption) || clean(plan.hook) || clean(plan.title)
  const hashtags = clean(plan.hashtags)
  if (hashtags && !caption.includes(hashtags)) {
    return `${caption}\n\n${hashtags}`.trim()
  }
  return caption
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
    automationId?: string
    imageCollectionDbPath?: string
    wordCollectionRootDir?: string
    usageLedgerRootDir?: string
    recentImageKeys?: Set<string>
    usedHookKeys?: Set<string>
    usedHookCombinationKeys?: Set<string>
    now?: Date
    random?: () => number
    textModel?: string
    systemPrompt?: string
    promptInstructions?: string
    includeTextGenerationResult?: boolean
  } = {}
): Promise<AutomationRunPlan> {
  const configuredContent = automationFormatSection(schema, "content")
  const slideCountMode = configuredContent.slideCountMode ?? "static"
  const {
    count: selectedContentSlideCount,
    min: slideCountMin,
    max: slideCountMax,
  } = selectContentSlideCount({
    mode: slideCountMode,
    count: configuredContent.slideCount,
    min: configuredContent.slideCountMin,
    max: configuredContent.slideCountMax,
    random: options.random,
  })
  if (selectedContentSlideCount !== configuredContent.slideCount) {
    const hookCount = automationFormatSection(schema, "hook").slideCount
    const ctaCount = automationFormatSection(schema, "cta").slideCount
    schema = {
      ...updateAutomationFormatSection(schema, "content", {
        slideCount: selectedContentSlideCount,
      }),
      prompt_formatting: {
        ...schema.prompt_formatting,
        num_of_slides: Math.max(
          1,
          hookCount + selectedContentSlideCount + ctaCount
        ),
      },
    }
  }
  const collectionIds = automationCollectionIds(schema)
  const slideCount = automationTotalSlideCount(schema)
  const hookCandidates = automationHooks(schema)
  const hookSelection = await selectAutomationHook({
    schema,
    hookCandidates,
    automationId: options.automationId,
    wordCollectionRootDir: options.wordCollectionRootDir,
    usageLedgerRootDir: options.usageLedgerRootDir,
    usedHookKeys: options.usedHookKeys,
    usedHookCombinationKeys: options.usedHookCombinationKeys,
    now: options.now,
    random: options.random,
  })
  const hook = applyHookTextDirection(
    hookSelection.expansion.text || schema.title,
    automationFormatSection(schema, "hook").textItems[0]?.contentDirection
  )
  const textAutomation = automationSchemaToTempSlideTestingAutomation(schema)
  const selectedKnowledgeIds = schema.knowledge_base_ids ?? []
  const selectedKnowledgeContext = selectedKnowledgeIds.length
    ? knowledgeContext(await listKnowledgeBases(), selectedKnowledgeIds)
    : ""
  const promptInstructions = [
    options.promptInstructions,
    knowledgeContextPrompt(selectedKnowledgeContext),
  ]
    .filter(Boolean)
    .join("\n\n")
  const recentTextRecords = options.automationId
    ? await recentUsageRecords("text", options.automationId, {
        rootDir: options.usageLedgerRootDir,
        withinDays: schema.reuse_policy?.text_exclusion_days ?? 45,
        limit: schema.reuse_policy?.text_exclusion_limit ?? 20,
        now: options.now,
      })
    : []
  let textGeneration = await generateAutomationText({
    automation: textAutomation,
    hook,
    model: options.textModel,
    systemPrompt: options.systemPrompt,
    promptInstructions,
  })
  let textSimilarityRetry = false
  if (
    textGeneration &&
    hasNearDuplicateText(
      textUsageKeyFromGeneratedOutput(textGeneration.result),
      recentTextRecords.map((record) => record.key),
      { threshold: schema.reuse_policy?.text_similarity_threshold ?? 0.85 }
    )
  ) {
    const retry = await generateAutomationText({
      automation: textAutomation,
      hook,
      avoidSimilarOutputs: recentTextRecords.map((record) => record.key),
      model: options.textModel,
      systemPrompt: options.systemPrompt,
      promptInstructions,
    })
    if (retry) {
      textGeneration = retry
      textSimilarityRetry = true
    }
  }
  const textGenerationError = textGeneration
    ? undefined
    : "OPENROUTER_API_KEY is not configured"
  const imageCollections = await readImageCollections(
    options.imageCollectionDbPath
  )
  const images = imagesForCollectionIds({
    collections: imageCollections,
    collectionIds,
  })
  const recentImageRecords = options.automationId
    ? await recentUsageRecords("image", options.automationId, {
        rootDir: options.usageLedgerRootDir,
        withinDays: schema.reuse_policy?.image_exclusion_days ?? 45,
        limit: schema.reuse_policy?.image_exclusion_limit ?? 20,
        now: options.now,
      })
    : []
  const recentImages = new Map(
    recentImageRecords.map((record) => [record.key, record.used_at] as const)
  )
  for (const key of options.recentImageKeys ?? []) {
    if (!recentImages.has(key)) {
      recentImages.set(
        key,
        options.now?.toISOString() ?? new Date().toISOString()
      )
    }
  }
  const slideResult = await createSlides({
    title: schema.title,
    hook,
    images,
    recentImageUsage: recentImages,
    imageCollections,
    slideCount,
    textAutomation,
    generatedText: textGeneration?.result,
    random: options.random,
  })
  const slides = await translateAutomationSlides({
    language: schema.image_collection_ids.language || defaultAutomationLanguage,
    slides: slideResult.slides,
  })
  const caption =
    clean(textGeneration?.result.caption) || slideshowCaption(slides, hook)
  const hashtags =
    clean(textGeneration?.result.hashtags) || fallbackHashtags(schema.title)

  return {
    title: clean(textGeneration?.result.title) || schema.title,
    caption,
    hashtags,
    hook,
    hookTemplate: hookSelection.expansion.template,
    hookSubstitutions: hookSelection.expansion.substitutions,
    imageCollectionIds: collectionIds,
    slides,
    slideCount: {
      mode: slideCountMode,
      count: slideCount,
      min: slideCountMin,
      max: slideCountMax,
    },
    publishType: automationPublishType(schema),
    autoMusic: schema.tiktok_post_settings.auto_music,
    autoPost: schema.tiktok_post_settings.auto_post,
    reuseWarnings: slideResult.reuseWarnings,
    hookCandidates,
    textModel: textGeneration?.model,
    language: schema.image_collection_ids.language || defaultAutomationLanguage,
    translationProvider: deeplTargetLanguage(
      schema.image_collection_ids.language || defaultAutomationLanguage
    )
      ? "deepl"
      : undefined,
    debug: {
      selectedHookIndex: hookSelection.index,
      textGenerationError,
      textSimilarityRetry,
      textModelPrompt: textGeneration?.promptPayload,
      textGenerationResult: options.includeTextGenerationResult
        ? textGeneration?.result
        : undefined,
    },
  }
}

export function applyHookTextDirection(
  text: string,
  direction: string | undefined
) {
  const instruction = clean(direction)
  let result = clean(text)

  if (/\ball\s+lowercase\b|\blower\s*case\b/i.test(instruction)) {
    result = result.toLowerCase()
  }

  const underWords = instruction.match(/\bunder\s+(\d+)\s+words?\b/i)
  if (underWords) {
    const exclusiveLimit = Number(underWords[1])
    if (Number.isFinite(exclusiveLimit) && exclusiveLimit > 1) {
      result = result
        .split(/\s+/)
        .slice(0, exclusiveLimit - 1)
        .join(" ")
    }
  }

  return result
}

export function selectContentSlideCount(input: {
  mode: "static" | "varying"
  count: number
  min?: number
  max?: number
  random?: () => number
}) {
  const min = Math.max(1, Math.round(input.min ?? input.count))
  const max = Math.max(min, Math.round(input.max ?? input.count))
  if (input.mode === "static") {
    return { count: Math.max(1, Math.round(input.count)), min, max }
  }

  const randomValue = Math.min(
    1 - Number.EPSILON,
    Math.max(0, (input.random ?? Math.random)())
  )
  return {
    count: min + Math.floor(randomValue * (max - min + 1)),
    min,
    max,
  }
}

async function selectAutomationHook(input: {
  schema: AutomationSchema
  hookCandidates: string[]
  automationId?: string
  wordCollectionRootDir?: string
  usageLedgerRootDir?: string
  usedHookKeys?: Set<string>
  usedHookCombinationKeys?: Set<string>
  now?: Date
  random?: () => number
}): Promise<{ expansion: HookExpansionResult; index: number }> {
  const random = input.random ?? Math.random
  const candidates =
    input.hookCandidates.length > 0
      ? input.hookCandidates
      : [input.schema.title]
  const wordCollections = await listWordCollections({
    rootDir: input.wordCollectionRootDir,
  })
  const recentHooks = input.automationId
    ? await recentUsageKeys("hook", input.automationId, {
        rootDir: input.usageLedgerRootDir,
        allTime: true,
        now: input.now,
      })
    : new Set<string>()
  const recentCombinations = input.automationId
    ? await recentUsageKeys("hook_combination", input.automationId, {
        rootDir: input.usageLedgerRootDir,
        allTime: true,
        now: input.now,
      })
    : new Set<string>()

  const usedHooks = new Set([...recentHooks, ...(input.usedHookKeys ?? [])])
  const usedCombinations = new Set([
    ...recentCombinations,
    ...(input.usedHookCombinationKeys ?? []),
  ])
  const expanded = candidates.flatMap((candidate, index) =>
    expandAllHookCombinations(
      candidate,
      input.schema.hook_slots,
      wordCollections
    ).map((expansion) => ({ expansion, index }))
  )
  const available = expanded.filter(({ expansion }) => {
    const hookKey = usageKeyForHook(expansion.text)
    const combinationKey = usageKeyForHookCombination(
      expansion.template,
      expansion.substitutions
    )
    return (
      !usedHooks.has(hookKey) &&
      (!Object.keys(expansion.substitutions).length ||
        !usedCombinations.has(combinationKey))
    )
  })

  if (available.length === 0) {
    throw new HookCombinationsExhaustedError()
  }

  return available[selectRandomIndex(available.length, random)]
}

async function recordRunUsage(input: {
  rootDir?: string
  automationId: string
  runId: string
  plan: AutomationRunPlan
  usedAt?: string
}) {
  const usedAt = input.usedAt ?? new Date().toISOString()
  const records: UsageRecord[] = []
  if (!isAutomationHookInstruction(input.plan.hook)) {
    records.push({
      automation_id: input.automationId,
      kind: "hook",
      key: usageKeyForHook(input.plan.hook),
      run_id: input.runId,
      used_at: usedAt,
    })
  }
  if (
    input.plan.hookTemplate &&
    input.plan.hookSubstitutions &&
    Object.keys(input.plan.hookSubstitutions).length > 0
  ) {
    records.push({
      automation_id: input.automationId,
      kind: "hook_combination",
      key: usageKeyForHookCombination(
        input.plan.hookTemplate,
        input.plan.hookSubstitutions
      ),
      run_id: input.runId,
      used_at: usedAt,
    })
  }
  for (const slide of input.plan.slides) {
    const imageKey = slide.imageKey || slide.imageUrl
    if (!imageKey) {
      continue
    }
    records.push({
      automation_id: input.automationId,
      kind: "image",
      key: imageKey,
      run_id: input.runId,
      used_at: usedAt,
    })
  }
  const textKey = textUsageKeyFromPlan(input.plan)
  if (textKey) {
    records.push({
      automation_id: input.automationId,
      kind: "text",
      key: textKey,
      run_id: input.runId,
      used_at: usedAt,
    })
  }
  await appendUsageRecords({ rootDir: input.rootDir, records })
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
  avoidSimilarOutputs?: string[]
  model?: string
  systemPrompt?: string
  promptInstructions?: string
}) {
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) {
    return null
  }

  return generateSlideshowText({
    automation: input.automation,
    model: input.model || defaultSlideshowTextModel,
    systemPrompt: input.systemPrompt,
    promptInstructions: input.promptInstructions,
    selectedHook: input.hook,
    avoidSimilarOutputs: input.avoidSimilarOutputs,
    apiKey,
  })
}

function textUsageKeyFromGeneratedOutput(output: TempSlideStructuredOutput) {
  return normalizedTextSignature([
    output.title,
    output.caption,
    ...Object.values(output.text),
  ])
}

function textUsageKeyFromPlan(plan: AutomationRunPlan) {
  return normalizedTextSignature([
    plan.title,
    plan.caption,
    ...plan.slides.map((slide) => slide.text),
  ])
}

function imagesForCollectionIds(input: {
  collections: Awaited<ReturnType<typeof readImageCollections>>
  collectionIds: string[]
}): AutomationRunnerImage[] {
  const requested = new Set(input.collectionIds)
  if (requested.size === 0) {
    return []
  }

  return input.collections
    .filter((collection) =>
      collection.aliases.some((alias) => requested.has(alias))
    )
    .flatMap((collection) =>
      collection.images.map((image, index) => ({
        id: `${collection.id}-${index}`,
        key: image.hash || image.image_link,
        imageUrl: image.image_link,
        imageCaption: image.caption,
      }))
    )
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

async function createSlides(input: {
  title: string
  hook: string
  images: AutomationRunnerImage[]
  recentImageUsage?: Map<string, string>
  imageCollections: Awaited<ReturnType<typeof readImageCollections>>
  slideCount: number
  textAutomation?: ReturnType<
    typeof automationSchemaToTempSlideTestingAutomation
  >
  generatedText?: TempSlideStructuredOutput
  random?: () => number
}): Promise<{
  slides: AutomationRunSlide[]
  reuseWarnings: AutomationRunReuseWarning[]
}> {
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
  const selectedImages = await selectImagesForSlides({
    ...input,
    specs,
  })
  if (selectedImages.length < specs.length) {
    throw new InsufficientUniqueImagesError(specs.length, selectedImages.length)
  }
  const reuseWarnings: AutomationRunReuseWarning[] = []
  const slides = specs.flatMap((slide, index) => {
    const image = selectedImages[index]
    if (!image) {
      return []
    }
    const textItems = automationSlideTextItems({
      title: input.title,
      hook: input.hook,
      slide: input.textAutomation?.slides[index],
      imageCaption: image.imageCaption,
      generatedText: input.generatedText,
    })
    const text =
      textItems[0]?.text ||
      fallbackSlideText({
        section: slide.section,
        hook: input.hook,
        title: input.title,
        imageCaption: image.imageCaption,
      })

    const slideId = `slide-${index + 1}`
    if (image.reusedRecently) {
      reuseWarnings.push({
        kind: "image",
        key: image.key,
        slideId,
        lastUsedAt: image.lastUsedAt,
        reason: "Fresh image pool exhausted; reused least-recently-used image.",
      })
    }
    const role: AutomationRunSlide["role"] =
      slide.section === "cta"
        ? "cta"
        : slide.section === "hook"
          ? "hook"
          : "content"

    return [
      {
        id: slideId,
        role,
        imageUrl: image.imageUrl,
        imageKey: image.key,
        imageCaption: image.imageCaption,
        text,
        textPlacement: textItems[0]?.textPlacement ?? "top",
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
  return { slides, reuseWarnings }
}

async function selectImagesForSlides(input: {
  title: string
  hook: string
  images: AutomationRunnerImage[]
  recentImageUsage?: Map<string, string>
  imageCollections: Awaited<ReturnType<typeof readImageCollections>>
  textAutomation?: ReturnType<
    typeof automationSchemaToTempSlideTestingAutomation
  >
  generatedText?: TempSlideStructuredOutput
  random?: () => number
  specs: TempSlideSpec[]
}) {
  const usedKeys = new Set<string>()
  const usedUrls = new Set<string>()
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  const selected: Array<
    AutomationRunnerImage & { reusedRecently?: boolean; lastUsedAt?: string }
  > = []

  for (const [index, spec] of input.specs.entries()) {
    const sectionImages = spec.collectionId
      ? imagesForCollectionIds({
          collections: input.imageCollections,
          collectionIds: [spec.collectionId],
        })
      : input.images
    const candidates = sectionImages.filter(
      (image) => !usedKeys.has(image.key) && !usedUrls.has(image.imageUrl)
    )
    const fallback = chooseImages(candidates, 1, input.random, {
      recentUsage: input.recentImageUsage,
    })[0]
    if (!fallback) continue

    let image = fallback
    if (spec.aiImageSelection && apiKey) {
      const textItems = automationSlideTextItems({
        title: input.title,
        hook: input.hook,
        slide: input.textAutomation?.slides[index],
        generatedText: input.generatedText,
      })
      const slideText =
        textItems
          .map((item) => item.text)
          .filter(Boolean)
          .join("\n") || (spec.section === "hook" ? input.hook : input.title)
      try {
        const selectedId = await selectSlideshowImageWithAi({
          slideText,
          candidates: candidates.map((candidate) => ({
            id: candidate.id,
            imageUrl: candidate.imageUrl,
            caption: candidate.imageCaption,
          })),
          apiKey,
        })
        const matched = candidates.find(
          (candidate) => candidate.id === selectedId
        )
        if (matched) {
          image = {
            ...matched,
            reusedRecently: input.recentImageUsage?.has(matched.key),
            lastUsedAt: input.recentImageUsage?.get(matched.key),
          }
        }
      } catch {
        // Keep generation reliable: fall back to the normal unique-image picker.
      }
    }

    usedKeys.add(image.key)
    usedUrls.add(image.imageUrl)
    selected.push(image)
  }

  return selected
}

function automationSlideTextItems(input: {
  title: string
  hook: string
  slide?: TempSlideSpec
  imageCaption?: string
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
        ? textItem.staticText
        : input.generatedText?.text[textItem.id] ||
          usablePromptFallback(textItem.contentDirection) ||
          fallbackSlideText({
            section: input.slide?.section,
            hook: input.hook,
            title: input.title,
            imageCaption: input.imageCaption,
          })
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
      textItem: input.slide.textItems[0],
      text: fallbackSlideText({
        section: input.slide.section,
        hook: input.hook,
        title: input.title,
        imageCaption: input.imageCaption,
      }),
      fallbackId: "fallback-text",
    }),
  ]
}

function fallbackSlideText(input: {
  section?: TempSlideSpec["section"]
  hook: string
  title: string
  imageCaption?: string
}) {
  if (input.section === "hook") {
    return input.hook
  }
  if (input.section === "cta") {
    return input.title
  }
  return input.imageCaption || input.hook
}

export function automationRunSlidesToSlideshowSlides(
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
              textVerticalAnchor: textItem?.textVerticalAnchor || "padded",
              textPlacement: slide.textPlacement,
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
      overlay: slide.overlay,
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
  textPlacement?: SlideshowTextItem["textPlacement"]
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
    textVerticalAnchor: input.textItem?.textVerticalAnchor || "padded",
    textPlacement:
      input.textPlacement ?? tempTextPlacement(input.textItem?.textPosition),
    textPosition: tempTextItemPosition(input.textItem),
  }
}

function tempTextPlacement(
  value: TempSlideSpec["textItems"][number]["textPosition"] | undefined
): NonNullable<SlideshowTextItem["textPlacement"]> {
  return value === "bottom" || value === "center" ? value : "top"
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
  const x = slideshowTextPositionX(textItem?.textAlign, textItem?.textAnchor)
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
  const x = slideshowTextPositionX(textItem?.textAlign, textItem?.textAnchor)
  return { x, y }
}

function textItemWidth(value: string | undefined, text: string) {
  const parsed = Number(value?.replace("%", ""))
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
  }
  return Math.max(20, Math.min(100, text.length * 4))
}

export function chooseImages<T extends { key?: string; imageUrl?: string }>(
  items: T[],
  count: number,
  random = Math.random,
  options: { recentUsage?: Map<string, string> } = {}
) {
  if (items.length === 0 || count <= 0) {
    return []
  }

  const recentUsage = options.recentUsage ?? new Map<string, string>()
  const keys = new Set<string>()
  const urls = new Set<string>()
  const uniqueItems = items.filter((item) => {
    if (
      (item.key && keys.has(item.key)) ||
      (item.imageUrl && urls.has(item.imageUrl))
    ) {
      return false
    }
    if (item.key) keys.add(item.key)
    if (item.imageUrl) urls.add(item.imageUrl)
    return true
  })
  const fresh = recentUsage.size
    ? uniqueItems.filter((item) => !item.key || !recentUsage.has(item.key))
    : uniqueItems
  const fallback = uniqueItems
    .filter((item) => item.key && recentUsage.has(item.key))
    .sort(
      (left, right) =>
        Date.parse(recentUsage.get(left.key!) ?? "") -
        Date.parse(recentUsage.get(right.key!) ?? "")
    )
  const freshPool = [...fresh]
  const fallbackPool = [...fallback]
  const selected: (T & { reusedRecently?: boolean; lastUsedAt?: string })[] = []
  while (selected.length < count) {
    if (freshPool.length > 0) {
      const index = Math.min(
        freshPool.length - 1,
        Math.floor(random() * freshPool.length)
      )
      selected.push(freshPool.splice(index, 1)[0])
      continue
    }
    if (fallbackPool.length > 0) {
      const item = fallbackPool.shift()!
      selected.push({
        ...item,
        reusedRecently: true,
        lastUsedAt: item.key ? recentUsage.get(item.key) : undefined,
      })
      continue
    }
    break
  }
  return selected
}

function slideshowCaption(slides: AutomationRunSlide[], hook: string) {
  const firstHookText =
    slides.find((slide) => slide.role === "hook")?.text || hook
  return firstHookText.toLowerCase()
}

function fallbackHashtags(title: string) {
  const topicTags = clean(title)
    .split(/\s+/)
    .map((word) => word.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((word) => word.length > 2 && !["uat", "the", "and"].includes(word))
    .slice(0, 3)
    .map((word) => `#${word}`)
  return [...topicTags, "#slideshow", "#content"].slice(0, 5).join(" ")
}

function usablePromptFallback(value: string) {
  const text = clean(value)
  if (!text || isPlaceholderInstruction(text)) {
    return ""
  }
  return text
}

function isPlaceholderInstruction(value: string) {
  const normalized = value.toLowerCase()
  return (
    normalized.includes("supporting text") ||
    normalized.includes("content varies based on narrative") ||
    normalized.includes("numbered") ||
    normalized.includes("using narratives") ||
    normalized.includes("e.g.")
  )
}

async function readImageCollections(
  imageCollectionDbPath = path.join(
    process.cwd(),
    "data",
    "image-collections.json"
  )
) {
  try {
    const collections = await readJsonArrayStore<{
      name?: string
      created_at?: string
      images?: { image_link?: string; caption?: string; hash?: string }[]
    }>({
      rootDir: path.dirname(imageCollectionDbPath),
      fileName: path.basename(imageCollectionDbPath),
      key: "collections",
    })
    return collections
      .map((collection) => ({
        id: `collection-${slugify(`${clean(collection.name)}-${clean(collection.created_at)}`)}`,
        name: clean(collection.name),
        images: (collection.images ?? []).flatMap((image) => {
          const imageLink = clean(image.image_link)
          return imageLink
            ? [
                {
                  image_link: imageLink,
                  caption: clean(image.caption),
                  hash: clean(image.hash),
                },
              ]
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
            ...(image.hash ? { hash: image.hash } : {}),
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
  return readJsonArrayStore<RawAutomationRunRecord>({
    rootDir,
    fileName: runsFileName,
    key: "runs",
    normalize: normalizeRun,
  }) as Promise<AutomationRunRecord[]>
}

function recentRunImageKeys(runs: AutomationRunRecord[], automationId: string) {
  const keys = new Set<string>()
  for (const run of runs) {
    if (run.automationId !== automationId || run.status === "failed") {
      continue
    }
    for (const slide of run.plan.slides) {
      const key = slide.imageKey || slide.imageUrl
      if (key) {
        keys.add(key)
      }
    }
  }
  return keys
}

function priorSuccessfulHookUsage(
  runs: AutomationRunRecord[],
  automationId: string
) {
  const hooks = new Set<string>()
  const combinations = new Set<string>()
  for (const run of runs) {
    if (run.automationId !== automationId || run.status !== "succeeded") {
      continue
    }
    if (run.plan.hook && !isAutomationHookInstruction(run.plan.hook)) {
      hooks.add(usageKeyForHook(run.plan.hook))
    }
    if (
      run.plan.hookTemplate &&
      run.plan.hookSubstitutions &&
      Object.keys(run.plan.hookSubstitutions).length > 0
    ) {
      combinations.add(
        usageKeyForHookCombination(
          run.plan.hookTemplate,
          run.plan.hookSubstitutions
        )
      )
    }
  }
  return { hooks, combinations }
}

async function writeAutomationRuns(
  rootDir: string,
  runs: AutomationRunRecord[]
) {
  await writeJsonArrayStore({
    rootDir,
    fileName: runsFileName,
    key: "runs",
    records: runs,
  })
}

async function claimAutomationRunSlot(input: {
  runRootDir: string
  record: AutomationRecord
  scheduledFor: string
  now: Date
  force: boolean
}) {
  return withJsonArrayStore<
    RawAutomationRunRecord,
    { run?: AutomationRunRecord }
  >({
    rootDir: input.runRootDir,
    fileName: runsFileName,
    key: "runs",
    normalize: normalizeRun,
    update(runs) {
      if (
        !input.force &&
        runs.some((run) =>
          isClaimForAutomationSlot({
            run,
            automationId: input.record.id,
            scheduledFor: input.scheduledFor,
            now: input.now,
          })
        )
      ) {
        return {
          records: runs,
          result: {},
        }
      }

      const run = runningAutomationRun({
        record: input.record,
        scheduledFor: input.scheduledFor,
        now: input.now,
      })
      const records = input.force
        ? runs
        : runs.filter(
            (existingRun) =>
              !isSameAutomationSlot({
                run: existingRun,
                automationId: input.record.id,
                scheduledFor: input.scheduledFor,
              }) || existingRun.status !== "running"
          )
      return {
        records: [run, ...records],
        result: { run },
      }
    },
  })
}

async function updateAutomationRun(
  runRootDir: string,
  run: AutomationRunRecord
) {
  await withJsonArrayStore<RawAutomationRunRecord>({
    rootDir: runRootDir,
    fileName: runsFileName,
    key: "runs",
    normalize: normalizeRun,
    update(runs) {
      let updated = false
      const records = runs.map((existingRun) => {
        if (existingRun.id !== run.id) {
          return existingRun
        }
        updated = true
        return run
      })
      return {
        records: updated ? records : [run, ...records],
      }
    },
  })
}

function isClaimForAutomationSlot(input: {
  run: RawAutomationRunRecord
  automationId: string
  scheduledFor: string
  now: Date
}) {
  if (!isSameAutomationSlot(input)) {
    return false
  }
  if (input.run.status !== "running") {
    return true
  }

  const updatedAt = new Date(clean(input.run.updatedAt)).getTime()
  const guardMs = runningClaimGuardMinutes * 60 * 1000
  return Number.isFinite(updatedAt) && input.now.getTime() - updatedAt < guardMs
}

function isSameAutomationSlot(input: {
  run: RawAutomationRunRecord
  automationId: string
  scheduledFor: string
}) {
  return (
    input.run.automationId === input.automationId &&
    input.run.scheduledFor === input.scheduledFor
  )
}

function runningAutomationRun(input: {
  record: AutomationRecord
  scheduledFor: string
  now: Date
}): AutomationRunRecord {
  const now = input.now.toISOString()
  return {
    id: `automation-run-${randomUUID()}`,
    automationId: input.record.id,
    automationTitle: input.record.schema.title || input.record.name,
    scheduledFor: input.scheduledFor,
    status: "running",
    plan: pendingAutomationRunPlan(input.record),
    createdAt: now,
    updatedAt: now,
  }
}

function failedClaimedAutomationRun(
  run: AutomationRunRecord,
  error: unknown
): AutomationRunRecord {
  const message = error instanceof Error ? error.message : String(error)
  return {
    ...run,
    status: "failed",
    updatedAt: new Date().toISOString(),
    error: message,
  }
}

function pendingAutomationRunPlan(record: AutomationRecord): AutomationRunPlan {
  const collectionIds = automationCollectionIds(record.schema)
  const content = automationFormatSection(record.schema, "content")
  const slideCount = automationTotalSlideCount(record.schema)
  const hook = automationHooks(record.schema)[0] || record.schema.title
  return {
    title: record.schema.title || record.name,
    caption: hook.toLowerCase(),
    hashtags: "",
    hook,
    imageCollectionIds: collectionIds,
    slides: [],
    slideCount: {
      mode: "static",
      count: slideCount,
      min: content.slideCount,
      max: record.schema.prompt_formatting.num_of_slides,
    },
    publishType: automationPublishType(record.schema),
    autoMusic: record.schema.tiktok_post_settings.auto_music,
    autoPost: record.schema.tiktok_post_settings.auto_post,
    hookCandidates: automationHooks(record.schema),
    language:
      record.schema.image_collection_ids.language || defaultAutomationLanguage,
  }
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
    status:
      run.status === "failed"
        ? "failed"
        : run.status === "running"
          ? "running"
          : "succeeded",
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
    hookTemplate: clean(plan?.hookTemplate) || undefined,
    hookSubstitutions: isRecord(plan?.hookSubstitutions)
      ? Object.fromEntries(
          Object.entries(plan.hookSubstitutions)
            .map(([key, value]) => [clean(key), clean(value)] as const)
            .filter(([key, value]) => key && value)
        )
      : undefined,
    imageCollectionIds: Array.isArray(plan?.imageCollectionIds)
      ? plan.imageCollectionIds
      : [],
    slides: Array.isArray(plan?.slides) ? plan.slides : [],
    slideCount: plan?.slideCount ?? { mode: "varying" },
    publishType: clean(plan?.publishType) || "slideshow",
    autoMusic: typeof plan?.autoMusic === "boolean" ? plan.autoMusic : true,
    autoPost: typeof plan?.autoPost === "boolean" ? plan.autoPost : false,
    reuseWarnings: normalizeReuseWarnings(plan?.reuseWarnings),
    hookCandidates: plan?.hookCandidates,
    textModel: plan?.textModel,
    language: clean(plan?.language) || defaultAutomationLanguage,
    translationProvider: plan?.translationProvider,
    debug: plan?.debug,
  }
}

function normalizeReuseWarnings(
  value: unknown
): AutomationRunReuseWarning[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }
  const warnings = value.flatMap((item) => {
    if (!isRecord(item) || item.kind !== "image") {
      return []
    }
    const key = clean(item.key)
    const reason = clean(item.reason)
    if (!key || !reason) {
      return []
    }
    return [
      {
        kind: "image" as const,
        key,
        slideId: clean(item.slideId) || undefined,
        lastUsedAt: clean(item.lastUsedAt) || undefined,
        reason,
      },
    ]
  })
  return warnings.length > 0 ? warnings : undefined
}
