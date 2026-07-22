import { clean, isRecord } from "@/lib/guards"
import type {
  AutomationRunSlideRole,
  AutomationRunSlideView,
  AutomationRunStatus,
} from "@/lib/automation-run-contract"
import { splitDebateHook } from "@/lib/debate-hook"
import { randomUUID } from "node:crypto"
import path from "node:path"

import {
  getAutomationRecord,
  listAutomationRecords,
  type AutomationRecord,
} from "@/lib/automations"
import {
  clearAutomationRunProgress,
  setAutomationRunProgress,
} from "@/lib/automation-run-progress"
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
  automationHookItems,
  automationHooks,
  automationPostingMode,
  automationPublishType,
  automationTotalSlideCount,
  updateAutomationFormatSection,
  type AutomationSchema,
  type AutomationContentRoute,
} from "@/lib/realfarm-automation"
import {
  collectionAliases,
  storedCollectionId,
} from "@/lib/realfarm-collections"
import { dueAutomationSlots } from "@/lib/automation-slots"
import {
  defaultSlideshowTextModel,
  generateSlideshowText,
  type SlideshowTextGenerationResult,
} from "@/lib/slideshow-text-generation"
import {
  listPostFastPostRecords,
  type PostFastPostRecord,
  type PostFastPostStatus,
} from "@/lib/postfast-posts"
import {
  publishAutomationRun,
  recordAwaitingManualAutomationRun,
  recordFailedAutomationRun,
  recordReadyForReviewAutomationRun,
} from "@/lib/publishing"
import { enqueueReminder } from "@/lib/reminders"
import { uploadPostFastMediaSources } from "@/lib/postfast-media-upload"
import {
  createSlideshowResultRecord,
  defaultSlideshowSettings,
  listSlideshowRecords,
  type SlideshowRecord,
  type SlideshowSlide,
  type SlideshowTextItem,
} from "@/lib/slideshows"
import {
  defaultSlideshowAspectRatio,
  defaultSlideshowFont,
  slideshowTextPositionX,
} from "@/lib/slideshow-renderer"
import {
  createOvalIconLayout,
  type OvalIconLayout,
} from "@/lib/slideshow-oval-icons"
import type { ResultRecord } from "@/lib/results"
import {
  automationSchemaToTempSlideTestingAutomation,
  hookImpliedSlideCount,
  type TempSlideSpec,
  type TempSlideStructuredOutput,
} from "@/lib/temp-slide-testing"
import {
  hasNearDuplicateText,
  normalizedTextSignature,
} from "@/lib/text-similarity"
import {
  expandHook,
  expandAllHookCombinations,
  type HookExpansionResult,
} from "@/lib/hook-expansion"
import {
  appendUsageRecords,
  deleteUsageRecords,
  listUsageRecords,
  recentUsageRecords,
  recentUsageKeys,
  usageRecordsForPublishedRuns,
  usageKeyForHook,
  usageKeyForHookCombination,
  type UsageRecord,
} from "@/lib/usage-ledger"
import { listWordCollections } from "@/lib/word-collections"
import { selectSlideshowImageWithAi } from "@/lib/slideshow-image-matching"
import {
  deleteJsonArrayRecord,
  readJsonArrayRecord,
  readJsonArrayStore,
  upsertJsonArrayRecord,
  withJsonArrayStore,
  writeJsonArrayStore,
} from "@/lib/json-store"

export type { AutomationRunStatus } from "@/lib/automation-run-contract"

export type AutomationRunRecord = {
  id: string
  automationId: string
  automationTitle: string
  scheduledFor: string
  generationSource?: "manual" | "scheduled"
  requestId?: string
  status: AutomationRunStatus
  postfastRecordId?: string
  slideshowId?: string
  videoUrl?: string
  thumbnailUrl?: string
  outputImages?: string[]
  outputDir?: string
  socialStatuses?: AutomationRunSocialStatus[]
  manuallyPublishedAt?: string
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
  hookId?: string
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
  contentStrategy?: {
    routeId: string
    format: AutomationContentRoute["format"]
    ctaStrategy: AutomationContentRoute["cta_strategy"]
  }
  debug?: {
    selectedHookIndex?: number
    textGenerationError?: string
    textSimilarityRetry?: boolean
    textModelPrompt?: SlideshowTextGenerationResult["promptPayload"]
    textGenerationResult?: TempSlideStructuredOutput
    webSearchSources?: SlideshowTextGenerationResult["webSearchSources"]
    imageTextCoherenceRepair?: boolean
  }
}

export type AutomationRunReuseWarning = {
  kind: "image"
  key: string
  slideId?: string
  lastUsedAt?: string
  reason: string
}

export type AutomationRunSlide = AutomationRunSlideView & {
  id: string
  role: AutomationRunSlideRole
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
  iconLayout?: OvalIconLayout
}

export type AutomationRunRenderedSlide = AutomationRunSlideView & {
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

type SelectedAutomationRunnerImage = AutomationRunnerImage & {
  reusedRecently?: boolean
  lastUsedAt?: string
}

export type AutomationRunSocialStatus = {
  provider: AutomationSchema["social_integrations"][number]["provider"]
  integrationId: string
  name: string
  profile?: string
  status: PostFastPostStatus | "queued" | "disabled"
  scheduledAt?: string
  publishedAt?: string
  releaseUrl?: string
  externalPostId?: string
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
      `This slideshow needs ${required} distinct slide-and-image combinations, but only ${available} could be created.`
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
  kind?: unknown
  checkpoints?: unknown
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
    postRecords?: PostFastPostRecord[] | Promise<PostFastPostRecord[]>
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
  const limitedRuns = filteredRuns
    .toSorted(
      (first, second) =>
        automationRunTimestamp(second) - automationRunTimestamp(first)
    )
    .slice(0, Math.max(1, input.limit ?? 50))
  const renderedRuns = await enrichRunsWithRenderedSlides(
    limitedRuns,
    input.slideshowRootDir
  )
  return enrichRunsWithSocialStatuses(
    renderedRuns,
    input.automationRootDir,
    input.postfastRootDir,
    input.postRecords
  )
}

function automationRunTimestamp(run: AutomationRunRecord) {
  const createdAt = new Date(run.createdAt).getTime()
  return Number.isFinite(createdAt) ? createdAt : 0
}

export async function deleteAutomationRuns(input: {
  runRootDir?: string
  usageLedgerRootDir?: string
  automationId?: string
  runIds?: string[]
  slideshowIds?: string[]
}) {
  const automationId = clean(input.automationId)
  const runIds = new Set((input.runIds ?? []).map(clean).filter(Boolean))
  const slideshowIds = new Set(
    (input.slideshowIds ?? []).map(clean).filter(Boolean)
  )
  if (!automationId && runIds.size === 0 && slideshowIds.size === 0) {
    return []
  }

  const runRootDir = input.runRootDir ?? defaultRunRootDir
  if (!automationId && slideshowIds.size === 0) {
    const found = await Promise.all(
      [...runIds].map((id) => readAutomationRunRecord(runRootDir, id))
    )
    const deleted = found.filter((run): run is AutomationRunRecord =>
      Boolean(run)
    )
    await Promise.all(
      deleted.map((run) =>
        deleteJsonArrayRecord({
          rootDir: runRootDir,
          fileName: runsFileName,
          key: "runs",
          id: run.id,
        })
      )
    )
    await deleteUsageRecords({
      rootDir: input.usageLedgerRootDir ?? path.dirname(runRootDir),
      runIds: deleted.map((run) => run.id),
    })
    return deleted
  }
  const runs = await readAutomationRuns(runRootDir)
  const deleted = runs.filter(
    (run) =>
      (automationId && run.automationId === automationId) ||
      runIds.has(run.id) ||
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
  await deleteUsageRecords({
    rootDir: input.usageLedgerRootDir ?? path.dirname(runRootDir),
    runIds: [...deletedIds],
  })
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
    force?: boolean
    forcedScheduledFor?: Date
    now?: Date
    lookbackMinutes?: number
    random?: () => number
    requestId?: string
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
  const automationRootDir = input.automationRootDir ?? defaultAutomationRootDir
  const records = input.automationId
    ? [await getAutomationRecord(input.automationId, automationRootDir)].filter(
        (record): record is AutomationRecord => Boolean(record)
      )
    : await listAutomationRecords({ rootDir: automationRootDir })
  const result: AutomationRunResult = { created: [], results: [], skipped: [] }

  for (const record of records) {
    if (input.automationId && record.id !== input.automationId) {
      continue
    }

    if (!input.force && record.status !== "live") {
      result.skipped.push({ automationId: record.id, reason: "not_live" })
      continue
    }

    const dueSlots = input.force
      ? [(input.forcedScheduledFor ?? now).toISOString()]
      : dueAutomationSlots(
          record.schema.schedule,
          now,
          lookbackMinutes,
          0,
          input.random ? () => input.random!() : undefined
        )
    if (dueSlots.length === 0) {
      result.skipped.push({ automationId: record.id, reason: "not_due" })
      continue
    }

    for (const scheduledFor of dueSlots) {
      const imageCollections = await readImageCollections(
        input.imageCollectionDbPath
      )
      if (
        imagesForCollectionIds({
          collections: imageCollections,
          collectionIds: automationCollectionIds(record.schema),
        }).length === 0
      ) {
        result.skipped.push({
          automationId: record.id,
          reason: "no_images",
          scheduledFor,
        })
        continue
      }
      const wordCollections = await listWordCollections({
        rootDir: input.wordCollectionRootDir,
      })
      for (const hook of automationHooks(record.schema)) {
        expandHook(hook, record.schema.hook_slots, wordCollections, () => 0, {
          noDuplicates: record.schema.hook_no_duplicate_slots === true,
          caseMode: record.schema.prompt_formatting.hook_case,
          now,
          timeZone: record.schema.schedule.timezone,
        })
      }
      const claim = await claimAutomationRunSlot({
        runRootDir,
        record,
        scheduledFor,
        now,
        force: Boolean(input.force),
        generationSource: input.force ? "manual" : "scheduled",
        requestId: clean(input.requestId) || undefined,
      })
      if (!claim.run) {
        result.skipped.push({
          automationId: record.id,
          reason: "already_ran",
          scheduledFor,
        })
        continue
      }

      const createdRun = await createAutomationRun({
        claimedRun: claim.run,
        record,
        postfastRootDir: input.postfastRootDir,
        slideshowRootDir,
        resultRootDir,
        imageCollectionDbPath: input.imageCollectionDbPath,
        wordCollectionRootDir: input.wordCollectionRootDir,
        usageLedgerRootDir,
        now,
        random: input.random,
      }).catch(async (error) => {
        clearAutomationRunProgress(claim.run!.id)
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
  // Keep debug previews on the exact planner used by persisted
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

async function createAutomationRun(input: {
  claimedRun: AutomationRunRecord
  record: AutomationRecord
  postfastRootDir?: string
  slideshowRootDir?: string
  resultRootDir?: string
  imageCollectionDbPath?: string
  wordCollectionRootDir?: string
  usageLedgerRootDir?: string
  usedHookKeys?: Set<string>
  usedHookCombinationKeys?: Set<string>
  now: Date
  random?: () => number
}) {
  const now = new Date().toISOString()
  const runId = input.claimedRun.id
  let plan: AutomationRunPlan
  try {
    plan = await createAutomationRunPlan(input.record.schema, {
      automationId: input.record.id,
      imageCollectionDbPath: input.imageCollectionDbPath,
      wordCollectionRootDir: input.wordCollectionRootDir,
      usageLedgerRootDir: input.usageLedgerRootDir,
      usedHookKeys: input.usedHookKeys,
      usedHookCombinationKeys: input.usedHookCombinationKeys,
      now: input.now,
      random: input.random,
      onProgress: (stage, detail) =>
        setAutomationRunProgress(runId, stage, detail),
    })
  } catch (error) {
    clearAutomationRunProgress(runId)
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
    automationTitle: input.record.name,
    status,
    plan,
    updatedAt: now,
    error:
      status === "failed"
        ? "No images available for automation collections"
        : undefined,
  }
  if (status === "failed") {
    clearAutomationRunProgress(runId)
    return { run }
  }

  setAutomationRunProgress(runId, "Rendering slides", plan.hook)
  const { slideshow, result } = await createSlideshowResultRecord({
    rootDir: input.slideshowRootDir,
    resultRootDir: input.resultRootDir,
    runId: run.id,
    automationId: input.record.id,
    title: requiredGeneratedValue("title", plan.title),
    caption: plan.caption,
    hashtags: plan.hashtags,
    prompt: automationSlideshowPrompt(input.record.schema, plan.hook),
    image_collection: plan.imageCollectionIds[0] ?? "",
    slideshow_type: "automation",
    status: "exported",
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
  await enqueueReminder({
    event: "generated",
    sourceType: "slideshow",
    sourceId: slideshow.id,
    text: `Slideshow generated\n${plan.title}\n${plan.hook}`,
  }).catch(() => undefined)

  // Upload the rendered slides before any posting workflow is recorded. Auto,
  // review, and manual modes all use the same PostFast media keys, so approving
  // later can never degrade into a caption-only post.
  const activeIntegrations = input.record.schema.social_integrations.filter(
    (integration) => integration.integration_id && !integration.disabled
  )
  if (
    activeIntegrations.length > 0 &&
    input.claimedRun.generationSource !== "manual"
  ) {
    const postingMode = automationPostingMode(input.record.schema)
    let media
    try {
      media = await uploadPostFastMediaSources({
        urls: slideshow.output_images,
      })
    } catch (error) {
      await recordFailedAutomationRun({
        runId: run.id,
        scheduledFor: run.scheduledFor,
        integrations: activeIntegrations,
        content: automationPublishContent(plan),
        postfastRootDir: input.postfastRootDir,
        error: error instanceof Error ? error.message : "Media upload failed",
      })
      throw error
    }
    if (media && postingMode === "auto") {
      await publishAutomationRun({
        runId: run.id,
        scheduledFor: run.scheduledFor,
        integrations: activeIntegrations,
        content: automationPublishContent(plan),
        media,
        postfastRootDir: input.postfastRootDir,
      })
    } else if (media && postingMode === "review") {
      await recordReadyForReviewAutomationRun({
        runId: run.id,
        scheduledFor: run.scheduledFor,
        integrations: activeIntegrations,
        content: automationPublishContent(plan),
        media,
        postfastRootDir: input.postfastRootDir,
      })
      await enqueueReminder({
        event: "ready_to_post",
        sourceType: "slideshow",
        sourceId: slideshow.id,
        scheduledFor: run.scheduledFor,
        availableAt: reminderAvailability(run.scheduledFor),
        dedupeSuffix: run.scheduledFor,
        requiresPostConfirmation: true,
        text: `Slideshow ready for review\n${plan.title}\n${automationPublishContent(plan)}`,
      }).catch(() => undefined)
    } else if (media) {
      await recordAwaitingManualAutomationRun({
        runId: run.id,
        scheduledFor: run.scheduledFor,
        integrations: activeIntegrations,
        content: automationPublishContent(plan),
        media,
        postfastRootDir: input.postfastRootDir,
      })
      await enqueueReminder({
        event: "ready_to_post",
        sourceType: "slideshow",
        sourceId: slideshow.id,
        scheduledFor: run.scheduledFor,
        availableAt: reminderAvailability(run.scheduledFor),
        dedupeSuffix: run.scheduledFor,
        requiresPostConfirmation: true,
        text: `Slideshow ready to post\n${plan.title}\n${automationPublishContent(plan)}`,
      }).catch(() => undefined)
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
  clearAutomationRunProgress(runId)

  return {
    run: runWithRenderedSlides(runWithStatuses, slideshow),
    result,
  }
}

function reminderAvailability(value: string) {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > Date.now()
    ? new Date(timestamp)
    : undefined
}

function automationPublishContent(plan: AutomationRunPlan): string {
  const caption = requiredGeneratedValue("caption", plan.caption)
  const hashtags = requiredGeneratedValue("hashtags", plan.hashtags)
  if (!caption.includes(hashtags)) {
    return `${caption}\n\n${hashtags}`.trim()
  }
  return caption
}

async function enrichRunsWithRenderedSlides(
  runs: AutomationRunRecord[],
  slideshowRootDir?: string
) {
  const runsMissingRenderedSlides = runs.filter(
    (run) => run.slideshowId && !run.renderedSlides?.length
  )
  const slideshowIds = new Set(
    runsMissingRenderedSlides
      .map((run) => run.slideshowId)
      .filter((id): id is string => Boolean(id))
  )
  if (slideshowIds.size === 0) {
    return runs
  }

  const slideshows = await listSlideshowRecords({
    rootDir: slideshowRootDir,
    ids: [...slideshowIds],
    limit: slideshowIds.size,
  })
  const slideshowsById = new Map(
    slideshows.map((slideshow) => [slideshow.id, slideshow])
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
      durationMs: Math.max(1, slideshow.settings.duration) * 1000,
      aspectRatio: slideshow.settings.aspect_ratio,
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
  postfastRootDir?: string,
  providedPostRecords?: PostFastPostRecord[] | Promise<PostFastPostRecord[]>
) {
  if (runs.length === 0) {
    return runs
  }

  const records = await listAutomationRecords({ rootDir: automationRootDir })
  const recordsById = new Map(records.map((record) => [record.id, record]))
  const needsPostRecords = runs.some((run) =>
    recordsById
      .get(run.automationId)
      ?.schema.social_integrations.some((integration) =>
        Boolean(integration.integration_id)
      )
  )
  const postRecords = needsPostRecords
    ? providedPostRecords
      ? await providedPostRecords
      : await listPostFastPostRecords({ rootDir: postfastRootDir }).catch(
          () => []
        )
    : []

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
          postRecords,
        }),
      }
    })
  )
}

async function socialStatusesForRun(input: {
  run: Pick<AutomationRunRecord, "id" | "status" | "slideshowId">
  schema: AutomationSchema
  postfastRootDir?: string
  postRecords?: PostFastPostRecord[]
}): Promise<AutomationRunSocialStatus[]> {
  const integrations = input.schema.social_integrations.filter(
    (integration) => integration.integration_id
  )
  if (integrations.length === 0) {
    return []
  }

  const postRecords =
    input.postRecords ??
    (await listPostFastPostRecords({ rootDir: input.postfastRootDir }).catch(
      () => []
    ))

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
      scheduledAt: postRecord?.scheduledAt,
      publishedAt: postRecord?.publishedAt,
      releaseUrl: postRecord?.releaseUrl,
      externalPostId: postRecord?.externalPostId,
      error: postRecord?.error,
    }
  })
}

async function createAutomationRunPlan(
  schema: AutomationSchema,
  options: {
    automationId?: string
    automationTitle?: string
    imageCollectionDbPath?: string
    wordCollectionRootDir?: string
    usageLedgerRootDir?: string
    usedHookKeys?: Set<string>
    usedHookCombinationKeys?: Set<string>
    now?: Date
    random?: () => number
    textModel?: string
    systemPrompt?: string
    promptInstructions?: string
    includeTextGenerationResult?: boolean
    onProgress?: (stage: string, detail?: string) => void
  } = {}
): Promise<AutomationRunPlan> {
  const progress = options.onProgress ?? (() => {})
  const usageRecords = options.automationId
    ? await listUsageRecords({ rootDir: options.usageLedgerRootDir })
    : []
  const publishedUsageRecords = options.automationId
    ? usageRecordsForPublishedRuns(usageRecords, options.automationId)
    : []
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
  progress("Selecting hook")
  const hookItems = automationHookItems(schema).filter((item) => item.enabled)
  const hookCandidates = hookItems.map((item) => item.text)
  const hookSelection = await selectAutomationHook({
    schema,
    hookItems,
    automationId: options.automationId,
    wordCollectionRootDir: options.wordCollectionRootDir,
    usageLedgerRootDir: options.usageLedgerRootDir,
    usedHookKeys: options.usedHookKeys,
    usedHookCombinationKeys: options.usedHookCombinationKeys,
    usageRecords,
    now: options.now,
    random: options.random,
  })
  const selectedHook = clean(hookSelection.expansion.text)
  if (!selectedHook) {
    throw new Error("The automation database record has no usable hook")
  }
  const hook = applyHookTextDirection(
    selectedHook,
    automationFormatSection(schema, "hook").textItems[0]?.contentDirection
  )
  // A hook that promises "N things ..." must produce exactly N body slides.
  const impliedContentCount = hookImpliedSlideCount(hook)
  if (
    impliedContentCount &&
    impliedContentCount !==
      automationFormatSection(schema, "content").slideCount
  ) {
    const hookSlideCount = automationFormatSection(schema, "hook").slideCount
    const ctaSlideCount = automationFormatSection(schema, "cta").slideCount
    schema = {
      ...updateAutomationFormatSection(schema, "content", {
        slideCount: impliedContentCount,
      }),
      prompt_formatting: {
        ...schema.prompt_formatting,
        num_of_slides: Math.max(
          1,
          hookSlideCount + impliedContentCount + ctaSlideCount
        ),
      },
    }
  }
  progress("Writing slide text", hook)
  const slideCount = automationTotalSlideCount(schema)
  const contentRoute = selectAutomationContentRoute(schema, hook)
  const collectionIds =
    contentRoute?.collection_ids ?? automationCollectionIds(schema)
  const baseTextAutomation =
    automationSchemaToTempSlideTestingAutomation(schema)
  const textAutomation = contentRoute
    ? {
        ...baseTextAutomation,
        slides: baseTextAutomation.slides.map((slide) => ({
          ...slide,
          collectionId: "",
        })),
      }
    : baseTextAutomation
  const promptInstructions = [
    options.promptInstructions,
    contentRoutePrompt(contentRoute),
  ]
    .filter(Boolean)
    .join("\n\n")
  const recentTextRecords = options.automationId
    ? await recentUsageRecords("text", options.automationId, {
        rootDir: options.usageLedgerRootDir,
        withinDays: schema.reuse_policy?.text_exclusion_days ?? 45,
        limit: schema.reuse_policy?.text_exclusion_limit ?? 20,
        now: options.now,
        records: publishedUsageRecords,
      })
    : []
  let textGeneration = await generateAutomationText({
    automation: textAutomation,
    hook,
    model: options.textModel,
    systemPrompt: options.systemPrompt,
    promptInstructions,
    webSearchEnabled: schema.web_search_enabled,
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
    progress("Rewriting slide text (too similar to a recent post)", hook)
    const retry = await generateAutomationText({
      automation: textAutomation,
      hook,
      avoidSimilarOutputs: recentTextRecords.map((record) => record.key),
      model: options.textModel,
      systemPrompt: options.systemPrompt,
      promptInstructions,
      webSearchEnabled: schema.web_search_enabled,
    })
    textGeneration = retry
    textSimilarityRetry = true
  }
  progress("Choosing images", hook)
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
        records: publishedUsageRecords,
      })
    : []
  const recentImages = new Map(
    recentImageRecords.map((record) => [record.key, record.used_at] as const)
  )
  let slideResult = await createSlides({
    title: options.automationTitle ?? "Automation",
    hook,
    images,
    recentImageUsage: recentImages,
    imageCollections,
    slideCount,
    textAutomation,
    generatedText: textGeneration.result,
    random: options.random,
  })
  let imageTextCoherenceRepair = false
  const coherenceInstructions = imageTextCoherenceRepairInstructions({
    automation: textAutomation,
    selectedImages: slideResult.selectedImages,
    generatedText: textGeneration.result,
  })
  if (coherenceInstructions) {
    progress("Aligning slide text with selected images", hook)
    textGeneration = await generateAutomationText({
      automation: textAutomation,
      hook,
      model: options.textModel,
      systemPrompt: options.systemPrompt,
      promptInstructions: [promptInstructions, coherenceInstructions]
        .filter(Boolean)
        .join("\n\n"),
      webSearchEnabled: schema.web_search_enabled,
    })
    imageTextCoherenceRepair = true
    slideResult = await createSlides({
      title: options.automationTitle ?? "Automation",
      hook,
      images,
      recentImageUsage: recentImages,
      imageCollections,
      slideCount,
      textAutomation,
      generatedText: textGeneration.result,
      random: options.random,
      selectedImages: slideResult.selectedImages,
      iconLayouts: slideResult.iconLayouts,
    })
  }
  const slides = await translateAutomationSlides({
    language: schema.language || defaultAutomationLanguage,
    slides: slideResult.slides,
  })
  const title = requiredGeneratedValue("title", textGeneration.result.title)
  const caption = requiredGeneratedValue(
    "caption",
    textGeneration.result.caption
  )
  const hashtags = requiredGeneratedValue(
    "hashtags",
    textGeneration.result.hashtags
  )

  return {
    title,
    caption,
    hashtags,
    hook,
    hookId: hookSelection.hookId,
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
    textModel: textGeneration.model,
    language: schema.language || defaultAutomationLanguage,
    translationProvider: deeplTargetLanguage(
      schema.language || defaultAutomationLanguage
    )
      ? "deepl"
      : undefined,
    contentStrategy: contentRoute
      ? {
          routeId: contentRoute.id,
          format: contentRoute.format,
          ctaStrategy: contentRoute.cta_strategy,
        }
      : undefined,
    debug: {
      selectedHookIndex: hookSelection.index,
      textSimilarityRetry,
      textModelPrompt: textGeneration.promptPayload,
      webSearchSources: textGeneration.webSearchSources,
      textGenerationResult: options.includeTextGenerationResult
        ? textGeneration.result
        : undefined,
      imageTextCoherenceRepair,
    },
  }
}

export function selectAutomationContentRoute(
  schema: Pick<AutomationSchema, "content_strategy">,
  hook: string
) {
  const normalizedHook = clean(hook).toLowerCase()
  return schema.content_strategy?.routes.find((route) =>
    route.hook_patterns.some((pattern) => {
      try {
        return new RegExp(pattern, "i").test(normalizedHook)
      } catch {
        return normalizedHook.includes(pattern.toLowerCase())
      }
    })
  )
}

function contentRoutePrompt(route: AutomationContentRoute | undefined) {
  if (!route) return ""
  const formatDirections: Record<AutomationContentRoute["format"], string> = {
    visual_decision:
      "Use a visual decision-guide structure: name or compare concrete visible options. Each body line must describe a choice that can be supported by the selected image caption.",
    mistake_replacement:
      "Use a mistake-and-replacement structure: identify a visible design choice, state why it fails, and give a concrete replacement. Never invent a flaw that the selected collection cannot show.",
    designer_recommendation:
      "Use a designer-recommendation structure: make one specific room decision at a time and briefly explain the practical result.",
  }
  const ctaDirections: Record<AutomationContentRoute["cta_strategy"], string> =
    {
      comment_prompt:
        "End with a soft comment prompt asking which visible option the viewer would choose.",
      save_prompt:
        "End with a small save prompt tied to the exact room decision.",
      customer_prompt:
        "End with a low-friction customer prompt asking the viewer to comment the room they need help with. Do not hard sell.",
    }
  return `Selected repeatable format: ${route.format}. ${formatDirections[route.format]} ${ctaDirections[route.cta_strategy]}`
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
  hookItems: import("@/lib/realfarm-automation").AutomationHookItem[]
  automationId?: string
  wordCollectionRootDir?: string
  usageLedgerRootDir?: string
  usedHookKeys?: Set<string>
  usedHookCombinationKeys?: Set<string>
  usageRecords?: UsageRecord[]
  now?: Date
  random?: () => number
}): Promise<{ expansion: HookExpansionResult; index: number; hookId: string }> {
  const random = input.random ?? Math.random
  if (input.hookItems.length === 0) {
    throw new Error("The automation database record has no usable hooks")
  }
  const wordCollections = await listWordCollections({
    rootDir: input.wordCollectionRootDir,
  })
  const recentHooks = input.automationId
    ? await recentUsageKeys("hook_published", input.automationId, {
        rootDir: input.usageLedgerRootDir,
        withinDays: input.schema.reuse_policy?.hook_exclusion_days ?? 45,
        now: input.now,
        records: input.usageRecords,
      })
    : new Set<string>()
  const recentCombinations = input.automationId
    ? await recentUsageKeys("hook_combination_published", input.automationId, {
        rootDir: input.usageLedgerRootDir,
        withinDays: input.schema.reuse_policy?.hook_exclusion_days ?? 45,
        now: input.now,
        records: input.usageRecords,
      })
    : new Set<string>()

  const usedHooks = new Set([...recentHooks, ...(input.usedHookKeys ?? [])])
  const usedCombinations = new Set([
    ...recentCombinations,
    ...(input.usedHookCombinationKeys ?? []),
  ])
  const expanded = input.hookItems.flatMap((hookItem, index) =>
    expandAllHookCombinations(
      hookItem.text,
      input.schema.hook_slots,
      wordCollections,
      {
        noDuplicates: input.schema.hook_no_duplicate_slots === true,
        caseMode: input.schema.prompt_formatting.hook_case,
        now: input.now,
        timeZone: input.schema.schedule.timezone,
      }
    ).map((expansion) => ({ expansion, index, hookId: hookItem.id }))
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
    const translatedText = clean(translatedTexts[index])
    if (!translatedText) {
      throw new Error(`DeepL omitted translation ${index + 1}`)
    }
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
  webSearchEnabled?: boolean
}) {
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured")
  }

  return generateSlideshowText({
    automation: input.automation,
    model: input.model || defaultSlideshowTextModel,
    systemPrompt: input.systemPrompt,
    promptInstructions: input.promptInstructions,
    selectedHook: input.hook,
    avoidSimilarOutputs: input.avoidSimilarOutputs,
    webSearchEnabled: input.webSearchEnabled,
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
  matchText?: string
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
  if (images.length === 0) {
    throw new Error(
      `No overlay images exist in database collection ${input.slide.overlayImage.collectionId}`
    )
  }
  // Prefer the overlay whose caption shares words with the hook/slide text
  // (e.g. the "cancer zodiac bracelet" cutout on a Cancer post) so per-sign
  // product overlays never attach the wrong sign. Otherwise use index rotation.
  const image =
    bestCaptionMatch(images, input.matchText) ??
    images[input.slideIndex % Math.max(1, images.length)]
  return {
    imageUrl: image.imageUrl,
    imageCaption: image.imageCaption,
    padding: Math.max(0, input.slide.overlayImage.height),
  }
}

function bestCaptionMatch<T extends { imageCaption?: string }>(
  images: T[],
  matchText: string | undefined
): T | undefined {
  const targetTokens = new Set(captionMatchTokens(matchText))
  if (targetTokens.size === 0) {
    return undefined
  }
  let best: T | undefined
  let bestScore = 0
  for (const image of images) {
    let score = 0
    for (const token of captionMatchTokens(image.imageCaption)) {
      if (targetTokens.has(token)) score += 1
    }
    if (score > bestScore) {
      best = image
      bestScore = score
    }
  }
  return best
}

// Normalized for matching: lowercase, letters only, trailing plural "s"
// stripped from BOTH sides so "Capricorns" matches "capricorn" (and "aries"
// still matches "aries" since both normalize to "arie").
function captionMatchTokens(value: string | undefined) {
  return clean(value)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((token) => token.length >= 4)
    .map((token) => token.replace(/s$/, ""))
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
  selectedImages?: SelectedAutomationRunnerImage[]
  iconLayouts?: Array<OvalIconLayout | undefined>
}): Promise<{
  slides: AutomationRunSlide[]
  reuseWarnings: AutomationRunReuseWarning[]
  selectedImages: SelectedAutomationRunnerImage[]
  iconLayouts: Array<OvalIconLayout | undefined>
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
  const selectedImages =
    input.selectedImages ??
    (await selectImagesForSlides({
      ...input,
      specs,
    }))
  if (selectedImages.length < specs.length) {
    throw new InsufficientUniqueImagesError(specs.length, selectedImages.length)
  }
  const iconLayouts =
    input.iconLayouts ??
    specs.map((spec, index) => {
      if (spec.imageGrid !== "oval-icons") return undefined
      const configuredImages = spec.collectionId
        ? imagesForCollectionIds({
            collections: input.imageCollections,
            collectionIds: [spec.collectionId],
          })
        : input.images
      const sectionImages = imagesForSlideSection(
        configuredImages,
        spec.section
      )
      return createOvalIconLayout({
        candidates: sectionImages,
        focalKey: selectedImages[index]?.key ?? "",
        random: input.random,
      })
    })
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
    const text = textItems[0]?.text || ""

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
          matchText: `${input.hook} ${text}`,
        }),
        displayText: slide.displayText,
        textItems,
        iconLayout: iconLayouts[index],
      },
    ]
  })
  return { slides, reuseWarnings, selectedImages, iconLayouts }
}

function imageTextCoherenceRepairInstructions(input: {
  automation: ReturnType<typeof automationSchemaToTempSlideTestingAutomation>
  selectedImages: SelectedAutomationRunnerImage[]
  generatedText: TempSlideStructuredOutput
}) {
  const slideContexts = input.automation.slides.flatMap((slide, index) => {
    if (!slide.aiImageSelection) return []
    const imageCaption = clean(input.selectedImages[index]?.imageCaption)
    const promptItems = slide.textItems.filter(
      (textItem) => textItem.textMode === "prompt"
    )
    if (!imageCaption || promptItems.length === 0) return []
    const draftLines = promptItems.map((textItem) => {
      const draft = clean(input.generatedText.text[textItem.id])
      return `  - ${textItem.id}: ${JSON.stringify(draft)}`
    })
    return [
      [
        `- ${slide.id} selected image caption: ${JSON.stringify(imageCaption)}`,
        "  Current draft text:",
        ...draftLines,
      ].join("\n"),
    ]
  })
  if (slideContexts.length === 0) return ""

  return [
    "Selected-image coherence repair (mandatory):",
    "Rewrite the generated text fields listed below so each one directly and truthfully matches its slide's locked selected image caption.",
    "Treat each caption as the source of truth for visible objects, people, settings, and actions. Do not mention an object or action absent from that caption.",
    "Keep the selected hook and all static text unchanged. Preserve every placeholder's word limits, content direction, and the slideshow's overall narrative. Return the complete required JSON object, including unlisted fields.",
    ...slideContexts,
  ].join("\n")
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
  const usedSlideImagePairs = new Set<string>()
  const apiKey = clean(process.env.OPENROUTER_API_KEY)
  const selected: SelectedAutomationRunnerImage[] = []

  for (const [index, spec] of input.specs.entries()) {
    const configuredSectionImages = spec.collectionId
      ? imagesForCollectionIds({
          collections: input.imageCollections,
          collectionIds: [spec.collectionId],
        })
      : input.images
    const sectionImages = imagesForSlideSection(
      spec.collectionId ? configuredSectionImages : input.images,
      spec.section
    )
    if (sectionImages.length === 0) {
      throw new Error(
        `No images exist in the configured collection for ${spec.title}`
      )
    }
    const slideText = imageSelectionText({
      title: input.title,
      hook: input.hook,
      spec,
      slide: input.textAutomation?.slides[index],
      generatedText: input.generatedText,
    })
    const unusedCandidates = sectionImages.filter(
      (image) => !usedKeys.has(image.key) && !usedUrls.has(image.imageUrl)
    )
    // Prefer a new image, but allow reuse once that pool is exhausted. The
    // actual duplicate to prevent is the same hook/slide text paired with the
    // same image, not the image appearing more than once in a slideshow.
    const reusableCandidates = sectionImages.filter(
      (image) =>
        !usedSlideImagePairs.has(
          slideImagePairKey(input.hook, slideText, image)
        )
    )
    const candidates = unusedCandidates.length
      ? unusedCandidates
      : reusableCandidates
    const preselected = chooseImages(candidates, 1, input.random, {
      recentUsage: input.recentImageUsage,
    })[0]
    if (!preselected) continue

    let image = preselected
    if (spec.aiImageSelection) {
      if (!apiKey) {
        throw new Error(
          `OPENROUTER_API_KEY is required for AI image selection on ${spec.title}`
        )
      }
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
      if (!matched) {
        throw new Error("AI image selection returned an unknown image id")
      }
      image = {
        ...matched,
        reusedRecently: input.recentImageUsage?.has(matched.key),
        lastUsedAt: input.recentImageUsage?.get(matched.key),
      }
    }

    usedKeys.add(image.key)
    usedUrls.add(image.imageUrl)
    usedSlideImagePairs.add(slideImagePairKey(input.hook, slideText, image))
    selected.push(image)
  }

  return selected
}

export function imagesForSlideSection<T extends { imageCaption: string }>(
  images: T[],
  section: TempSlideSpec["section"]
) {
  const taggedForSection = images.filter(
    (image) => imageCaptionSection(image.imageCaption) === section
  )
  if (taggedForSection.length > 0 && section !== "content") {
    return taggedForSection
  }
  if (section === "content") {
    const contentImages = images.filter((image) => {
      const taggedSection = imageCaptionSection(image.imageCaption)
      return !taggedSection || taggedSection === "content"
    })
    if (contentImages.length > 0) return contentImages
  }
  return images
}

function imageCaptionSection(caption: string) {
  const value = clean(caption).toLowerCase()
  if (value.startsWith("hook asset:")) return "hook" as const
  if (value.startsWith("content asset:")) return "content" as const
  if (value.startsWith("cta asset:")) return "cta" as const
  return undefined
}

function imageSelectionText(input: {
  title: string
  hook: string
  spec: TempSlideSpec
  slide?: TempSlideSpec
  generatedText?: TempSlideStructuredOutput
}) {
  const text = automationSlideTextItems({
    title: input.title,
    hook: input.hook,
    slide: input.slide,
    generatedText: input.generatedText,
  })
    .map((item) => item.text)
    .filter(Boolean)
    .join("\n")
  return text || (input.spec.section === "hook" ? input.hook : input.title)
}

function slideImagePairKey(
  hook: string,
  slideText: string,
  image: AutomationRunnerImage
) {
  return normalizedTextSignature([hook, slideText, image.key || image.imageUrl])
}

function automationSlideTextItems(input: {
  title: string
  hook: string
  slide?: TempSlideSpec
  imageCaption?: string
  generatedText?: TempSlideStructuredOutput
}): SlideshowTextItem[] {
  if (!input.slide || input.slide.section === "hook") {
    const hookItems = input.slide?.textItems ?? []
    const pair = splitDebateHook(input.hook)
    if (pair && hookItems.length >= 2) {
      return hookItems.slice(0, 2).map((textItem, index) =>
        slideshowTextItemFromTempTextItem({
          textItem,
          text: pair[index],
          fallbackId: `hook-text-${index + 1}`,
        })
      )
    }
    return [
      slideshowTextItemFromTempTextItem({
        textItem: hookItems[0],
        text: input.hook,
        fallbackId: "hook-text",
      }),
    ]
  }

  if (!input.slide.displayText) {
    return []
  }

  if (input.slide.textItems.length === 0) {
    throw new Error(
      `${input.slide.title} displays text but has no configured text items`
    )
  }

  return input.slide.textItems.map((textItem, index) => {
    const text =
      textItem.textMode === "static"
        ? clean(textItem.staticText)
        : clean(input.generatedText?.text[textItem.id])
    if (!text) {
      throw new Error(
        `${textItem.textMode === "static" ? "Static" : "Generated"} text is missing for ${textItem.id}`
      )
    }
    return slideshowTextItemFromTempTextItem({
      textItem,
      text,
      fallbackId: `text-${index + 1}`,
    })
  })
}

export function automationRunSlidesToSlideshowSlides(
  schema: AutomationSchema,
  plan: AutomationRunPlan
): SlideshowSlide[] {
  return plan.slides.map((slide, index) => {
    const section = automationFormatSection(
      schema,
      slide.role === "hook" ? "hook" : slide.role === "cta" ? "cta" : "content"
    )
    const textItem = section.textItems[0]
    const text = slide.text
    if (!section.noText && !slide.textItems?.length && !text) {
      throw new Error(`Rendered slide ${slide.id} is missing text`)
    }
    const textPosition = textItemPosition(textItem)
    const textItems = slide.textItems?.length
      ? slide.textItems
      : section.noText
        ? []
        : [
            {
              id: textItem?.id || `text-${index + 1}`,
              text,
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
      imageFit: schema.image_fit,
      iconLayout: slide.iconLayout
        ? {
            kind: "oval-icons",
            surrounding: slide.iconLayout.surrounding.map((icon) => ({
              image_url: icon.imageUrl,
              image_caption: icon.imageCaption,
              key: icon.key,
              x: icon.x,
              y: icon.y,
              scale: icon.scale,
              rotation: icon.rotation,
            })),
          }
        : undefined,
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

export function automationSlideshowSettings(schema: AutomationSchema) {
  const tiktok = schema.tiktok_post_settings
  return defaultSlideshowSettings({
    duration: slideshowDurationValue(tiktok.slideshow_slide_duration),
    aspect_ratio: clean(schema.aspect_ratio) || defaultSlideshowAspectRatio,
    font: clean(schema.font) || defaultSlideshowFont,
    background_color: "#000000",
    transition_style:
      clean(tiktok.slideshow_transition_style) || defaultSlideshowTransition,
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
    ReturnType<typeof automationFormatSection>["textItems"][number] | undefined
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

function requiredGeneratedValue(field: string, value: unknown) {
  const generated = clean(value)
  if (!generated) {
    throw new Error(`OpenRouter omitted required slideshow ${field}`)
  }
  return generated
}

async function readImageCollections(
  imageCollectionDbPath = path.join(
    process.cwd(),
    "data",
    "image-collections.json"
  )
) {
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
      id: storedCollectionId({ name: clean(collection.name) }),
      name: clean(collection.name),
      createdAt: clean(collection.created_at),
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
        createdAt: collection.createdAt,
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
  generationSource: "manual" | "scheduled"
  requestId?: string
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
        generationSource: input.generationSource,
        requestId: input.requestId,
        now: input.now,
      })
      // Self-heal: a process restart mid-run leaves records stuck in
      // "running" forever. Anything past the claim guard is dead — mark it
      // failed so the UI reflects reality.
      const healed = runs.map((existingRun) => {
        if (existingRun.status !== "running") {
          return existingRun
        }
        const updatedAt = new Date(clean(existingRun.updatedAt)).getTime()
        const guardMs = runningClaimGuardMinutes * 60 * 1000
        if (
          Number.isFinite(updatedAt) &&
          input.now.getTime() - updatedAt >= guardMs
        ) {
          return {
            ...existingRun,
            status: "failed" as const,
            error:
              clean(existingRun.error) ||
              "Run was interrupted before it completed.",
            updatedAt: input.now.toISOString(),
          }
        }
        return existingRun
      })
      const records = input.force
        ? healed
        : healed.filter(
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

export async function removeAutomationRunSlide(input: {
  runRootDir?: string
  usageLedgerRootDir?: string
  slideshowId: string
  runId?: string
  slideIndex: number
}) {
  const runRootDir = input.runRootDir ?? defaultRunRootDir
  const run = await automationRunForSlideshow(runRootDir, input)
  if (!run) {
    return null
  }
  const dropIndex = Math.floor(input.slideIndex)
  const without = <T>(items: T[] | undefined) =>
    items?.filter((_, index) => index !== dropIndex)
  const updated: AutomationRunRecord = {
    ...run,
    plan: {
      ...run.plan,
      slides: without(run.plan.slides) ?? [],
    },
    renderedSlides: without(run.renderedSlides),
    outputImages: without(run.outputImages),
    updatedAt: new Date().toISOString(),
  }
  await updateAutomationRun(runRootDir, updated)
  const removedImage = run.plan.slides[dropIndex]
  const removedImageKey = removedImage?.imageKey || removedImage?.imageUrl
  const imageStillUsed = updated.plan.slides.some(
    (slide) => (slide.imageKey || slide.imageUrl) === removedImageKey
  )
  if (removedImageKey && !imageStillUsed) {
    await deleteUsageRecords({
      rootDir: input.usageLedgerRootDir ?? path.dirname(runRootDir),
      entries: [
        {
          runId: run.id,
          kind: "image",
          key: removedImageKey,
        },
      ],
    })
  }
  return updated
}

export async function replaceAutomationRunSlideImage(input: {
  runRootDir?: string
  usageLedgerRootDir?: string
  slideshowId: string
  runId?: string
  slideIndex: number
  imageUrl: string
  imageKey?: string
  imageCaption?: string
  slideshow: SlideshowRecord
}) {
  const runRootDir = input.runRootDir ?? defaultRunRootDir
  const run = await automationRunForSlideshow(runRootDir, input)
  if (!run) return null

  const slideIndex = Math.floor(input.slideIndex)
  const previousSlide = run.plan.slides[slideIndex]
  if (!previousSlide) {
    throw new Error("Slide index is out of range")
  }
  const previousImageKey = previousSlide.imageKey || previousSlide.imageUrl
  const nextImageKey = input.imageKey || input.imageUrl
  const nextPlan: AutomationRunPlan = {
    ...run.plan,
    slides: run.plan.slides.map((slide, index) =>
      index === slideIndex
        ? {
            ...slide,
            imageUrl: input.imageUrl,
            imageKey: nextImageKey,
            imageCaption: input.imageCaption ?? slide.imageCaption,
          }
        : slide
    ),
  }
  const updated = runWithRenderedSlides(
    {
      ...run,
      plan: nextPlan,
      updatedAt: new Date().toISOString(),
    },
    input.slideshow
  )
  await updateAutomationRun(runRootDir, updated)

  const usageRootDir = input.usageLedgerRootDir ?? path.dirname(runRootDir)
  if (previousImageKey && previousImageKey !== nextImageKey) {
    await deleteUsageRecords({
      rootDir: usageRootDir,
      entries: [{ runId: run.id, kind: "image", key: previousImageKey }],
    })
  }
  await appendUsageRecords({
    rootDir: usageRootDir,
    records: [
      {
        automation_id: run.automationId,
        kind: "image",
        key: nextImageKey,
        run_id: run.id,
        used_at: updated.updatedAt,
      },
    ],
  })
  return updated
}

export async function updateAutomationRunMetadata(input: {
  runRootDir?: string
  slideshowId: string
  runId?: string
  title: string
  caption: string
  hashtags: string
}) {
  const runRootDir = input.runRootDir ?? defaultRunRootDir
  const run = await automationRunForSlideshow(runRootDir, input)
  if (!run) return null

  const updated: AutomationRunRecord = {
    ...run,
    plan: {
      ...run.plan,
      title: clean(input.title),
      caption: clean(input.caption),
      hashtags: clean(input.hashtags),
    },
    updatedAt: new Date().toISOString(),
  }
  await updateAutomationRun(runRootDir, updated)
  return updated
}

export async function markAutomationRunPublished(input: {
  runRootDir?: string
  usageLedgerRootDir?: string
  slideshowId: string
  runId?: string
  publishedAt?: Date
}) {
  const runRootDir = input.runRootDir ?? defaultRunRootDir
  const run = await automationRunForSlideshow(runRootDir, input)
  if (!run) return null

  const publishedAt = input.publishedAt ?? new Date()
  const updated: AutomationRunRecord = {
    ...run,
    manuallyPublishedAt: publishedAt.toISOString(),
    updatedAt: publishedAt.toISOString(),
  }
  await updateAutomationRun(runRootDir, updated)
  const usage: UsageRecord[] = [
    {
      automation_id: run.automationId,
      ...(run.plan.hookId ? { hook_id: run.plan.hookId } : {}),
      kind: "hook_published",
      key: usageKeyForHook(run.plan.hook),
      run_id: run.id,
      used_at: publishedAt.toISOString(),
    },
  ]
  if (
    run.plan.hookTemplate &&
    run.plan.hookSubstitutions &&
    Object.keys(run.plan.hookSubstitutions).length > 0
  ) {
    usage.push({
      automation_id: run.automationId,
      ...(run.plan.hookId ? { hook_id: run.plan.hookId } : {}),
      kind: "hook_combination_published",
      key: usageKeyForHookCombination(
        run.plan.hookTemplate,
        run.plan.hookSubstitutions
      ),
      run_id: run.id,
      used_at: publishedAt.toISOString(),
    })
  }
  await appendUsageRecords({
    rootDir: input.usageLedgerRootDir,
    records: usage,
  })
  return updated
}

async function updateAutomationRun(
  runRootDir: string,
  run: AutomationRunRecord
) {
  await upsertJsonArrayRecord({
    rootDir: runRootDir,
    fileName: runsFileName,
    key: "runs",
    record: run,
  })
}

/**
 * Restore a complete historical run recovered from durable external evidence.
 * Callers must already be scoped to the correct owner and must supply a fully
 * normalized record. Normal generation continues to use runDueAutomations.
 */
export async function upsertRecoveredAutomationRun(
  run: AutomationRunRecord,
  runRootDir = defaultRunRootDir
) {
  await updateAutomationRun(runRootDir, run)
  return run
}

function readAutomationRunRecord(rootDir: string, id: string) {
  return readJsonArrayRecord<RawAutomationRunRecord>({
    rootDir,
    fileName: runsFileName,
    key: "runs",
    id,
    normalize: normalizeRun,
  }) as Promise<AutomationRunRecord | null>
}

export async function getAutomationRunForSlideshow(input: {
  runRootDir?: string
  slideshowId: string
  runId?: string
}) {
  const runRootDir = input.runRootDir ?? defaultRunRootDir
  const runId = clean(input.runId)
  if (runId) {
    const direct = await readAutomationRunRecord(runRootDir, runId)
    if (direct) return direct
  }
  const runs = await readAutomationRuns(runRootDir)
  return runs.find((record) => record.slideshowId === input.slideshowId) ?? null
}

function automationRunForSlideshow(
  runRootDir: string,
  input: { slideshowId: string; runId?: string }
) {
  return getAutomationRunForSlideshow({ ...input, runRootDir })
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
  generationSource: "manual" | "scheduled"
  requestId?: string
  now: Date
}): AutomationRunRecord {
  const now = input.now.toISOString()
  return {
    id: `automation-run-${randomUUID()}`,
    automationId: input.record.id,
    automationTitle: input.record.name,
    scheduledFor: input.scheduledFor,
    generationSource: input.generationSource,
    requestId: input.requestId,
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
  // Placeholder while the run generates. Never seed hook/caption from the raw
  // narrative here — those lines can contain unexpanded [[slot]] templates and
  // this record is what surfaces if the run dies before generation completes.
  const title = record.name
  return {
    title,
    caption: "",
    hashtags: "",
    hook: "Generating…",
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
    language: record.schema.language || defaultAutomationLanguage,
  }
}

function normalizeRun(run: RawAutomationRunRecord): AutomationRunRecord | null {
  // UGC workers share the automation_runs table but use a checkpoint-based
  // record contract. Never coerce those rows into slideshow outputs.
  if (run?.kind === "ugc" || (run?.checkpoints && typeof run.checkpoints === "object")) {
    return null
  }
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
    generationSource:
      run.generationSource === "manual" ? "manual" : "scheduled",
    manuallyPublishedAt: clean(run.manuallyPublishedAt) || undefined,
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
    hookId: clean(plan?.hookId) || undefined,
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
