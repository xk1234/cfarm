import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import {
  automationRecordToSummary,
  createLocalAutomationRecord,
  getAutomationRecord,
  listAutomationRecords,
  patchAutomationRecord,
  upsertAutomationRecords,
  type AutomationRecord,
} from "@/lib/automations"
import {
  automationTemplateRecordToRuntimeTemplate,
  automationTemplateSchemaToRuntime,
  listAutomationTemplateRecords,
  type AutomationTemplateRecord,
} from "@/lib/automation-templates"
import {
  analyzeAutomationHookPool,
  replaceAutomationHookPool,
} from "@/lib/automation-hook-pool"
import { assertValidAutomationHookTokens } from "@/lib/automation-hook-token-validation"
import {
  deleteAutomationRuns,
  runDueAutomations,
  listAutomationRuns,
  markAutomationRunPublished,
  type AutomationRunRecord,
} from "@/lib/automation-runner"
import { automationRunProgress } from "@/lib/automation-run-progress"
import { automationSlotsInRange } from "@/lib/automation-slots"
import {
  deleteGeneratedVideoExport,
  getGeneratedVideoExport,
  listGeneratedVideoExports,
  markGeneratedVideoExportPublished,
  type GeneratedVideoExport,
} from "@/lib/generated-videos"
import { listAssetRecords } from "@/lib/assets"
import { deleteAutomationCascade } from "@/lib/delete-automation"
import { clean, isRecord } from "@/lib/guards"
import {
  deleteImageCollections,
  importRemoteImagesToCollection,
  listImageCollections,
  upsertImageCollection,
  type StoredImageCollection,
} from "@/lib/image-collections"
import { linkPublishedOutput } from "@/lib/manual-publication-linking"
import { listMediaLibraryAssets } from "@/lib/media-library"
import type { CanonicalMetric } from "@/lib/metric-registry"
import { listAnalyticsIntegrations } from "@/lib/postfast-analytics"
import {
  postfastRequest,
  type PostFastCreatePostType,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import { uploadPostFastMediaSources } from "@/lib/postfast-media-upload"
import {
  listFollowerSnapshots,
  listMetricSnapshots,
  type AccountFollowerSnapshot,
  type PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import {
  deletePostFastPostRecords,
  listPostFastPostRecords,
  type PostFastPostRecord,
  type PostFastSourceType,
} from "@/lib/postfast-posts"
import { publishPost } from "@/lib/publishing"
import { enqueueJob, getJob, listJobs, type Job } from "@/lib/queue"
import type { Automation } from "@/lib/realfarm-data"
import type {
  AutomationDay,
  AutomationFormatSection,
  AutomationFormatSectionId,
  AutomationHookItem,
  AutomationSchedule,
  AutomationTextItem,
  AutomationUgcConfig,
} from "@/lib/realfarm-automation"
import {
  automationCollectionIds,
  automationHookId,
  automationHookItems,
  normalizeAutomationSchema,
  normalizeUgcConfig,
  schemaWithAutomationHookItems,
  ugcLiveConfigurationErrors,
} from "@/lib/realfarm-automation"
import {
  collectionAliases,
  collectionMatchesId,
  storedToCollection,
} from "@/lib/realfarm-collections"
import { listProductCollections } from "@/lib/product-collections"
import { generatedVideoDeletionBlockReason } from "@/lib/generated-video-deletion"
import { slideshowDeletionBlockReason } from "@/lib/slideshow-lifecycle"
import { deleteSlideshowRecord, listSlideshowRecords } from "@/lib/slideshows"
import { withSystemOwner } from "@/lib/system-owner-context"
import { assertPublicHttpUrl } from "@/lib/url-guard"
import {
  inspectTikTokPublicationImport,
  linkTikTokPublicationImport,
  startTikTokPublicationImport,
} from "@/lib/tiktok-publication-import"
import {
  createTikTokStudioAnalyticsBatch,
  createTikTokStudioAnalyticsImport,
  inspectTikTokStudioAnalyticsBatch,
  inspectTikTokStudioAnalyticsImport,
} from "@/lib/tiktok-studio-analytics"
import { buildTikTokStudioMcpReport } from "@/lib/mcp/tiktok-studio-report"
import type { XAutomationRecord, XAutomationRun } from "@/lib/x-automation"
import { generateStoredXAutomationRun } from "@/lib/x-automation-runner"
import {
  deleteXAutomationRun,
  getXAutomation,
  getXAutomationRun,
  listXAutomations,
  listXAutomationRuns,
  upsertXAutomation,
  upsertXAutomationRun,
} from "@/lib/x-automation-store"
import {
  deleteWordCollection,
  listWordCollections,
  upsertWordCollection,
  type WordCollectionRecord,
} from "@/lib/word-collections"
import { wordCollectionVariableName } from "@/lib/hook-variables"
import { estimateUgcCost } from "@/lib/ugc-cost"
import {
  ugcExportId,
  ugcRunId,
  ugcStageOrder,
} from "@/lib/ugc-automation-runner"
import { getUgcRunStatus, type UgcRunStatus } from "@/lib/ugc-run-status"
import { hookAnalyticsReport } from "@/lib/hook-publications"
import { listWorkspaceMembers } from "@/lib/workspace-members"

const automationDays = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const satisfies readonly AutomationDay[]

const postingTimeSchema = z.object({
  time: z
    .string()
    .trim()
    .regex(
      /^(?:(?:1[0-2]|0?[1-9]):[0-5]\d\s*(?:AM|PM)|(?:[01]?\d|2[0-3]):[0-5]\d)$/i,
      "Use h:mm AM/PM or 24-hour H:mm format"
    )
    .describe(
      'Posting time in "h:mm AM/PM" or 24-hour "H:mm" format, e.g. "8:30 AM".'
    ),
  days: z
    .array(z.enum(automationDays))
    .min(1)
    .max(7)
    .describe('Weekdays when this time is active, e.g. ["Mon", "Wed", "Fri"].'),
  enabled: z
    .boolean()
    .optional()
    .describe(
      "Whether this posting time is active; omit to keep the app default."
    ),
})

const schedulePatchSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe(
      'IANA timezone for schedule calculations, e.g. "Asia/Singapore".'
    ),
  postingTimes: z
    .array(postingTimeSchema)
    .min(1)
    .max(20)
    .optional()
    .describe(
      'Complete replacement list of posting times, e.g. [{"time":"8:00 AM","days":["Mon","Tue"],"enabled":true}].'
    ),
  jitterMinutes: z
    .number()
    .int()
    .min(0)
    .max(720)
    .optional()
    .describe("Maximum random schedule offset in minutes, e.g. 10."),
})

const overlayImagePatchSchema = z.object({
  enabled: z.boolean().optional(),
  collectionId: z.string().trim().max(500).optional(),
  padding: z.number().int().min(0).max(2_000).optional(),
})

const formattingBlockPatchSchema = z
  .object({
    slideCount: z.number().int().min(0).max(100).optional(),
    slideCountMode: z
      .enum(["static", "varying", "dynamic"])
      .optional()
      .describe(
        '"dynamic" is accepted as a readable alias for the persisted "varying" mode.'
      ),
    slideCountMin: z.number().int().min(1).max(100).optional(),
    slideCountMax: z.number().int().min(1).max(100).optional(),
    aspect_ratio: z.enum(["9:16", "4:5", "3:4", "3:2", "1:1"]).optional(),
    imageGrid: z.enum(["none", "2x2", "1x2", "1x3", "oval-icons"]).optional(),
    overlay: z.boolean().optional(),
    aiImageSelection: z.boolean().optional(),
    noText: z.boolean().optional(),
    ctaLocation: z.enum(["last", "static"]).optional(),
    ctaStaticPosition: z.string().trim().max(100).optional(),
    imageMode: z.enum(["collection", "single_image"]).optional(),
    overlayImage: overlayImagePatchSchema.optional(),
    slideOverrides: z
      .array(
        z.object({
          slideIndex: z.number().int().min(1).max(100),
          contentDirection: z.string().trim().min(1).max(5_000),
        })
      )
      .max(100)
      .optional(),
    imageOverrides: z
      .array(
        z.object({
          slideIndex: z.number().int().min(1).max(100),
          collectionId: z.string().trim().min(1).max(500),
        })
      )
      .max(100)
      .optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one formatting field to update.",
  })

const textItemPatchSchema = z
  .object({
    fontSize: z.string().trim().min(1).max(100).optional(),
    font: z.string().trim().min(1).max(500).optional(),
    textStyle: z.string().trim().max(500).optional(),
    textPosition: z.enum(["top", "center", "bottom"]).optional(),
    textItemWidth: z.string().trim().min(1).max(100).optional(),
    textAlign: z.enum(["left", "center", "right"]).optional(),
    textAnchor: z.enum(["padded", "flush"]).optional(),
    textVerticalAnchor: z.enum(["padded", "flush"]).optional(),
    wordLengthMin: z.number().int().min(0).max(10_000).optional(),
    wordLengthMax: z.number().int().min(0).max(10_000).optional(),
    contentDirection: z.string().trim().max(5_000).optional(),
    textMode: z.enum(["prompt", "static"]).optional(),
    staticText: z.string().max(10_000).optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one text-item field to update.",
  })

export type LumenClipMcpServices = {
  now: () => Date
  listAutomationRecords: typeof listAutomationRecords
  getAutomationRecord: typeof getAutomationRecord
  upsertAutomationRecords: typeof upsertAutomationRecords
  patchAutomationRecord: typeof patchAutomationRecord
  deleteAutomationCascade: typeof deleteAutomationCascade
  listAutomationTemplateRecords: typeof listAutomationTemplateRecords
  hookAnalyticsReport: typeof hookAnalyticsReport
  listXAutomations: typeof listXAutomations
  getXAutomation: typeof getXAutomation
  upsertXAutomation: typeof upsertXAutomation
  runDueAutomations: typeof runDueAutomations
  deleteAutomationRuns: typeof deleteAutomationRuns
  listAutomationRuns: typeof listAutomationRuns
  markAutomationRunPublished: typeof markAutomationRunPublished
  generateStoredXAutomationRun: typeof generateStoredXAutomationRun
  listXAutomationRuns: typeof listXAutomationRuns
  getXAutomationRun: typeof getXAutomationRun
  upsertXAutomationRun: typeof upsertXAutomationRun
  deleteXAutomationRun: typeof deleteXAutomationRun
  listImageCollections: typeof listImageCollections
  deleteImageCollections: typeof deleteImageCollections
  upsertImageCollection: typeof upsertImageCollection
  importRemoteImagesToCollection: typeof importRemoteImagesToCollection
  listWordCollections: typeof listWordCollections
  upsertWordCollection: typeof upsertWordCollection
  deleteWordCollection: typeof deleteWordCollection
  listProductCollections: typeof listProductCollections
  listAssetRecords: typeof listAssetRecords
  listMediaLibraryAssets: typeof listMediaLibraryAssets
  listGeneratedVideoExports: typeof listGeneratedVideoExports
  deleteGeneratedVideoExport: typeof deleteGeneratedVideoExport
  getGeneratedVideoExport: typeof getGeneratedVideoExport
  markGeneratedVideoExportPublished: typeof markGeneratedVideoExportPublished
  listAccounts: typeof listAnalyticsIntegrations
  listPostFastPostRecords: typeof listPostFastPostRecords
  deletePostFastPostRecords: typeof deletePostFastPostRecords
  listSlideshowRecords: typeof listSlideshowRecords
  deleteSlideshowRecord: typeof deleteSlideshowRecord
  uploadPostFastMediaSources: typeof uploadPostFastMediaSources
  publishPost: typeof publishPost
  linkPublishedOutput: typeof linkPublishedOutput
  listMetricSnapshots: typeof listMetricSnapshots
  listFollowerSnapshots: typeof listFollowerSnapshots
  startTikTokPublicationImport: typeof startTikTokPublicationImport
  inspectTikTokPublicationImport: typeof inspectTikTokPublicationImport
  linkTikTokPublicationImport: typeof linkTikTokPublicationImport
  createTikTokStudioAnalyticsImport: typeof createTikTokStudioAnalyticsImport
  inspectTikTokStudioAnalyticsImport: typeof inspectTikTokStudioAnalyticsImport
  createTikTokStudioAnalyticsBatch: typeof createTikTokStudioAnalyticsBatch
  inspectTikTokStudioAnalyticsBatch: typeof inspectTikTokStudioAnalyticsBatch
  enqueueJob: typeof enqueueJob
  getJob: typeof getJob
  listJobs: typeof listJobs
  listWorkspaceMembers: typeof listWorkspaceMembers
  postfastRequest: typeof postfastRequest
  getUgcRunStatus: typeof getUgcRunStatus
  estimateUgcCost: typeof estimateUgcCost
  ugcGenerationEnabled: () => boolean
}

const defaultServices: LumenClipMcpServices = {
  now: () => new Date(),
  listAutomationRecords,
  getAutomationRecord,
  upsertAutomationRecords,
  patchAutomationRecord,
  deleteAutomationCascade,
  listAutomationTemplateRecords,
  hookAnalyticsReport,
  listXAutomations,
  getXAutomation,
  upsertXAutomation,
  runDueAutomations,
  deleteAutomationRuns,
  listAutomationRuns,
  markAutomationRunPublished,
  generateStoredXAutomationRun,
  listXAutomationRuns,
  getXAutomationRun,
  upsertXAutomationRun,
  deleteXAutomationRun,
  listImageCollections,
  deleteImageCollections,
  upsertImageCollection,
  importRemoteImagesToCollection,
  listWordCollections,
  upsertWordCollection,
  deleteWordCollection,
  listProductCollections,
  listAssetRecords,
  listMediaLibraryAssets,
  listGeneratedVideoExports,
  deleteGeneratedVideoExport,
  getGeneratedVideoExport,
  markGeneratedVideoExportPublished,
  listAccounts: listAnalyticsIntegrations,
  listPostFastPostRecords,
  deletePostFastPostRecords,
  listSlideshowRecords,
  deleteSlideshowRecord,
  uploadPostFastMediaSources,
  publishPost,
  linkPublishedOutput,
  listMetricSnapshots,
  listFollowerSnapshots,
  startTikTokPublicationImport,
  inspectTikTokPublicationImport,
  linkTikTokPublicationImport,
  createTikTokStudioAnalyticsImport,
  inspectTikTokStudioAnalyticsImport,
  createTikTokStudioAnalyticsBatch,
  inspectTikTokStudioAnalyticsBatch,
  enqueueJob,
  getJob,
  listJobs,
  listWorkspaceMembers,
  postfastRequest,
  getUgcRunStatus,
  estimateUgcCost,
  ugcGenerationEnabled: () => process.env.ENABLE_UGC_AUTOMATION === "true",
}

export function createLumenClipMcpServer(
  ownerId: string,
  overrides: Partial<LumenClipMcpServices> = {}
) {
  const services = { ...defaultServices, ...overrides }
  const server = new McpServer({
    name: "lumenclip",
    version: "2.0.0",
  })
  const owned = <T>(task: () => T) => withSystemOwner(ownerId, task)

  registerAutomationReadAndRunTools(server, ownerId, services)
  registerCollectionTools(server, ownerId, services)
  registerOutputAndPublishingTools(server, ownerId, services)

  server.registerTool(
    "lumenclip_schedule_get",
    {
      title: "Check automation schedule",
      description:
        "Returns saved schedule settings and projected upcoming slots for slideshow, video, AI UGC, X, and Threads automations. This never generates or publishes content.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Optional saved automation ID to inspect, e.g. "automation_123". Omit to list projected slots across automations.'
          ),
        from: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            'Inclusive ISO datetime with timezone offset for the projection start, e.g. "2026-07-23T09:00:00+08:00".'
          ),
        days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .default(14)
          .describe(
            "Number of calendar days to project from the start time, e.g. 14."
          ),
        includePaused: z
          .boolean()
          .default(true)
          .describe(
            "Whether paused automations should appear in the schedule report, e.g. false."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(100)
          .describe("Maximum number of schedule entries to return, e.g. 50."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const [automations, socialAutomations, jobs, publications, remote] =
            await Promise.all([
              services.listAutomationRecords(),
              services.listXAutomations(),
              services.listJobs({ limit: 500 }).catch(() => []),
              services.listPostFastPostRecords(),
              services
                .postfastRequest("/social-posts", {
                  query: {
                    from: input.from ?? services.now().toISOString(),
                    to: new Date(
                      (input.from
                        ? Date.parse(input.from)
                        : services.now().getTime()) +
                        input.days * 24 * 60 * 60 * 1000
                    ).toISOString(),
                    page: 0,
                    limit: 200,
                  },
                })
                .catch(() => []),
            ])
          const report = buildScheduleReport({
            automations,
            socialAutomations,
            automationId: input.automationId,
            from: input.from ? new Date(input.from) : services.now(),
            days: input.days,
            includePaused: input.includePaused,
            limit: input.limit,
          })
          return {
            ...report,
            calendarItems: buildCalendarLifecycleItems({
              projections: report.slots,
              jobs,
              publications,
              remote,
              automationId: input.automationId,
              from: new Date(report.from),
              to: new Date(report.to),
              limit: input.limit,
            }),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_slideshow_generate",
    {
      title: "Generate a slideshow draft",
      description:
        "Runs one existing slideshow automation immediately and returns an unpublished, unscheduled draft summary. It never auto-publishes, even when the saved automation is live.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Saved slideshow automation ID to run, e.g. "automation_123".'
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'Optional caller-generated idempotency key for this draft request, e.g. "uat-hdb-2026-07-23".'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ automationId, requestId }) =>
      mcpResult(
        await owned(async () => {
          const automation = await services.getAutomationRecord(automationId)
          if (!automation) throw new Error("Automation not found")
          if (automation.schema.automationKind !== "slideshow") {
            throw new Error("The selected automation is not a slideshow")
          }
          const traceId = requestId || `mcp-${crypto.randomUUID()}`
          const result = await services.runDueAutomations({
            automationId,
            force: true,
            requestId: traceId,
          })
          return {
            automationId,
            requestId: traceId,
            runs: result.created.map(generatedRunSummary),
            skipped: result.skipped,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_ugc_estimate",
    {
      title: "Estimate an AI UGC draft",
      description:
        "Returns an itemized USD generation estimate for a saved UGC automation or an estimate-only configuration. This never starts generation or publishing.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Optional saved AI UGC automation ID to estimate, e.g. "automation_ugc_123".'
          ),
        actorSource: z
          .enum(["generate", "gallery", "upload"])
          .optional()
          .describe(
            'Actor source mode: "generate" creates an avatar, "gallery" uses a saved avatar, "upload" uses actorAssetUrl.'
          ),
        actorAssetUrl: z
          .string()
          .url()
          .optional()
          .describe(
            'HTTPS URL for an uploaded/gallery actor clip when actorSource is "upload", e.g. "https://example.com/avatar.mp4".'
          ),
        voiceModel: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'Voice model identifier to estimate against, e.g. "eleven_multilingual_v2".'
          ),
        lipSyncTier: z
          .enum(["standard", "premium"])
          .optional()
          .describe('Lip-sync quality tier to price, e.g. "standard".'),
        targetDurationSeconds: z
          .number()
          .int()
          .min(15)
          .max(180)
          .optional()
          .describe(
            "Target video duration in seconds for the estimate, e.g. 45."
          ),
        brollCount: z
          .number()
          .int()
          .min(0)
          .max(6)
          .optional()
          .describe(
            "Number of supporting B-roll clips to include in the estimate, e.g. 3."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const { automationId, ...overrides } = input
          let saved: AutomationUgcConfig | undefined
          if (automationId) {
            const automation = await services.getAutomationRecord(automationId)
            if (!automation) throw new Error("Automation not found")
            if (automation.schema.automationKind !== "ugc") {
              throw new Error(
                "The selected automation is not an AI UGC automation"
              )
            }
            saved = automation.schema.ugc
          }
          const configuration = normalizeUgcConfig({
            ...(saved ?? {}),
            ...overrides,
          })
          return {
            automationId,
            estimate: services.estimateUgcCost(configuration),
            assumptions: {
              targetDurationSeconds: configuration.targetDurationSeconds,
              brollCount: configuration.brollCount,
              actorSource: configuration.actorSource,
              lipSyncTier: configuration.lipSyncTier,
            },
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_ugc_generate",
    {
      title: "Generate an AI UGC draft",
      description:
        "Generates one AI UGC draft by queueing a saved AI UGC automation, then returns an unpublished draft operation, expected output ID, cost estimate, and polling action. It never publishes content.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Saved live AI UGC automation ID to queue, e.g. "automation_ugc_123".'
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated idempotency key; reuse it to get the same queued operation, e.g. "ugc-test-001".'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => mcpResult(await owned(() => runUgcDraft(services, input)))
  )

  server.registerTool(
    "lumenclip_automation_update",
    {
      title: "Update or pause an automation",
      description:
        "Updates safe common automation settings and returns the updated automation summary plus changed fields. Use action pause or resume to stop or restart scheduled runs; schedule changes preserve all generation and publishing configuration.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe('Saved automation ID to update, e.g. "automation_123".'),
        expectedUpdatedAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            'Optional optimistic-lock timestamp from automation_get.updatedAt, e.g. "2026-07-23T01:15:00.000Z".'
          ),
        action: z
          .enum(["pause", "resume"])
          .optional()
          .describe(
            'Lifecycle action to apply; use "pause" to stop scheduled runs or "resume" to restart them.'
          ),
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'New display name for the automation, e.g. "Astrology informational".'
          ),
        favorite: z
          .boolean()
          .optional()
          .describe(
            "Whether the automation should be pinned/favorited in the app, e.g. true."
          ),
        schedule: schedulePatchSchema
          .optional()
          .describe(
            'Schedule patch to apply, e.g. {"timezone":"Asia/Singapore","postingTimes":[{"time":"8:00 AM","days":["Mon"],"enabled":true}],"jitterMinutes":10}.'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(await owned(() => updateAutomation(services, input)))
  )

  server.registerTool(
    "lumenclip_analytics_report",
    {
      title: "Read content analytics",
      description:
        "Reads the same stored, owner-scoped publications and snapshots used by Studio reporting without refreshing providers. Returns latest-per-post totals, account breakdowns, follower change, per-post followers gained, and recent posts.",
      inputSchema: {
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(30)
          .describe(
            "Lookback window in days for stored analytics snapshots, e.g. 30."
          ),
        integrationIds: z
          .array(z.string().trim().min(1))
          .max(100)
          .optional()
          .describe(
            'Optional connected account IDs to include, e.g. ["pf_account_123", "pf_account_456"].'
          ),
        postLimit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .default(50)
          .describe(
            "Maximum number of recent attributed posts to return, e.g. 50."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () =>
          buildAnalyticsReport({
            snapshots: await services.listMetricSnapshots(),
            followerSnapshots: await services.listFollowerSnapshots(),
            publications: await services.listPostFastPostRecords(),
            now: services.now(),
            days: input.days,
            integrationIds: input.integrationIds,
            postLimit: input.postLimit,
          })
        )
      )
  )

  registerTikTokPublicationTools(server, ownerId, services)
  registerTikTokStudioAnalyticsTools(server, ownerId, services)

  return server
}

// Compatibility alias for existing local MCP client configuration.
export const createLumenClipTikTokMcpServer = createLumenClipMcpServer

function registerAutomationReadAndRunTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  const owned = <T>(task: () => T) => withSystemOwner(ownerId, task)

  server.registerTool(
    "lumenclip_automations_list",
    {
      title: "List automations",
      description:
        "Lists caller-owned slideshow, video, AI UGC, X, and Threads automations with safe configuration summaries and last-run state.",
      inputSchema: {
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe(
            'Optional case-insensitive search over automation name and kind, e.g. "astrology".'
          ),
        kind: z
          .enum(["slideshow", "video", "ugc", "x", "threads"])
          .optional()
          .describe('Optional automation kind filter, e.g. "slideshow".'),
        status: z
          .enum(["live", "paused", "unknown"])
          .optional()
          .describe('Optional automation lifecycle filter, e.g. "live".'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe(
            "Maximum number of automation summaries to return, e.g. 20."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const [standard, social, standardRuns, socialRuns] =
            await Promise.all([
              services.listAutomationRecords(),
              services.listXAutomations(),
              services.listAutomationRuns({ limit: 500 }),
              services.listXAutomationRuns(),
            ])
          const query = clean(input.query).toLowerCase()
          const items = [
            ...standard.map((record) =>
              automationListItem(
                record,
                standardRuns.find((run) => run.automationId === record.id)
              )
            ),
            ...social.map((record) =>
              socialAutomationListItem(
                record,
                socialRuns.find((run) => run.automationId === record.id)
              )
            ),
          ]
            .filter((item) => !input.kind || item.kind === input.kind)
            .filter((item) => !input.status || item.status === input.status)
            .filter(
              (item) =>
                !query ||
                `${item.name} ${item.kind}`.toLowerCase().includes(query)
            )
            .sort((left, right) =>
              right.updatedAt.localeCompare(left.updatedAt)
            )
          return {
            items: items.slice(0, input.limit),
            hasMore: items.length > input.limit,
            total: items.length,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_templates_list",
    {
      title: "List automation templates",
      description:
        "Lists reusable automation templates and their curated hook counts. Set includeSchema to inspect the complete normalized editor schema before creating an automation.",
      inputSchema: {
        query: z.string().trim().max(200).optional(),
        kind: z.enum(["slideshow", "video", "ugc"]).optional(),
        includeSchema: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const query = clean(input.query).toLowerCase()
          const records = (await services.listAutomationTemplateRecords())
            .filter(
              (record) =>
                !input.kind ||
                automationTemplateSchemaToRuntime(record).automationKind ===
                  input.kind
            )
            .filter(
              (record) =>
                !query ||
                `${record.name} ${record.theme}`.toLowerCase().includes(query)
            )
          return {
            items: records
              .slice(0, input.limit)
              .map((record) =>
                serializeAutomationTemplate(record, input.includeSchema)
              ),
            total: records.length,
            hasMore: records.length > input.limit,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_create",
    {
      title: "Create an automation",
      description:
        "Creates a caller-owned slideshow, video, or AI UGC automation, optionally cloning a reusable template. The requestId makes retries return the same automation.",
      inputSchema: {
        name: z.string().trim().min(1).max(200),
        templateId: z.string().trim().min(1).optional(),
        kind: z.enum(["slideshow", "video", "ugc"]).optional(),
        status: z.enum(["live", "paused"]).default("paused"),
        requestId: z.string().trim().min(1).max(200),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const current = await services.listAutomationRecords()
          const existing = current.find(
            (record) =>
              record.raw?.mcpRequestId === input.requestId &&
              record.raw?.mcpOperation === "automation_create"
          )
          if (existing) {
            return {
              created: false,
              reused: true,
              requestId: input.requestId,
              automation: serializeStandardAutomation(existing),
            }
          }
          const template = input.templateId
            ? (await services.listAutomationTemplateRecords()).find(
                (record) => record.id === input.templateId
              )
            : undefined
          if (input.templateId && !template) {
            throw new Error("Automation template not found")
          }
          const templateKind = template
            ? automationTemplateSchemaToRuntime(template).automationKind
            : undefined
          if (input.kind && templateKind && input.kind !== templateKind) {
            throw new Error(
              `Template kind is ${templateKind}; requested kind was ${input.kind}`
            )
          }
          const record = createLocalAutomationRecord({
            name: input.name,
            automationKind: input.kind ?? templateKind,
            template: template
              ? automationTemplateRecordToRuntimeTemplate(template)
              : undefined,
            overrides: { status: input.status },
          })
          const saved: AutomationRecord = {
            ...record,
            raw: {
              mcpOperation: "automation_create",
              mcpRequestId: input.requestId,
              ...(template ? { templateId: template.id } : {}),
            },
          }
          await services.upsertAutomationRecords({ records: [saved] })
          return {
            created: true,
            reused: false,
            requestId: input.requestId,
            templateId: template?.id,
            automation: {
              ...serializeStandardAutomation(saved),
              schema: serializeAutomationSchema(saved.schema),
            },
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_get",
    {
      title: "Get automation",
      description:
        "Returns one caller-owned automation's normalized schedule, linked collections/accounts, publishing policy, and most recent run.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Saved automation ID returned by automations_list, e.g. "automation_123".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ automationId }) =>
      mcpResult(
        await owned(async () => {
          const standard = await services.getAutomationRecord(automationId)
          if (standard) {
            const lastRun = (
              await services.listAutomationRuns({
                automationId,
                limit: 1,
              })
            )[0]
            return {
              automation: {
                ...serializeStandardAutomation(standard),
                schema: serializeAutomationSchema(standard.schema),
                hookPool: serializeAutomationHookPool(standard),
                manualRunSupported:
                  standard.schema.automationKind === "slideshow" ||
                  standard.schema.automationKind === "ugc",
                linkedCollections: automationCollectionIds(standard.schema),
                linkedAccounts:
                  standard.schema.social_integrations.map(safeAccount),
                publishingPolicy: {
                  postingMode: standard.schema.posting_mode ?? "auto",
                  autoPost: standard.schema.tiktok_post_settings.auto_post,
                  publishType:
                    standard.schema.tiktok_post_settings.publish_type ??
                    (["video", "ugc"].includes(standard.schema.automationKind)
                      ? "video"
                      : "slideshow"),
                },
                lastRun: lastRun ? generatedRunSummary(lastRun) : null,
                resourceUri: `lumenclip://automations/${encodeURIComponent(standard.id)}`,
              },
            }
          }

          const social = await services.getXAutomation(automationId)
          if (!social) throw new Error("Automation not found")
          const lastRun = (await services.listXAutomationRuns(automationId))[0]
          return {
            automation: {
              ...serializeSocialAutomation(social),
              configuration: serializeSocialAutomationConfiguration(social),
              manualRunSupported: true,
              platform: social.platform,
              niche: social.niche.label,
              strategyReady: Boolean(social.brief),
              linkedCollections: [],
              linkedAccounts: social.publishing.integrations.map(safeAccount),
              publishingPolicy: {
                autoPost: social.publishing.autoPost,
              },
              lastRun: lastRun ? socialRunSummary(lastRun) : null,
              resourceUri: `lumenclip://automations/${encodeURIComponent(social.id)}`,
            },
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_schema_update",
    {
      title: "Replace an automation schema",
      description:
        "Replaces the complete normalized editor schema for a slideshow, video, or AI UGC automation. Read automation_get first and send the complete desired schema with its updatedAt timestamp.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        expectedUpdatedAt: z.string().datetime({ offset: true }),
        schema: z.record(z.string(), z.unknown()),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const record = await services.getAutomationRecord(input.automationId)
          if (!record) throw new Error("Automation not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const schema = normalizeAutomationSchema(
            input.schema as unknown as AutomationRecord["schema"],
            automationRecordToSummary(record)
          )
          const updated = await services.patchAutomationRecord({
            id: record.id,
            schema,
          })
          if (!updated) throw new Error("Automation not found")
          return {
            automation: {
              ...serializeStandardAutomation(updated),
              schema: serializeAutomationSchema(updated.schema),
            },
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_formatting_update",
    {
      title: "Patch one automation formatting block",
      description:
        "Updates only the requested hook, body, or CTA formatting block. Omitted fields, all other blocks, the hook pool, publishing settings, and schedule remain unchanged. Dynamic is accepted as an alias for the persisted varying slide-count mode; slideOverrides and imageOverrides are active renderer inputs.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        blockId: z.enum(["hook", "body", "cta"]),
        patch: formattingBlockPatchSchema,
        expectedUpdatedAt: z.string().datetime({ offset: true }),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const record = await services.getAutomationRecord(input.automationId)
          if (!record) throw new Error("Automation not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const formatting = patchFormattingBlock(
            record.schema.formatting,
            input.blockId,
            input.patch
          )
          const updated = await services.patchAutomationRecord({
            id: record.id,
            schema: { ...record.schema, formatting },
          })
          if (!updated) throw new Error("Automation not found")
          return {
            automationId: updated.id,
            updatedAt: updated.updatedAt,
            block: updated.schema.formatting.find(
              (block) => block.id === input.blockId
            ),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_text_item_update",
    {
      title: "Patch one automation text item",
      description:
        "Updates one existing text item inside the requested hook, body, or CTA block. Omitted text and style fields remain unchanged; this tool intentionally does not create or delete renderer items.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        blockId: z.enum(["hook", "body", "cta"]),
        textItemId: z.string().trim().min(1),
        patch: textItemPatchSchema,
        expectedUpdatedAt: z.string().datetime({ offset: true }),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const record = await services.getAutomationRecord(input.automationId)
          if (!record) throw new Error("Automation not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const formatting = patchFormattingTextItem(
            record.schema.formatting,
            input.blockId,
            input.textItemId,
            input.patch
          )
          const updated = await services.patchAutomationRecord({
            id: record.id,
            schema: { ...record.schema, formatting },
          })
          if (!updated) throw new Error("Automation not found")
          const block = updated.schema.formatting.find(
            (item) => item.id === input.blockId
          )
          return {
            automationId: updated.id,
            updatedAt: updated.updatedAt,
            blockId: input.blockId,
            textItem: block?.textItems.find(
              (item) => item.id === input.textItemId
            ),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_delete",
    {
      title: "Delete an automation",
      description:
        "Permanently deletes one caller-owned slideshow, video, or AI UGC automation and cascades its generated slideshows, run history, queue jobs, and draft publication records.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Saved automation ID returned by automations_list, e.g. "automation_123".'
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated audit key for this delete, e.g. "delete-automation-001".'
          ),
        confirmDelete: z
          .literal(true)
          .describe(
            "Must be literal true to confirm permanent deletion of the automation and its generated history."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ automationId, requestId, confirmDelete }) => {
      void confirmDelete
      return mcpResult(
        await owned(async () => {
          const result = await services.deleteAutomationCascade({
            id: automationId,
          })
          return {
            requestId,
            automationId,
            deleted: true,
            ...result,
          }
        })
      )
    }
  )

  server.registerTool(
    "lumenclip_automation_hooks_get",
    {
      title: "Read an automation hook pool",
      description:
        "Returns the canonical hook pool stored on an automation, including enabled state and exact or near-duplicate groups. This is the authoritative hook source; rendered output prompts are not.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Saved slideshow, video, or AI UGC automation ID, e.g. "automation_123".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ automationId }) =>
      mcpResult(
        await owned(async () => {
          const record = await services.getAutomationRecord(automationId)
          if (!record) throw new Error("Automation not found")
          return serializeAutomationHookPool(record)
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_hooks_update",
    {
      title: "Replace an automation hook pool",
      description:
        "Replaces the complete canonical hook pool so agents can add, edit, disable, or prune hooks without reading rendered output prompts. Read the pool first, preserve desired IDs, and optionally remove detected near-duplicates.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Saved automation ID returned by automation_hooks_get, e.g. "automation_123".'
          ),
        expectedUpdatedAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            "Optimistic-lock timestamp returned by automation_hooks_get."
          ),
        hooks: z
          .array(
            z.object({
              id: z.string().trim().min(1).optional(),
              text: z.string().trim().min(1).max(2_000),
              enabled: z.boolean().optional(),
            })
          )
          .max(500)
          .describe(
            "Complete desired hook pool. Omitted existing hooks are pruned."
          ),
        deduplicateNearMatches: z
          .boolean()
          .default(false)
          .describe(
            "When true, keep the first hook in each detected exact or near-duplicate group."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const record = await services.getAutomationRecord(input.automationId)
          if (!record) throw new Error("Automation not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const tokenValidation = assertValidAutomationHookTokens({
            hooks: input.hooks,
            collections: await services.listWordCollections(),
          })
          const hooks = replaceAutomationHookPool({
            current: automationHookItems(record.schema),
            hooks: input.hooks,
            now: services.now().toISOString(),
            deduplicateNearMatches: input.deduplicateNearMatches,
          })
          const updated = await services.patchAutomationRecord({
            id: record.id,
            schema: schemaWithAutomationHookItems(record.schema, hooks),
          })
          if (!updated) throw new Error("Automation not found")
          return {
            ...serializeAutomationHookPool(updated),
            tokenWarnings: tokenValidation.warnings,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_hook_upsert",
    {
      title: "Add or edit automation hooks",
      description:
        "Adds hooks or edits existing hooks by stable ID without replacing the rest of the pool. Returns the complete authoritative pool and duplicate analysis.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
        hooks: z
          .array(
            z.object({
              id: z.string().trim().min(1).optional(),
              text: z.string().trim().min(1).max(2_000),
              enabled: z.boolean().optional(),
            })
          )
          .min(1)
          .max(100),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const record = await services.getAutomationRecord(input.automationId)
          if (!record) throw new Error("Automation not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const tokenValidation = assertValidAutomationHookTokens({
            hooks: input.hooks,
            collections: await services.listWordCollections(),
          })
          const hooks = upsertAutomationHooks({
            current: automationHookItems(record.schema),
            updates: input.hooks,
            now: services.now().toISOString(),
          })
          const updated = await patchAutomationHooks(services, record, hooks)
          return {
            ...serializeAutomationHookPool(updated),
            tokenWarnings: tokenValidation.warnings,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_hook_set_enabled",
    {
      title: "Enable or disable automation hooks",
      description:
        "Toggles selected hooks by stable ID. Disabled hooks remain stored for attribution and can be re-enabled later.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
        hookIds: z.array(z.string().trim().min(1)).min(1).max(500),
        enabled: z.boolean(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const record = await services.getAutomationRecord(input.automationId)
          if (!record) throw new Error("Automation not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const ids = new Set(input.hookIds)
          const current = automationHookItems(record.schema)
          assertHookIdsExist(current, ids)
          const now = services.now().toISOString()
          const hooks = current.map((hook) =>
            ids.has(hook.id) && hook.enabled !== input.enabled
              ? { ...hook, enabled: input.enabled, updatedAt: now }
              : hook
          )
          const updated = await patchAutomationHooks(services, record, hooks)
          return serializeAutomationHookPool(updated)
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_hook_delete",
    {
      title: "Delete automation hooks",
      description:
        "Permanently removes selected hooks from the canonical pool. Historical run plans and performance attribution retain their hook IDs.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
        hookIds: z.array(z.string().trim().min(1)).min(1).max(500),
        confirmDelete: z.literal(true),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ confirmDelete, ...input }) => {
      void confirmDelete
      return mcpResult(
        await owned(async () => {
          const record = await services.getAutomationRecord(input.automationId)
          if (!record) throw new Error("Automation not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const ids = new Set(input.hookIds)
          const current = automationHookItems(record.schema)
          const hooks = current.filter((hook) => !ids.has(hook.id))
          const updated =
            hooks.length === current.length
              ? record
              : await patchAutomationHooks(services, record, hooks)
          return {
            deletedHookIds: current
              .filter((hook) => ids.has(hook.id))
              .map((hook) => hook.id),
            ...serializeAutomationHookPool(updated),
          }
        })
      )
    }
  )

  server.registerTool(
    "lumenclip_hook_performance",
    {
      title: "Read hook-attributed performance",
      description:
        "Joins canonical hook IDs to confirmed publications and their latest metrics. Returns publish count, views, shares, saves, share rate, and mean slide-1-to-2 retention for each hook.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        days: z.number().int().min(1).max(3650).default(90),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const report = await services.hookAnalyticsReport(
            input.automationId,
            {
              days: input.days,
              now: services.now(),
            }
          )
          if (!report) throw new Error("Automation not found")
          return report
        })
      )
  )

  server.registerTool(
    "lumenclip_run_plan_get",
    {
      title: "Get an automation run plan",
      description:
        "Returns the persisted generation plan for one standard automation run, including hook attribution, substitutions, selected media, slide text/layout, reuse warnings, and strategy.",
      inputSchema: {
        runId: z.string().trim().min(1),
        includeDebug: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const run = (
            await services.listAutomationRuns({
              limit: Number.MAX_SAFE_INTEGER,
            })
          ).find((candidate) => candidate.id === input.runId)
          if (!run) throw new Error("Automation run not found")
          const { debug, ...safePlan } = run.plan
          return {
            runId: run.id,
            automationId: run.automationId,
            status: run.status,
            scheduledFor: run.scheduledFor,
            generationSource: run.generationSource,
            plan: input.includeDebug ? { ...safePlan, debug } : safePlan,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
            error: run.error,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_automation_run",
    {
      title: "Run an automation",
      description:
        "Generates one unpublished, unscheduled draft from a saved slideshow, AI UGC, X, or Threads automation. AI UGC runs asynchronously and returns a pollable operation. Saved video automations remain discoverable but do not yet have a shared runner.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Saved slideshow, AI UGC, X, or Threads automation ID to run, e.g. "automation_123".'
          ),
        topic: z
          .string()
          .trim()
          .max(1000)
          .optional()
          .describe(
            'Optional topic override for this manual draft, e.g. "Singapore HDB resale prices in 2026".'
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated idempotency key; reuse it to fetch the same draft operation, e.g. "manual-run-2026-07-23-001".'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      mcpResult(await owned(() => runAutomationDraft(services, input)))
  )
}

function registerCollectionTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  const owned = <T>(task: () => T) => withSystemOwner(ownerId, task)

  server.registerTool(
    "lumenclip_collections_list",
    {
      title: "List collections",
      description:
        "Lists caller-owned image, video, word, and product collections with stable IDs and item counts.",
      inputSchema: {
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe(
            'Optional case-insensitive search over collection name and description, e.g. "hdb interiors".'
          ),
        mediaType: z
          .enum(["image", "video", "word", "product"])
          .optional()
          .describe('Optional collection media type filter, e.g. "image".'),
        minimumItemCount: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe(
            "Only return collections with at least this many items, e.g. 5."
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe(
            "Maximum number of collection summaries to return, e.g. 20."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const [media, words, products] = await Promise.all([
            services.listImageCollections(),
            services.listWordCollections(),
            services.listProductCollections(),
          ])
          const query = clean(input.query).toLowerCase()
          const items = [
            ...media.map(mediaCollectionSummary),
            ...words.map((collection) => ({
              id: collection.id,
              name: collection.name,
              variableName: wordCollectionVariableName(collection),
              token: `[[${wordCollectionVariableName(collection).toUpperCase()}]]`,
              mediaType: "word" as const,
              itemCount: collection.words.length,
              description: collection.description,
              updatedAt: collection.updated_at,
              resourceUri: `lumenclip://collections/${encodeURIComponent(collection.id)}`,
            })),
            ...products.map((collection) => ({
              id: collection.id,
              name: collection.name,
              mediaType: "product" as const,
              itemCount: collection.items.length,
              description: collection.description,
              updatedAt: collection.updatedAt,
              resourceUri: `lumenclip://collections/${encodeURIComponent(collection.id)}`,
            })),
          ]
            .filter(
              (item) => !input.mediaType || item.mediaType === input.mediaType
            )
            .filter((item) => item.itemCount >= input.minimumItemCount)
            .filter(
              (item) =>
                !query ||
                `${item.name} ${item.description ?? ""}`
                  .toLowerCase()
                  .includes(query)
            )
          return {
            items: items.slice(0, input.limit),
            hasMore: items.length > input.limit,
            total: items.length,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_product_collection_get",
    {
      title: "Get a product collection",
      description:
        "Returns a complete read-only product collection, including every product item and its media/metadata.",
      inputSchema: {
        collectionId: z.string().trim().min(1),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ collectionId }) =>
      mcpResult(
        await owned(async () => {
          const collection = (await services.listProductCollections()).find(
            (item) =>
              item.id === collectionId ||
              item.name.toLowerCase() === collectionId.toLowerCase()
          )
          if (!collection) throw new Error("Product collection not found")
          return {
            collection: {
              ...collection,
              resourceUri: `lumenclip://collections/${encodeURIComponent(collection.id)}`,
            },
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_assets_list",
    {
      title: "List media-library assets",
      description:
        "Lists uploaded/generated AssetRecord entries together with music, avatar videos, demos, greenscreen media, and CTA library items.",
      inputSchema: {
        kind: z.enum(["image", "video", "audio", "text"]).optional(),
        scope: z
          .enum(["ugc_ad", "ugc_demo", "greenscreen", "global"])
          .optional(),
        category: z
          .enum([
            "outfit",
            "accessory",
            "background",
            "product",
            "reference",
            "sound",
            "other",
          ])
          .optional(),
        libraryCollection: z
          .enum([
            "music",
            "ugc_avatar_videos",
            "demo_videos",
            "greenscreen_memes",
            "ctas",
          ])
          .optional(),
        query: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const [records, library] = await Promise.all([
            services.listAssetRecords({
              kind: input.kind,
              scope: input.scope,
              category: input.category,
            }),
            services.listMediaLibraryAssets(),
          ])
          const query = clean(input.query).toLowerCase()
          const items = [
            ...records.map((asset) => ({
              recordType: "asset_record" as const,
              ...asset,
            })),
            ...library
              .filter(
                (asset) =>
                  !input.libraryCollection ||
                  asset.collection === input.libraryCollection
              )
              .filter((asset) => !input.kind || asset.kind === input.kind)
              .map((asset) => ({
                recordType: "media_library" as const,
                ...asset,
              })),
          ].filter(
            (asset) =>
              !query ||
              `${asset.name} ${"caption" in asset ? asset.caption : ""} ${
                "text" in asset ? (asset.text ?? "") : ""
              }`
                .toLowerCase()
                .includes(query)
          )
          return {
            items: items.slice(0, input.limit),
            total: items.length,
            hasMore: items.length > input.limit,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_variable_get",
    {
      title: "Get a variable collection",
      description:
        "Returns one caller-owned variable collection, including its complete deduplicated value list. Use lumenclip_collections_list with mediaType word to discover variable IDs.",
      inputSchema: {
        variableId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Existing variable collection ID or exact name, e.g. "zodiac".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const variable = findWordCollection(
            await services.listWordCollections(),
            input.variableId
          )
          if (!variable) throw new Error("Variable collection not found")
          return { variable: variableCollectionDetails(variable) }
        })
      )
  )

  server.registerTool(
    "lumenclip_variable_save",
    {
      title: "Create or update a variable collection",
      description:
        "Creates a caller-owned variable collection or replaces the metadata and values of an existing one. Values are trimmed and deduplicated case-insensitively by the app backend.",
      inputSchema: {
        variableId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Existing variable collection ID or exact name to update, e.g. "zodiac"; omit to create one.'
          ),
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'Display name for a new collection or optional renamed display label, e.g. "Zodiac signs". Required when creating.'
          ),
        description: z
          .string()
          .trim()
          .max(5000)
          .optional()
          .describe(
            "Optional description. Pass an empty string to clear the existing description."
          ),
        values: z
          .array(z.string().trim().min(1).max(500))
          .max(2000)
          .optional()
          .describe(
            'Complete replacement value list, e.g. ["aries", "taurus", "gemini"]. Omit when updating metadata only.'
          ),
        source: z
          .enum(["manual", "ai"])
          .optional()
          .describe(
            'Optional provenance label, either "manual" or "ai"; existing provenance is preserved when omitted.'
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated retry/correlation ID, e.g. "variable-zodiac-save-001".'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const variables = await services.listWordCollections()
          const byId = input.variableId
            ? findWordCollection(variables, input.variableId)
            : null
          if (input.variableId && !byId) {
            throw new Error("Variable collection not found")
          }
          const byName = input.name
            ? variables.find(
                (variable) =>
                  variable.name.toLowerCase() === input.name!.toLowerCase()
              )
            : null
          const existing = byId ?? byName ?? null
          const name = input.name ?? existing?.name
          if (!name) {
            throw new Error("A variable name is required when creating")
          }
          const saved = await services.upsertWordCollection({
            collection: {
              ...(existing ? { id: existing.id } : {}),
              name,
              description:
                input.description !== undefined
                  ? input.description
                  : existing?.description,
              words: input.values ?? existing?.words ?? [],
              source: input.source ?? existing?.source ?? "manual",
              created_at: existing?.created_at,
            },
          })
          return {
            requestId: input.requestId,
            created: !existing,
            variable: variableCollectionDetails(saved),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_variable_delete",
    {
      title: "Delete a variable collection",
      description:
        "Permanently deletes one caller-owned variable collection. Existing automations that reference its ID may fail variable expansion afterward.",
      inputSchema: {
        variableId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Existing variable collection ID or exact name, e.g. "zodiac".'
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated correlation ID, e.g. "variable-zodiac-delete-001".'
          ),
        confirmDelete: z
          .literal(true)
          .describe(
            "Must be literal true to confirm permanent deletion of the variable collection."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ confirmDelete, ...input }) => {
      void confirmDelete
      return mcpResult(
        await owned(async () => {
          const variable = findWordCollection(
            await services.listWordCollections(),
            input.variableId
          )
          if (!variable) throw new Error("Variable collection not found")
          const deleted = await services.deleteWordCollection({
            id: variable.id,
          })
          if (!deleted) throw new Error("Variable collection not found")
          return {
            requestId: input.requestId,
            deleted: true,
            variable: variableCollectionDetails(deleted),
          }
        })
      )
    }
  )

  server.registerTool(
    "lumenclip_collection_save",
    {
      title: "Create or save a media collection",
      description:
        "Creates an empty caller-owned image or video collection, or updates an existing collection's pinned state without replacing its assets. Returns the saved collection summary and warnings for empty new collections.",
      inputSchema: {
        collectionId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Existing media collection ID or alias to update, e.g. "collection_123"; omit to create by name.'
          ),
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Collection display name, e.g. "HDB resale chart screenshots".'
          ),
        mediaType: z
          .enum(["image", "video"])
          .describe(
            'Media kind for the collection, either "image" or "video". Existing collections cannot change type.'
          ),
        pinned: z
          .boolean()
          .optional()
          .describe(
            "Whether the collection should be pinned in the app, e.g. true."
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated idempotency key for this save, e.g. "collection-hdb-create-001".'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const collections = await services.listImageCollections()
          const byId = input.collectionId
            ? findMediaCollection(collections, input.collectionId)
            : null
          if (input.collectionId && !byId) {
            throw new Error("Media collection not found")
          }
          const byName = collections.find(
            (collection) =>
              collection.name.toLowerCase() === input.name.toLowerCase()
          )
          const existing = byId ?? byName ?? null
          if (
            existing &&
            (existing.mediaType === "video" ? "video" : "image") !==
              input.mediaType
          ) {
            throw new Error("A collection's media type cannot be changed")
          }
          if (byId && byId.name !== input.name) {
            throw new Error(
              "Renaming media collections is not supported because automation references use the collection name"
            )
          }
          const created = !existing
          const saved = await services.upsertImageCollection(
            existing
              ? {
                  ...existing,
                  pinned: input.pinned ?? existing.pinned,
                }
              : {
                  name: input.name,
                  created_at: services.now().toISOString(),
                  pinned: input.pinned === true,
                  ...(input.mediaType === "video"
                    ? { mediaType: "video" as const }
                    : {}),
                  images: [],
                }
          )
          return {
            requestId: input.requestId,
            created,
            collection: mediaCollectionSummary(saved),
            warnings: created
              ? [
                  "The collection is empty. Add assets before using it for generation.",
                ]
              : [],
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_collection_add_assets",
    {
      title: "Add assets to a collection",
      description:
        "Downloads validated HTTPS image or video assets into one existing caller-owned media collection. Returns the updated collection summary plus added/duplicate counts. Word and product collections are read-only through this tool.",
      inputSchema: {
        collectionId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Existing image/video collection ID, name, or alias to append assets to, e.g. "collection_123".'
          ),
        assets: z
          .array(
            z.object({
              httpsUrl: z
                .string()
                .url()
                .refine((value) => value.startsWith("https://"), {
                  message: "Asset URLs must use HTTPS",
                })
                .describe(
                  'Public HTTPS media URL to download, e.g. "https://example.com/photo.jpg".'
                ),
              caption: z
                .string()
                .trim()
                .max(5000)
                .optional()
                .describe(
                  'Optional plain-language caption/alt text for the asset, e.g. "Chart of 4-room HDB resale prices".'
                ),
              sourceUrl: z
                .string()
                .url()
                .optional()
                .describe(
                  'Optional attribution/source page URL, e.g. "https://data.gov.sg/...".'
                ),
            })
          )
          .min(1)
          .max(80)
          .describe(
            'Assets to import, e.g. [{"httpsUrl":"https://example.com/photo.jpg","caption":"HDB price chart","sourceUrl":"https://example.com"}].'
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated idempotency key for this import, e.g. "collection-hdb-assets-001".'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const collections = await services.listImageCollections()
          const collection = findMediaCollection(
            collections,
            input.collectionId
          )
          if (!collection) throw new Error("Media collection not found")
          const before = collection.images.length
          await Promise.all(
            input.assets.map((asset) => assertPublicHttpUrl(asset.httpsUrl))
          )
          const result = await services.importRemoteImagesToCollection({
            collectionName: collection.name,
            collectionCreatedAt: collection.created_at,
            mediaType: collection.mediaType,
            images: input.assets.map((asset) => ({
              url: asset.httpsUrl,
              caption: asset.caption,
              sourceUrl: asset.sourceUrl,
            })),
            fetchImpl: fetchPublicMcpAsset,
          })
          const after = result.collection.images.length
          const added = Math.max(0, after - before)
          return {
            requestId: input.requestId,
            collection: mediaCollectionSummary(result.collection),
            added,
            duplicates: Math.max(0, input.assets.length - added),
            failures: [],
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_collection_delete",
    {
      title: "Delete a media collection",
      description:
        "Soft-deletes one caller-owned image or video collection for 30 days. Returns deletion timestamps and any referencing automations. Referenced collections are rejected unless allowReferenced is explicitly true.",
      inputSchema: {
        collectionId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Existing image/video collection ID, name, or alias to soft-delete, e.g. "collection_123".'
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated idempotency key for this delete, e.g. "delete-collection-001".'
          ),
        allowReferenced: z
          .boolean()
          .default(false)
          .describe(
            "Set true only after reviewing returned/known automation dependencies, e.g. false."
          ),
        confirmDelete: z
          .literal(true)
          .describe("Must be literal true to confirm this soft-delete action."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ confirmDelete, ...input }) => {
      void confirmDelete
      return mcpResult(
        await owned(async () => {
          const collections = await services.listImageCollections({
            includeDeleted: true,
          })
          const collection = findMediaCollection(
            collections,
            input.collectionId
          )
          if (!collection) throw new Error("Media collection not found")
          const summary = mediaCollectionSummary(collection)
          if (collection.deletedAt) {
            return {
              requestId: input.requestId,
              collectionId: summary.id,
              deletedAt: collection.deletedAt,
              deletedUntil: collection.deletedUntil,
              alreadyDeleted: true,
              dependencies: [],
            }
          }
          const dependencies = (await services.listAutomationRecords()).flatMap(
            (automation) =>
              automationReferencesCollection(automation, collection)
                ? [{ id: automation.id, name: automation.name }]
                : []
          )
          if (dependencies.length > 0 && !input.allowReferenced) {
            throw new Error(
              `Collection is referenced by ${dependencies.length} automation(s); set allowReferenced: true only after reviewing the dependencies`
            )
          }
          const deleted = await services.deleteImageCollections([
            {
              name: collection.name,
              created_at: collection.created_at,
            },
          ])
          return {
            requestId: input.requestId,
            collectionId: summary.id,
            deletedAt: deleted.deletedAt,
            deletedUntil: deleted.deletedUntil,
            alreadyDeleted: false,
            dependencies,
          }
        })
      )
    }
  )
}

function registerOutputAndPublishingTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  const owned = <T>(task: () => T) => withSystemOwner(ownerId, task)

  server.registerTool(
    "lumenclip_outputs_list",
    {
      title: "List generated outputs",
      description:
        "Lists caller-owned slideshow, generated-video, X, and Threads outputs with readiness, publication state, latest metric summaries, and explicit guidance for deeper analytics.",
      inputSchema: {
        automationId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Optional automation ID to filter generated outputs by, e.g. "automation_123".'
          ),
        outputType: z
          .enum(["slideshow", "video", "x_post", "threads_post"])
          .optional()
          .describe('Optional output type filter, e.g. "slideshow".'),
        status: z
          .enum(["running", "ready", "failed"])
          .optional()
          .describe('Optional generation status filter, e.g. "ready".'),
        publicationState: z
          .enum([
            "not_published",
            "draft",
            "scheduled",
            "published",
            "published_unlinked",
            "failed",
          ])
          .optional()
          .describe('Optional publication state filter, e.g. "not_published".'),
        createdFrom: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            'Inclusive ISO datetime lower bound for output creation, e.g. "2026-07-01T00:00:00+08:00".'
          ),
        createdTo: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            'Inclusive ISO datetime upper bound for output creation, e.g. "2026-07-31T23:59:59+08:00".'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of output summaries to return, e.g. 20."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const items = await listOutputSummaries(services)
          const filtered = items
            .filter(
              (item) =>
                !input.automationId || item.automationId === input.automationId
            )
            .filter(
              (item) =>
                !input.outputType || item.outputType === input.outputType
            )
            .filter((item) => !input.status || item.status === input.status)
            .filter(
              (item) =>
                !input.publicationState ||
                item.publicationState === input.publicationState
            )
            .filter(
              (item) =>
                !input.createdFrom || item.createdAt >= input.createdFrom
            )
            .filter(
              (item) => !input.createdTo || item.createdAt <= input.createdTo
            )
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt)
            )
          return {
            items: filtered.slice(0, input.limit),
            hasMore: filtered.length > input.limit,
            total: filtered.length,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_output_delete",
    {
      title: "Delete an unpublished output",
      description:
        "Permanently deletes one caller-owned slideshow, generated-video, X, or Threads output and its local draft publication records. Published and scheduled outputs are never deleted.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Output ID returned by outputs_list, e.g. "slideshow_123" or "xrun123".'
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated idempotency/audit key for this delete, e.g. "delete-output-001".'
          ),
        confirmDelete: z
          .literal(true)
          .describe(
            "Must be literal true to confirm permanent deletion of this unpublished output."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ confirmDelete, ...input }) => {
      void confirmDelete
      return mcpResult(await owned(() => deleteOutput(services, input)))
    }
  )

  server.registerTool(
    "lumenclip_operations_list",
    {
      title: "List generation operations",
      description:
        "Lists queue jobs and standard/social/video generation operations with status, attempts, timestamps, errors, and output identity.",
      inputSchema: {
        status: z
          .enum([
            "queued",
            "processing",
            "completed",
            "failed",
            "dead",
            "running",
            "succeeded",
          ])
          .optional(),
        type: z.string().trim().min(1).max(100).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const [jobs, runs, socialRuns, videos] = await Promise.all([
            services.listJobs({
              status: isJobStatus(input.status) ? input.status : undefined,
              type: input.type,
              limit: input.limit,
            }),
            services.listAutomationRuns({ limit: input.limit }),
            services.listXAutomationRuns(),
            services.listGeneratedVideoExports({ limit: input.limit }),
          ])
          const operations = [
            ...jobs.map((job) => ({
              id: job.id,
              kind: job.type,
              status: job.status,
              attempts: job.attempts,
              maxAttempts: job.maxAttempts,
              availableAt: job.availableAt,
              createdAt: job.createdAt,
              updatedAt: job.updatedAt,
              error: job.error,
              payload: job.payload,
              result: job.result,
            })),
            ...runs.map((run) => ({
              id: run.id,
              kind: "automation.generate",
              status: run.status,
              automationId: run.automationId,
              outputId: run.slideshowId,
              createdAt: run.createdAt,
              updatedAt: run.updatedAt,
              error: run.error,
            })),
            ...socialRuns.map((run) => ({
              id: run.id,
              kind: `${run.platform}.generate`,
              status: run.status,
              automationId: run.automationId,
              createdAt: run.createdAt,
              updatedAt: run.updatedAt,
              error: run.error,
            })),
            ...videos.map((video) => ({
              id: video.id,
              kind: "video.generate",
              status: video.status,
              createdAt: video.createdAt,
              updatedAt: video.updatedAt,
              error: video.error,
            })),
          ]
            .filter(
              (operation) => !input.status || operation.status === input.status
            )
            .filter((operation) => !input.type || operation.kind === input.type)
            .sort((left, right) =>
              clean(right.createdAt).localeCompare(clean(left.createdAt))
            )
          return {
            items: operations.slice(0, input.limit),
            total: operations.length,
            hasMore: operations.length > input.limit,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_operation_get",
    {
      title: "Get generation operation",
      description:
        "Reads current or terminal status for a slideshow automation run, AI UGC queue/run, social draft run, or generated-video job. Returns operation status, progress, output references, warnings, and errors.",
      inputSchema: {
        operationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Operation, job, run, or generated output ID returned by a generation tool, e.g. "job_123" or "run_123".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ operationId }) =>
      mcpResult(
        await owned(async () => {
          const job = await services.getJob(operationId)
          if (job?.type === "run-ugc-automation") {
            return ugcJobOperation(services, job)
          }
          const ugc = await services.getUgcRunStatus(operationId)
          if (ugc) return ugcRunOperation(services, ugc)
          const regular = (
            await services.listAutomationRuns({ limit: 500 })
          ).find((run) => run.id === operationId)
          if (regular) return regularOperation(regular)
          const social = await services.getXAutomationRun(operationId)
          if (social) return socialOperation(social)
          const video = await services.getGeneratedVideoExport(operationId)
          if (video) return videoOperation(video)
          throw new Error("Operation not found")
        })
      )
  )

  server.registerTool(
    "lumenclip_accounts_list",
    {
      title: "List connected publishing accounts",
      description:
        "Reads safe connected-account metadata and the publishing capabilities exposed by the current PostFast bridge. Returns account IDs, provider/profile metadata, and capabilities; credentials are never returned.",
      inputSchema: {
        provider: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Optional provider/platform filter such as "tiktok", "instagram", "x", "threads", or "linkedin".'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(50)
          .describe("Maximum number of account summaries to return, e.g. 50."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const provider = normalizeProvider(input.provider)
          const accounts = (await services.listAccounts())
            .filter(
              (account) =>
                !provider || normalizeProvider(account.provider) === provider
            )
            .map(accountSummary)
          return {
            items: accounts.slice(0, input.limit),
            hasMore: accounts.length > input.limit,
            total: accounts.length,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_workspace_members_list",
    {
      title: "List workspace members",
      description:
        "Lists caller-workspace members and pending invitations. It returns identity/status metadata only and never exposes Appwrite team secrets.",
      inputSchema: {
        status: z.enum(["pending", "accepted"]).optional(),
        limit: z.number().int().min(1).max(100).default(100),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(async () => {
          const members = (await services.listWorkspaceMembers(ownerId)).filter(
            (member) => !input.status || member.status === input.status
          )
          return {
            items: members.slice(0, input.limit),
            total: members.length,
            hasMore: members.length > input.limit,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_output_publish",
    {
      title: "Publish or schedule an output",
      description:
        "Uploads a ready caller-owned output and creates a PostFast publication for explicitly selected connected accounts. Requires literal confirmation and suppresses duplicate successful publications per output/account.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Ready output ID returned by outputs_list, e.g. "slideshow_123" or "video_123".'
          ),
        targets: z
          .array(
            z.object({
              accountId: z
                .string()
                .trim()
                .min(1)
                .describe(
                  'Connected account ID returned by accounts_list, e.g. "pf_account_123".'
                ),
              mode: z
                .enum(["now", "schedule"])
                .describe(
                  'Publish timing: "now" publishes immediately, "schedule" uses scheduledAt.'
                ),
              scheduledAt: z
                .string()
                .datetime({ offset: true })
                .optional()
                .describe(
                  'Future ISO datetime with timezone offset, required when mode is "schedule", e.g. "2026-07-24T09:00:00+08:00".'
                ),
            })
          )
          .min(1)
          .max(20)
          .describe(
            'Explicit publish targets, e.g. [{"accountId":"pf_account_123","mode":"schedule","scheduledAt":"2026-07-24T09:00:00+08:00"}].'
          ),
        caption: z
          .string()
          .trim()
          .max(100000)
          .optional()
          .describe(
            "Optional caption override. Omit to use the output's generated caption/description."
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated idempotency key for this publish request, e.g. "publish-slideshow-001".'
          ),
        confirmPublish: z
          .literal(true)
          .describe(
            "Must be literal true after the selected accounts and caption have been reviewed."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ confirmPublish, ...input }) => {
      void confirmPublish
      return mcpResult(await owned(() => publishOutput(services, input)))
    }
  )

  server.registerTool(
    "lumenclip_output_mark_published",
    {
      title: "Record a manually published output",
      description:
        "Links an existing public platform post to a caller-owned output without sending content externally. The platform URL is normalized and conflict-checked.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Output ID to mark as manually published, e.g. "slideshow_123" or "video_123".'
          ),
        platform: z
          .string()
          .trim()
          .min(1)
          .max(100)
          .describe(
            'Publishing platform name, e.g. "tiktok", "instagram", "x", "threads", or "linkedin".'
          ),
        publishedUrl: z
          .string()
          .url()
          .describe(
            'Public URL of the already-published platform post, e.g. "https://www.tiktok.com/@user/photo/123".'
          ),
        publishedAt: z
          .string()
          .datetime({ offset: true })
          .describe(
            'Actual publication time as an ISO datetime with timezone offset, e.g. "2026-07-23T21:15:00+08:00".'
          ),
        accountId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "Optional connected account ID returned by accounts_list; omit for provider-only manual links."
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated idempotency key for this manual link, e.g. "manual-link-tiktok-001".'
          ),
        confirmLink: z
          .literal(true)
          .describe(
            "Must be literal true after verifying the URL belongs to this output."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ confirmLink, ...input }) => {
      void confirmLink
      return mcpResult(await owned(() => markOutputPublished(services, input)))
    }
  )
}

async function runAutomationDraft(
  services: LumenClipMcpServices,
  input: { automationId: string; topic?: string; requestId: string }
) {
  const standard = await services.getAutomationRecord(input.automationId)
  if (standard) {
    if (standard.schema.automationKind === "ugc") {
      return runUgcDraft(services, input)
    }
    if (standard.schema.automationKind === "video") {
      throw new Error(
        "Saved video automations do not yet have a server-side generation runner. They can be listed, inspected, scheduled, paused, and resumed through MCP."
      )
    }
    const existing = (
      await services.listAutomationRuns({
        automationId: input.automationId,
        limit: 100,
      })
    ).find((run) => run.requestId === input.requestId)
    if (existing) return regularOperation(existing, true)

    const result = await services.runDueAutomations({
      automationId: input.automationId,
      force: true,
      requestId: input.requestId,
    })
    const run = result.created[0]
    if (!run) {
      return skippedAutomationOperation({
        automationId: input.automationId,
        requestId: input.requestId,
        skipped: result.skipped,
        now: services.now(),
      })
    }
    return regularOperation(run)
  }

  const social = await services.getXAutomation(input.automationId)
  if (!social) throw new Error("Automation not found")
  const existing = (
    await services.listXAutomationRuns(input.automationId)
  ).find((run) => run.requestId === input.requestId)
  if (existing) return socialOperation(existing, true)
  const run = await services.generateStoredXAutomationRun({
    automation: social,
    topic: input.topic,
    requestId: input.requestId,
  })
  return socialOperation(run)
}

async function runUgcDraft(
  services: LumenClipMcpServices,
  input: { automationId: string; requestId: string }
) {
  const automation = await services.getAutomationRecord(input.automationId)
  if (!automation) throw new Error("Automation not found")
  if (automation.schema.automationKind !== "ugc") {
    throw new Error("The selected automation is not an AI UGC automation")
  }
  if (automation.status !== "live") {
    throw new Error("AI UGC generation requires a live automation")
  }
  const configurationErrors = ugcLiveConfigurationErrors(
    automation.status,
    automation.schema
  )
  if (configurationErrors.length) {
    throw new Error(configurationErrors.join("; "))
  }
  if (!services.ugcGenerationEnabled()) {
    throw new Error(
      "AI UGC generation is disabled. Set ENABLE_UGC_AUTOMATION=true for the job worker and MCP process."
    )
  }

  const scheduledFor = services.now().toISOString()
  const queued = await services.enqueueJob({
    type: "run-ugc-automation",
    payload: {
      automationId: input.automationId,
      scheduledFor,
      requestId: input.requestId,
      source: "mcp",
      draftOnly: true,
    },
    dedupeKey: `ugc-mcp:${input.automationId}:${input.requestId}`,
    maxAttempts: 3,
  })
  if (!queued) throw new Error("The generation queue is unavailable")
  const job = await services.getJob(queued.id)
  const payload = jobPayload(job)
  const effectiveScheduledFor =
    typeof payload.scheduledFor === "string"
      ? payload.scheduledFor
      : scheduledFor
  const runId = ugcRunId(input.automationId, effectiveScheduledFor)
  const outputId = ugcExportId(input.automationId, effectiveScheduledFor)
  const timestamp = job?.createdAt ?? scheduledFor
  return {
    automationId: input.automationId,
    requestId: input.requestId,
    runId,
    expectedOutputId: outputId,
    estimate: services.estimateUgcCost(automation.schema.ugc ?? {}),
    operation: {
      id: queued.id,
      kind: "ugc.generate",
      status: "running",
      stage: queued.status === "duplicate" ? "queued_existing" : "queued",
      progress: 0,
      createdAt: timestamp,
      updatedAt: job?.updatedAt ?? timestamp,
      nextPollAfterMs: 5000,
      resourceUri: `lumenclip://operations/${encodeURIComponent(queued.id)}`,
    },
    outputs: [],
    warnings:
      queued.status === "duplicate"
        ? ["Returned the existing operation for this requestId."]
        : [],
    errors: [],
    nextActions: [
      {
        tool: "lumenclip_operation_get",
        arguments: { operationId: queued.id },
      },
    ],
  }
}

function jobPayload(job: Job | null): Record<string, unknown> {
  return job?.payload && typeof job.payload === "object"
    ? (job.payload as Record<string, unknown>)
    : {}
}

async function ugcJobOperation(services: LumenClipMcpServices, job: Job) {
  const payload = jobPayload(job)
  const automationId = clean(payload.automationId)
  const scheduledFor = clean(payload.scheduledFor)
  const runId =
    automationId && scheduledFor ? ugcRunId(automationId, scheduledFor) : ""
  const run = runId ? await services.getUgcRunStatus(runId) : null
  return ugcOperationEnvelope(services, {
    id: job.id,
    job,
    run,
    automationId,
    scheduledFor,
  })
}

async function ugcRunOperation(
  services: LumenClipMcpServices,
  run: UgcRunStatus
) {
  return ugcOperationEnvelope(services, {
    id: run.id,
    run,
    automationId: run.automationId,
    scheduledFor: run.scheduledFor ?? "",
  })
}

async function ugcOperationEnvelope(
  services: LumenClipMcpServices,
  input: {
    id: string
    job?: Job
    run: UgcRunStatus | null
    automationId: string
    scheduledFor: string
  }
) {
  const outputId =
    input.automationId && input.scheduledFor
      ? ugcExportId(input.automationId, input.scheduledFor)
      : ""
  const output = outputId
    ? await services.getGeneratedVideoExport(outputId)
    : null
  const completedStages =
    input.run?.stages.filter((stage) => stage.status === "done").length ?? 0
  const failed =
    input.job?.status === "failed" ||
    input.job?.status === "dead" ||
    input.run?.status === "failed" ||
    output?.status === "failed"
  const succeeded = output?.status === "ready"
  const status = failed ? "failed" : succeeded ? "succeeded" : "running"
  const activeStage = input.run?.stages.find(
    (stage) => stage.status === "active" || stage.status === "failed"
  )?.name
  const stage = succeeded
    ? "complete"
    : failed
      ? (activeStage ?? "failed")
      : (activeStage ?? input.job?.status ?? input.run?.status ?? "queued")
  const createdAt =
    input.run?.createdAt ?? input.job?.createdAt ?? input.scheduledFor ?? null
  const updatedAt = input.run?.updatedAt ?? input.job?.updatedAt ?? createdAt
  return {
    automationId: input.automationId || undefined,
    runId: input.run?.id,
    operation: {
      id: input.id,
      kind: "ugc.generate",
      status,
      stage,
      progress:
        succeeded || failed
          ? 100
          : Math.round((completedStages / ugcStageOrder.length) * 100),
      createdAt,
      updatedAt,
      nextPollAfterMs: status === "running" ? 5000 : null,
      resourceUri: `lumenclip://operations/${encodeURIComponent(input.id)}`,
    },
    outputs:
      succeeded && output
        ? [
            {
              id: output.id,
              outputType: "video",
              publicationState: output.manuallyPublishedAt
                ? "published"
                : "not_published",
              resourceUri: `lumenclip://outputs/${encodeURIComponent(output.id)}`,
            },
          ]
        : [],
    warnings: [],
    errors: failed
      ? [
          {
            code: "OPERATION_FAILED",
            message:
              input.job?.error ??
              input.run?.error ??
              output?.error ??
              "AI UGC generation failed",
          },
        ]
      : [],
  }
}

function skippedAutomationOperation(input: {
  automationId: string
  requestId: string
  skipped: Array<{
    automationId: string
    reason: string
    scheduledFor?: string
  }>
  now: Date
}) {
  const reason = input.skipped[0]?.reason ?? "generation_failed"
  const timestamp = input.now.toISOString()
  return {
    automationId: input.automationId,
    requestId: input.requestId,
    operation: {
      id: input.requestId,
      kind: "automation.run",
      status: "failed",
      stage: "precondition",
      progress: 100,
      createdAt: timestamp,
      updatedAt: timestamp,
      nextPollAfterMs: null,
      resourceUri: `lumenclip://operations/${encodeURIComponent(input.requestId)}`,
    },
    outputs: [],
    skipped: input.skipped,
    warnings: [],
    errors: [
      {
        code: reason === "no_images" ? "COLLECTION_EMPTY" : "OPERATION_FAILED",
        message: `Automation did not create an output: ${reason}`,
        retryable: true,
      },
    ],
  }
}

function automationListItem(
  record: AutomationRecord,
  lastRun?: AutomationRunRecord
) {
  return {
    id: record.id,
    name: record.name,
    kind: record.schema.automationKind,
    status: record.status,
    updatedAt: record.updatedAt,
    collectionIds: automationCollectionIds(record.schema),
    platforms: record.schema.social_integrations.map(
      (integration) => integration.provider
    ),
    manualRunSupported:
      record.schema.automationKind === "slideshow" ||
      record.schema.automationKind === "ugc",
    lastRun: lastRun ? generatedRunSummary(lastRun) : null,
    resourceUri: `lumenclip://automations/${encodeURIComponent(record.id)}`,
  }
}

function socialAutomationListItem(
  record: XAutomationRecord,
  lastRun?: XAutomationRun
) {
  return {
    id: record.id,
    name: record.name,
    kind: record.platform,
    status: record.status,
    updatedAt: record.updatedAt,
    collectionIds: [] as string[],
    platforms: [record.platform],
    manualRunSupported: true,
    lastRun: lastRun ? socialRunSummary(lastRun) : null,
    resourceUri: `lumenclip://automations/${encodeURIComponent(record.id)}`,
  }
}

function socialRunSummary(run: XAutomationRun) {
  return {
    runId: run.id,
    status: run.status,
    platform: run.platform,
    topic: run.topic,
    hook: run.hook,
    postCount: run.posts.length,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    error: run.error,
  }
}

function safeAccount(account: {
  integration_id: string
  provider: string
  name: string
  profile?: string
  disabled?: boolean
}) {
  return {
    id: account.integration_id,
    provider: account.provider,
    name: account.name,
    profile: account.profile,
    disabled: account.disabled === true,
  }
}

function mediaCollectionSummary(collection: StoredImageCollection) {
  const normalized = storedToCollection(collection)
  const captioned = collection.images.filter((image) =>
    clean(image.caption)
  ).length
  return {
    id: normalized.id,
    name: collection.name,
    mediaType:
      collection.mediaType === "video"
        ? ("video" as const)
        : ("image" as const),
    itemCount: collection.images.length,
    description: undefined,
    captionCoverage:
      collection.images.length > 0 ? captioned / collection.images.length : 0,
    pinned: collection.pinned === true,
    createdAt: collection.created_at,
    resourceUri: `lumenclip://collections/${encodeURIComponent(normalized.id)}`,
  }
}

function variableCollectionDetails(variable: WordCollectionRecord) {
  const variableName = wordCollectionVariableName(variable)
  return {
    id: variable.id,
    name: variable.name,
    variableName,
    token: `[[${variableName.toUpperCase()}]]`,
    description: variable.description,
    values: variable.words,
    valueCount: variable.words.length,
    source: variable.source,
    createdAt: variable.created_at,
    updatedAt: variable.updated_at,
    resourceUri: `lumenclip://collections/${encodeURIComponent(variable.id)}`,
  }
}

function findWordCollection(
  variables: WordCollectionRecord[],
  idOrName: string
) {
  const requested = clean(idOrName).toLowerCase()
  return (
    variables.find((variable) => variable.id.toLowerCase() === requested) ??
    variables.find((variable) => variable.name.toLowerCase() === requested) ??
    null
  )
}

function findMediaCollection(collections: StoredImageCollection[], id: string) {
  const requested = clean(id)
  return (
    collections.find((collection) =>
      collectionMatchesId(storedToCollection(collection), requested)
    ) ??
    collections.find(
      (collection) => collection.name.toLowerCase() === requested.toLowerCase()
    ) ??
    null
  )
}

function automationReferencesCollection(
  automation: AutomationRecord,
  collection: StoredImageCollection
) {
  const aliases = new Set(collectionAliases(storedToCollection(collection)))
  const references = [
    ...automationCollectionIds(automation.schema),
    ...(automation.schema.video_format?.segments.flatMap((segment) =>
      segment.collectionId ? [segment.collectionId] : []
    ) ?? []),
  ]
  return references.some((reference) => aliases.has(reference))
}

async function fetchPublicMcpAsset(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  return fetchPublicMcpAssetRedirect(inputUrl(input), init, 0)
}

async function fetchPublicMcpAssetRedirect(
  url: string,
  init: RequestInit | undefined,
  redirectCount: number
): Promise<Response> {
  const parsed = await assertPublicHttpUrl(url)
  if (parsed.protocol !== "https:") {
    throw new Error("Collection asset redirects must stay on HTTPS")
  }
  const response = await fetch(parsed, { ...init, redirect: "manual" })
  if (response.status < 300 || response.status >= 400) return response
  if (redirectCount >= 3) {
    throw new Error("Too many collection asset redirects")
  }
  const location = response.headers.get("location")
  if (!location) throw new Error("Collection asset redirect has no location")
  return fetchPublicMcpAssetRedirect(
    new URL(location, parsed).toString(),
    init,
    redirectCount + 1
  )
}

function inputUrl(input: string | URL | Request) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
}

type OutputSummary = {
  id: string
  outputType: "slideshow" | "video" | "x_post" | "threads_post"
  automationId?: string
  status: "running" | "ready" | "failed"
  publicationState:
    | "not_published"
    | "draft"
    | "scheduled"
    | "published"
    | "published_unlinked"
    | "failed"
  title: string
  previewUri?: string
  createdAt: string
  resourceUri: string
  analytics: {
    available: boolean
    postCount: number
    publicationIds: string[]
    latestCapturedAt?: string
    metrics: MetricTotals
    newFollowers: number
    reportTools: string[]
    guidance: string
  }
}

async function listOutputSummaries(
  services: LumenClipMcpServices
): Promise<OutputSummary[]> {
  const [runs, videos, socialRuns, publications, snapshots] = await Promise.all(
    [
      services.listAutomationRuns({ limit: 500 }),
      services.listGeneratedVideoExports({ limit: 500 }),
      services.listXAutomationRuns(),
      services.listPostFastPostRecords(),
      services.listMetricSnapshots(),
    ]
  )
  return [
    ...runs.flatMap((run) => {
      if (
        !run.slideshowId &&
        run.status !== "running" &&
        run.status !== "failed"
      ) {
        return []
      }
      const id = run.slideshowId ?? run.id
      const related = publications.filter(
        (publication) =>
          (publication.sourceType === "slideshow" &&
            publication.sourceId === id) ||
          (publication.sourceType === "automation" &&
            publication.sourceId === run.id)
      )
      return [
        {
          id,
          outputType: "slideshow" as const,
          automationId: run.automationId,
          status: automationRunOutputStatus(run),
          publicationState: publicationState(related, run.manuallyPublishedAt),
          title: run.plan.title,
          previewUri: run.thumbnailUrl ?? run.outputImages?.[0],
          createdAt: run.createdAt,
          resourceUri: `lumenclip://outputs/${encodeURIComponent(id)}`,
          analytics: outputAnalyticsSummary(related, snapshots),
        },
      ]
    }),
    ...videos.map((video) => {
      const sourceType = generatedVideoSourceType(video)
      return {
        id: video.id,
        outputType: "video" as const,
        automationId: clean(video.sourceConfig.automationId) || undefined,
        status: generatedVideoOutputStatus(video),
        publicationState: publicationState(
          publications.filter(
            (publication) =>
              publication.sourceType === sourceType &&
              publication.sourceId === video.id
          ),
          video.manuallyPublishedAt
        ),
        title: video.title,
        previewUri: video.previewUrl ?? video.videoUrl,
        createdAt: video.createdAt,
        resourceUri: `lumenclip://outputs/${encodeURIComponent(video.id)}`,
        analytics: outputAnalyticsSummary(
          publications.filter(
            (publication) =>
              publication.sourceType === sourceType &&
              publication.sourceId === video.id
          ),
          snapshots
        ),
      }
    }),
    ...socialRuns.map((run) => {
      const related = publications.filter(
        (publication) =>
          publication.sourceType === "x_automation" &&
          publication.sourceId === run.id
      )
      return {
        id: run.id,
        outputType:
          run.platform === "threads"
            ? ("threads_post" as const)
            : ("x_post" as const),
        automationId: run.automationId,
        status:
          run.status === "failed" ? ("failed" as const) : ("ready" as const),
        publicationState: publicationState(
          related,
          run.status === "published" ? run.updatedAt : undefined
        ),
        title: run.hook || run.topic || run.automationName,
        previewUri: run.imageUrls[0],
        createdAt: run.createdAt,
        resourceUri: `lumenclip://outputs/${encodeURIComponent(run.id)}`,
        analytics: outputAnalyticsSummary(related, snapshots),
      }
    }),
  ]
}

function outputAnalyticsSummary(
  publications: PostFastPostRecord[],
  snapshots: PostFastMetricSnapshot[]
): OutputSummary["analytics"] {
  const publicationIds = publications.map((publication) => publication.id)
  const requested = new Set(publicationIds)
  const latestByPost = new Map<string, PostFastMetricSnapshot>()
  for (const snapshot of snapshots) {
    if (!requested.has(snapshot.postId)) continue
    const current = latestByPost.get(snapshot.postId)
    if (!current || snapshot.capturedAt > current.capturedAt) {
      latestByPost.set(snapshot.postId, snapshot)
    }
  }
  const latest = [...latestByPost.values()]
  const hasTikTokStudio = latest.some(
    (snapshot) => snapshot.source === "tiktok_studio"
  )
  return {
    available: latest.length > 0,
    postCount: latest.length,
    publicationIds,
    latestCapturedAt: latest
      .map((snapshot) => snapshot.capturedAt)
      .sort()
      .at(-1),
    metrics: aggregateMetrics(latest.map((snapshot) => snapshot.metrics)),
    newFollowers: latest.reduce(
      (total, snapshot) =>
        total + (numberValue(snapshot.rawMetrics.newFollowers) ?? 0),
      0
    ),
    reportTools: [
      "lumenclip_analytics_report",
      ...(hasTikTokStudio ? ["lumenclip_tiktok_studio_analytics_report"] : []),
    ],
    guidance:
      latest.length > 0
        ? hasTikTokStudio
          ? "Use lumenclip_tiktok_studio_analytics_report for section and slide-level detail."
          : "Use lumenclip_analytics_report for account and post-level detail."
        : publications.length > 0
          ? "This output is published but has no stored metrics yet; capture analytics, then call lumenclip_analytics_report."
          : "This output has no publication record yet; publish or mark it published before requesting analytics.",
  }
}

function automationRunOutputStatus(run: AutomationRunRecord) {
  return run.status === "running"
    ? ("running" as const)
    : run.status === "failed"
      ? ("failed" as const)
      : ("ready" as const)
}

function generatedVideoOutputStatus(video: GeneratedVideoExport) {
  return video.status === "failed"
    ? ("failed" as const)
    : video.status === "ready"
      ? ("ready" as const)
      : ("running" as const)
}

function publicationState(
  publications: PostFastPostRecord[],
  manuallyPublishedAt?: string
): OutputSummary["publicationState"] {
  if (publications.some((item) => item.status === "published")) {
    return "published"
  }
  if (manuallyPublishedAt) return "published_unlinked"
  if (publications.some((item) => item.status === "scheduled"))
    return "scheduled"
  if (
    publications.some((item) =>
      ["draft", "ready_for_review", "awaiting_manual_post"].includes(
        item.status
      )
    )
  ) {
    return "draft"
  }
  if (publications.some((item) => item.status === "failed")) return "failed"
  return "not_published"
}

function regularOperation(run: AutomationRunRecord, reused = false) {
  const progress =
    run.status === "running" ? automationRunProgress(run.id) : undefined
  const outputId = run.slideshowId
  return {
    operation: {
      id: run.id,
      kind: "automation.run",
      status:
        run.status === "running"
          ? "running"
          : run.status === "failed"
            ? "failed"
            : "succeeded",
      stage:
        progress?.stage ??
        (run.status === "running" ? "generating" : "complete"),
      detail: progress?.detail,
      progress: run.status === "running" ? null : 100,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      nextPollAfterMs: run.status === "running" ? 5000 : null,
      resourceUri: `lumenclip://operations/${encodeURIComponent(run.id)}`,
    },
    outputs: outputId
      ? [
          {
            id: outputId,
            outputType: "slideshow",
            publicationState: "not_published",
            resourceUri: `lumenclip://outputs/${encodeURIComponent(outputId)}`,
          },
        ]
      : [],
    warnings: reused ? ["Returned the prior result for this requestId."] : [],
    errors: run.error ? [{ code: "OPERATION_FAILED", message: run.error }] : [],
  }
}

function socialOperation(run: XAutomationRun, reused = false) {
  return {
    operation: {
      id: run.id,
      kind: "automation.run",
      status: run.status === "failed" ? "failed" : "succeeded",
      stage: "complete",
      progress: 100,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      nextPollAfterMs: null,
      resourceUri: `lumenclip://operations/${encodeURIComponent(run.id)}`,
    },
    outputs: [
      {
        id: run.id,
        outputType: run.platform === "threads" ? "threads_post" : "x_post",
        publicationState:
          run.status === "published" ? "published" : "not_published",
        resourceUri: `lumenclip://outputs/${encodeURIComponent(run.id)}`,
      },
    ],
    warnings: [
      ...(reused ? ["Returned the prior result for this requestId."] : []),
      ...(run.needsReview ? ["The generated post needs review."] : []),
    ],
    errors: run.error ? [{ code: "OPERATION_FAILED", message: run.error }] : [],
  }
}

function videoOperation(video: GeneratedVideoExport) {
  const status = generatedVideoOutputStatus(video)
  return {
    operation: {
      id: video.id,
      kind: "video.generate",
      status:
        status === "running"
          ? "running"
          : status === "failed"
            ? "failed"
            : "succeeded",
      stage: video.status,
      progress: status === "running" ? null : 100,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      nextPollAfterMs: status === "running" ? 5000 : null,
      resourceUri: `lumenclip://operations/${encodeURIComponent(video.id)}`,
    },
    outputs:
      status === "ready"
        ? [
            {
              id: video.id,
              outputType: "video",
              publicationState: video.manuallyPublishedAt
                ? "published"
                : "not_published",
              resourceUri: `lumenclip://outputs/${encodeURIComponent(video.id)}`,
            },
          ]
        : [],
    warnings: [],
    errors: video.error
      ? [{ code: "OPERATION_FAILED", message: video.error }]
      : [],
  }
}

type PublishableOutput = {
  id: string
  sourceType: PostFastSourceType
  sourceId: string
  outputType: OutputSummary["outputType"]
  content: string
  mediaUrls: string[]
  automationRun?: AutomationRunRecord
  socialRun?: XAutomationRun
  video?: GeneratedVideoExport
}

async function deleteOutput(
  services: LumenClipMcpServices,
  input: { outputId: string; requestId: string }
) {
  const [runs, publications] = await Promise.all([
    services.listAutomationRuns({ limit: 500 }),
    services.listPostFastPostRecords(),
  ])
  const run = runs.find(
    (candidate) =>
      candidate.id === input.outputId ||
      candidate.slideshowId === input.outputId
  )
  if (run) {
    if (run.status === "running") {
      throw new Error("Running outputs cannot be deleted")
    }
    const slideshowId = run.slideshowId
    const related = publications.filter(
      (publication) =>
        (publication.sourceType === "automation" &&
          publication.sourceId === run.id) ||
        (Boolean(slideshowId) &&
          publication.sourceType === "slideshow" &&
          publication.sourceId === slideshowId)
    )
    assertOutputCanBeDeleted(related, run.manuallyPublishedAt)
    const slideshow = slideshowId
      ? (await services.listSlideshowRecords({ id: slideshowId, limit: 1 }))[0]
      : null
    if (slideshow) {
      const blocked = slideshowDeletionBlockReason({
        slideshowStatus: slideshow.status,
        runStatus: run.status,
        slideshowId: slideshow.id,
        runId: run.id,
        posts: related,
      })
      if (blocked === "published" || blocked === "scheduled") {
        throw new Error(`${capitalize(blocked)} outputs cannot be deleted`)
      }
      await services.deleteSlideshowRecord({ id: slideshow.id })
    }
    await Promise.all([
      services.deleteAutomationRuns({ runIds: [run.id] }),
      ...(slideshowId
        ? [
            services.deletePostFastPostRecords({
              sourceType: "slideshow",
              sourceIds: [slideshowId],
            }),
          ]
        : []),
      services.deletePostFastPostRecords({
        sourceType: "automation",
        sourceIds: [run.id],
      }),
    ])
    return {
      requestId: input.requestId,
      outputId: slideshowId ?? run.id,
      outputType: "slideshow",
      deleted: true,
      recoverable: false,
    }
  }

  const video = await services.getGeneratedVideoExport(input.outputId)
  if (video) {
    if (generatedVideoOutputStatus(video) === "running") {
      throw new Error("Running outputs cannot be deleted")
    }
    const related = publications.filter(
      (publication) =>
        publication.sourceId === video.id ||
        publication.sourceId.startsWith(`${video.id}:`)
    )
    const blocked = video.manuallyPublishedAt
      ? "published"
      : generatedVideoDeletionBlockReason(video.id, related)
    if (blocked) {
      throw new Error(`${capitalize(blocked)} outputs cannot be deleted`)
    }
    await services.deleteGeneratedVideoExport({ id: video.id })
    await services.deletePostFastPostRecords({
      sourceType: generatedVideoSourceType(video),
      sourceIds: [video.id],
    })
    return {
      requestId: input.requestId,
      outputId: video.id,
      outputType: "video",
      deleted: true,
      recoverable: false,
    }
  }

  const social = await services.getXAutomationRun(input.outputId)
  if (social) {
    const related = publications.filter(
      (publication) =>
        publication.sourceType === "x_automation" &&
        publication.sourceId === social.id
    )
    assertOutputCanBeDeleted(
      related,
      social.status === "published" ? social.updatedAt : undefined
    )
    if (social.status === "scheduled") {
      throw new Error("Scheduled outputs cannot be deleted")
    }
    await services.deleteXAutomationRun(social.id)
    await services.deletePostFastPostRecords({
      sourceType: "x_automation",
      sourceIds: [social.id],
    })
    return {
      requestId: input.requestId,
      outputId: social.id,
      outputType: social.platform === "threads" ? "threads_post" : "x_post",
      deleted: true,
      recoverable: false,
    }
  }

  throw new Error("Output not found")
}

function assertOutputCanBeDeleted(
  publications: PostFastPostRecord[],
  manuallyPublishedAt?: string
) {
  if (
    manuallyPublishedAt ||
    publications.some((publication) => publication.status === "published")
  ) {
    throw new Error("Published outputs cannot be deleted")
  }
  if (publications.some((publication) => publication.status === "scheduled")) {
    throw new Error("Scheduled outputs cannot be deleted")
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

async function getPublishableOutput(
  services: LumenClipMcpServices,
  outputId: string
): Promise<PublishableOutput | null> {
  const runs = await services.listAutomationRuns({ limit: 500 })
  const automationRun = runs.find(
    (run) => run.slideshowId === outputId || run.id === outputId
  )
  if (automationRun) {
    if (automationRun.status !== "succeeded" || !automationRun.slideshowId) {
      throw new Error("Output is not ready to publish")
    }
    const content = [
      automationRun.plan.caption || automationRun.plan.title,
      automationRun.plan.hashtags,
    ]
      .filter(Boolean)
      .join("\n\n")
    const useVideo =
      automationRun.plan.publishType === "video" && automationRun.videoUrl
    return {
      id: automationRun.slideshowId,
      sourceType: "slideshow",
      sourceId: automationRun.slideshowId,
      outputType: "slideshow",
      content: content || "Slideshow",
      mediaUrls: useVideo
        ? [automationRun.videoUrl!]
        : (automationRun.outputImages ?? []),
      automationRun,
    }
  }

  const video = await services.getGeneratedVideoExport(outputId)
  if (video) {
    if (video.status !== "ready" || !video.videoUrl) {
      throw new Error("Output is not ready to publish")
    }
    return {
      id: video.id,
      sourceType: generatedVideoSourceType(video),
      sourceId: video.id,
      outputType: "video",
      content:
        [video.description || video.title, ...video.hashtags]
          .filter(Boolean)
          .join("\n\n") || video.title,
      mediaUrls: [video.videoUrl],
      video,
    }
  }

  const socialRun = await services.getXAutomationRun(outputId)
  if (socialRun) {
    if (socialRun.status === "failed") {
      throw new Error("Output is not ready to publish")
    }
    if (socialRun.posts.length !== 1) {
      throw new Error(
        "Reply-chain publishing is not exposed by the current PostFast bridge; this multi-post draft must be published in the app."
      )
    }
    return {
      id: socialRun.id,
      sourceType: "x_automation",
      sourceId: socialRun.id,
      outputType: socialRun.platform === "threads" ? "threads_post" : "x_post",
      content: socialRun.posts[0]?.text || socialRun.hook,
      mediaUrls: socialRun.imageUrls,
      socialRun,
    }
  }
  return null
}

async function publishOutput(
  services: LumenClipMcpServices,
  input: {
    outputId: string
    targets: Array<{
      accountId: string
      mode: "now" | "schedule"
      scheduledAt?: string
    }>
    caption?: string
    requestId: string
  }
) {
  const output = await getPublishableOutput(services, input.outputId)
  if (!output) throw new Error("Output not found")
  const [accounts, existingPublications] = await Promise.all([
    services.listAccounts(),
    services.listPostFastPostRecords({
      sourceIds: [
        output.sourceId,
        ...(output.automationRun ? [output.automationRun.id] : []),
      ],
    }),
  ])
  const uniqueTargets = [
    ...new Map(
      input.targets.map((target) => [target.accountId, target])
    ).values(),
  ]
  const resolved = uniqueTargets.map((target) => {
    const account = accounts.find(
      (candidate) => candidate.integration_id === target.accountId
    )
    if (!account)
      throw new Error(`Publishing account not found: ${target.accountId}`)
    if (
      output.socialRun &&
      normalizeProvider(account.provider) !==
        normalizeProvider(output.socialRun.platform)
    ) {
      throw new Error(
        `${output.socialRun.platform} output cannot be published to ${account.provider}`
      )
    }
    if (target.mode === "schedule") {
      const timestamp = Date.parse(target.scheduledAt ?? "")
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        throw new Error("Scheduled targets require a future scheduledAt")
      }
    }
    return { target, account }
  })

  const existingForTarget = new Map(
    resolved.flatMap(({ account }) => {
      const existing = existingPublications.find(
        (publication) =>
          publicationBelongsToOutput(publication, output) &&
          publication.integrationId === account.integration_id &&
          publication.status !== "failed"
      )
      return existing ? [[account.integration_id, existing] as const] : []
    })
  )
  const media =
    output.mediaUrls.length && existingForTarget.size < resolved.length
      ? await services.uploadPostFastMediaSources({ urls: output.mediaUrls })
      : []
  const records: PostFastPostRecord[] = []
  const warnings: string[] = []
  let failed = 0
  let reused = 0
  for (const { target, account } of resolved) {
    const existing = existingForTarget.get(account.integration_id)
    if (existing) {
      records.push(existing)
      reused += 1
      warnings.push(
        `Skipped duplicate publication for ${account.name}; an existing ${existing.status} record already exists.`
      )
      continue
    }
    const type: PostFastCreatePostType =
      target.mode === "schedule" ? "schedule" : "now"
    const result = await services.publishPost({
      type,
      date: target.mode === "schedule" ? target.scheduledAt : undefined,
      integrationId: account.integration_id,
      provider: account.provider,
      content: clean(input.caption) || output.content,
      media,
      sourceType: output.sourceType,
      sourceId: output.sourceId,
    })
    records.push(result.record)
    if (!result.ok) failed += 1
  }

  if (
    output.socialRun &&
    records.some((record) => record.status === "published")
  ) {
    await services.upsertXAutomationRun({
      ...output.socialRun,
      status: "published",
      updatedAt: new Date().toISOString(),
      publishing: {
        attemptedAt: new Date().toISOString(),
        published: records.filter((record) => record.status === "published")
          .length,
        failed,
      },
    })
  }

  const succeeded = records.length - failed
  return {
    operation: {
      id: input.requestId,
      kind: "output.publish",
      status: failed > 0 && succeeded === 0 ? "failed" : "succeeded",
      progress: 100,
      stage: "complete",
      createdAt: services.now().toISOString(),
      updatedAt: services.now().toISOString(),
      nextPollAfterMs: null,
      resourceUri: `lumenclip://operations/${encodeURIComponent(input.requestId)}`,
    },
    output: {
      id: output.id,
      outputType: output.outputType,
      resourceUri: `lumenclip://outputs/${encodeURIComponent(output.id)}`,
    },
    published: records.filter((record) => record.status === "published").length,
    scheduled: records.filter((record) => record.status === "scheduled").length,
    failed,
    reused,
    publications: records.map(publicationSummary),
    warnings,
  }
}

function publicationBelongsToOutput(
  publication: PostFastPostRecord,
  output: PublishableOutput
) {
  if (
    publication.sourceType === output.sourceType &&
    publication.sourceId === output.sourceId
  ) {
    return true
  }
  return Boolean(
    output.automationRun &&
    publication.sourceType === "automation" &&
    publication.sourceId === output.automationRun.id
  )
}

async function markOutputPublished(
  services: LumenClipMcpServices,
  input: {
    outputId: string
    platform: string
    publishedUrl: string
    publishedAt: string
    accountId?: string
    requestId: string
  }
) {
  const output = await getPublishableOutput(services, input.outputId)
  if (!output) throw new Error("Output not found")
  const platform = normalizeProvider(input.platform)
  if (!platform) throw new Error("A valid platform is required")
  const publishedAt = new Date(input.publishedAt)
  if (!Number.isFinite(publishedAt.getTime())) {
    throw new Error("publishedAt must be a valid datetime")
  }
  let account: PostFastSocialIntegration | undefined
  if (input.accountId) {
    account = (await services.listAccounts()).find(
      (candidate) => candidate.integration_id === input.accountId
    )
    if (!account) throw new Error("Publishing account not found")
    if (normalizeProvider(account.provider) !== platform) {
      throw new Error("The selected account does not match the platform")
    }
  }

  const publication = await services.linkPublishedOutput({
    sourceType: output.sourceType,
    sourceId: output.sourceId,
    integrationId: account?.integration_id ?? `manual-${platform}`,
    provider: account?.provider ?? platform,
    releaseUrl: input.publishedUrl,
    publishedAt: publishedAt.toISOString(),
    content: output.content,
    media: [],
  })

  if (output.automationRun?.slideshowId) {
    await services.markAutomationRunPublished({
      slideshowId: output.automationRun.slideshowId,
      runId: output.automationRun.id,
      publishedAt,
    })
  } else if (output.video) {
    await services.markGeneratedVideoExportPublished({
      id: output.video.id,
      publishedAt,
    })
  } else if (output.socialRun) {
    await services.upsertXAutomationRun({
      ...output.socialRun,
      status: "published",
      updatedAt: publishedAt.toISOString(),
    })
  }

  return {
    requestId: input.requestId,
    output: {
      id: output.id,
      outputType: output.outputType,
      publicationState: "published",
      resourceUri: `lumenclip://outputs/${encodeURIComponent(output.id)}`,
    },
    publication: publicationSummary(publication),
  }
}

function generatedVideoSourceType(
  video: GeneratedVideoExport
): PostFastSourceType {
  return video.type === "template_video" ? "generated_video" : video.type
}

function publicationSummary(record: PostFastPostRecord) {
  return {
    id: record.id,
    accountId: record.integrationId,
    provider: record.provider,
    status: record.status,
    scheduledAt: record.scheduledAt,
    publishedAt: record.publishedAt,
    releaseUrl: record.releaseUrl,
    externalPostId: record.externalPostId,
    error: record.error,
  }
}

function accountSummary(account: PostFastSocialIntegration) {
  const provider = normalizeProvider(account.provider)
  return {
    id: account.integration_id,
    provider: account.provider,
    platform: provider,
    displayName: account.name,
    profile: account.profile,
    picture: account.picture,
    connected: account.disabled !== true,
    capabilities: {
      publishSingle: true,
      publishGallery: provider !== "linkedin",
      publishVideo: true,
      schedule: true,
      replyChain: false,
    },
  }
}

function normalizeProvider(value: unknown) {
  const provider = clean(value).toLowerCase().replace(/_/g, "-")
  if (!provider) return ""
  if (provider === "twitter") return "x"
  if (provider.startsWith("tiktok")) return "tiktok"
  return provider
}

function registerTikTokPublicationTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  server.registerTool(
    "lumenclip_tiktok_import_start",
    {
      title: "Inspect TikTok photo posts",
      description:
        "Starts a read-only download of TikTok photo slideshows. Returns an operation ID; poll the preview tool with that ID.",
      inputSchema: {
        urls: z
          .array(z.string().url())
          .min(1)
          .max(20)
          .describe(
            'Public TikTok /photo/ URLs to inspect, e.g. ["https://www.tiktok.com/@horoiq/photo/7662360324313517330"].'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ urls }) =>
      mcpResult(
        await withSystemOwner(ownerId, () =>
          services.startTikTokPublicationImport(urls)
        )
      )
  )

  server.registerTool(
    "lumenclip_tiktok_import_preview",
    {
      title: "Preview TikTok slideshow matches",
      description:
        "Reads imported TikTok slide text and compares each post with one automation's generated slideshows. Returns candidate matches and confidence; this never changes publication data.",
      inputSchema: {
        operationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'TikTok import operation ID returned by tiktok_import_start, e.g. "tiktok_import_123".'
          ),
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Automation ID whose generated slideshows should be compared, e.g. "automation_astrology_info".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      mcpResult(
        await withSystemOwner(ownerId, () =>
          services.inspectTikTokPublicationImport(input)
        )
      )
  )

  server.registerTool(
    "lumenclip_tiktok_publications_link",
    {
      title: "Link published TikTok slideshows",
      description:
        "Records selected TikTok posts as published and attributes them to generated slideshows. Returns linked publication records. Recovery creates a historical output when the local output was lost. Requires explicit confirmation.",
      inputSchema: {
        operationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'TikTok import operation ID returned by tiktok_import_start, e.g. "tiktok_import_123".'
          ),
        automationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Automation ID used for matching and attribution, e.g. "automation_astrology_info".'
          ),
        integrationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Connected TikTok account ID to attach to the publications, e.g. "pf_tiktok_123".'
          ),
        selections: z
          .array(
            z
              .object({
                postId: z
                  .string()
                  .trim()
                  .min(1)
                  .describe(
                    'Imported TikTok post ID from the preview result, e.g. "7662360324313517330".'
                  ),
                runId: z
                  .string()
                  .trim()
                  .min(1)
                  .optional()
                  .describe(
                    'Existing internal run ID to link, e.g. "run_123"; omit when using recover: true.'
                  ),
                recover: z
                  .boolean()
                  .optional()
                  .describe(
                    "Set true to recreate/link a historical output when the internal run was lost; omit when runId is provided."
                  ),
              })
              .refine(
                (selection) =>
                  Boolean(selection.runId) !== Boolean(selection.recover),
                "Choose exactly one runId or recover: true"
              )
          )
          .min(1)
          .max(20)
          .describe(
            'Reviewed link selections, e.g. [{"postId":"7662360324313517330","runId":"run_123"}] or [{"postId":"7662360324313517330","recover":true}].'
          ),
        confirm: z
          .literal(true)
          .describe(
            "Must be literal true after the TikTok matches have been reviewed."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ confirm, ...input }) => {
      void confirm
      return mcpResult({
        links: await withSystemOwner(ownerId, () =>
          services.linkTikTokPublicationImport(input)
        ),
      })
    }
  )
}

function registerTikTokStudioAnalyticsTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  server.registerTool(
    "lumenclip_tiktok_studio_analytics_import_start",
    {
      title: "Start a TikTok Studio analytics import",
      description:
        "Queues a linked TikTok publication for the connected Chrome companion. Valid Overview captures are saved automatically; LumenClip never accesses TikTok cookies.",
      inputSchema: {
        postId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Local LumenClip publication ID from analytics_report, e.g. "publication_123".'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ postId }) =>
      mcpResult(
        await withSystemOwner(ownerId, async () => {
          const session = await services.createTikTokStudioAnalyticsImport({
            ownerId,
            postId,
          })
          return {
            importId: session.import.id,
            postId: session.import.targetPostId,
            externalPostId: session.import.externalPostId,
            studioUrl: session.import.studioUrl,
            expiresAt: session.import.expiresAt,
            nextActions: [
              "The connected Chrome companion discovers this pending import automatically.",
              "Overview is saved automatically; Viewers and Engagement enrich the same snapshot.",
              {
                tool: "lumenclip_tiktok_studio_analytics_report",
                arguments: { importId: session.import.id },
              },
            ],
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_tiktok_studio_analytics_report",
    {
      title: "Report TikTok Studio analytics with source output details",
      description:
        "Returns pending or linked TikTok Studio analytics joined to each LumenClip publication and its complete persisted slideshow or generated-video structure. Includes per-slide metrics, text/style/media/timing, video source configuration, publication metadata, and snapshot history.",
      inputSchema: {
        importId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Optional pending single-post import ID returned by analytics_import_start, e.g. "import_123".'
          ),
        batchId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Optional pending account batch ID returned by analytics_batch_start, e.g. "batch_123".'
          ),
        postIds: z
          .array(z.string().trim().min(1))
          .max(100)
          .optional()
          .describe(
            'Optional local publication IDs or TikTok platform post IDs, e.g. ["publication_123","7662360324313517330"].'
          ),
        integrationIds: z
          .array(z.string().trim().min(1))
          .max(50)
          .optional()
          .describe(
            'Optional TikTok account integration IDs, e.g. ["pf_tiktok_123"].'
          ),
        automationId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Optional source automation ID, e.g. "automation_astrology_info".'
          ),
        days: z
          .number()
          .int()
          .min(1)
          .max(3650)
          .default(365)
          .describe(
            "Linked-snapshot lookback in days; pending imports are always included."
          ),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("Zero-based post offset for paginated reports."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe(
            "Maximum fully expanded posts to return; use nextOffset for additional pages."
          ),
        historyLimit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(3)
          .describe(
            "Maximum Studio snapshots retained per post for trend comparison."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await withSystemOwner(ownerId, () =>
          buildTikTokStudioMcpReport(
            { ...input, now: services.now() },
            services
          )
        )
      )
  )

  server.registerTool(
    "lumenclip_tiktok_studio_analytics_batch_start",
    {
      title: "Start an account-wide TikTok Studio analytics sync",
      description:
        "Queues an explicit allowlist of linked, published TikTok posts for the connected Chrome companion. Valid captures are saved automatically.",
      inputSchema: {
        integrationIds: z
          .array(z.string().trim().min(1))
          .min(1)
          .max(50)
          .describe(
            'TikTok account integration IDs to include, e.g. ["pf_tiktok_123"].'
          ),
        mode: z
          .enum(["new", "recent", "all"])
          .default("new")
          .describe(
            'Scope: "new" skips posts with Studio snapshots, "recent" uses recentDays, and "all" includes every linked published post.'
          ),
        recentDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(90)
          .describe('Lookback used only for mode "recent", e.g. 90.'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ integrationIds, mode, recentDays }) =>
      mcpResult(
        await withSystemOwner(ownerId, async () => {
          const session = await services.createTikTokStudioAnalyticsBatch({
            ownerId,
            integrationIds,
            mode,
            recentDays,
          })
          return {
            batchId: session.batch.id,
            status: session.batch.status,
            postCount: session.batch.counts.total,
            expiresAt: session.batch.expiresAt,
            nextActions: [
              "The connected Chrome companion discovers and starts this allowlisted batch automatically.",
              "Each valid Overview capture is saved as a durable analytics snapshot automatically.",
              {
                tool: "lumenclip_tiktok_studio_analytics_report",
                arguments: { batchId: session.batch.id },
              },
            ],
          }
        })
      )
  )
}

type UpdateAutomationInput = {
  automationId: string
  expectedUpdatedAt?: string
  action?: "pause" | "resume"
  name?: string
  favorite?: boolean
  schedule?: {
    timezone?: string
    postingTimes?: Array<{
      time: string
      days: AutomationDay[]
      enabled?: boolean
    }>
    jitterMinutes?: number
  }
}

async function updateAutomation(
  services: LumenClipMcpServices,
  input: UpdateAutomationInput
) {
  if (
    !input.action &&
    input.name === undefined &&
    input.favorite === undefined &&
    input.schedule === undefined
  ) {
    throw new Error("Provide at least one automation change")
  }
  if (input.schedule?.timezone) assertTimeZone(input.schedule.timezone)

  const standard = await services.getAutomationRecord(input.automationId)
  if (standard) {
    assertExpectedVersion(standard.updatedAt, input.expectedUpdatedAt)
    const status = statusForAction(input.action)
    const schemaChanged = Boolean(input.action || input.schedule)
    const schema = schemaChanged
      ? {
          ...standard.schema,
          schedule: applySchedulePatch(
            standard.schema.schedule,
            input.schedule,
            input.action
          ),
        }
      : undefined
    const updated = await services.patchAutomationRecord({
      id: standard.id,
      name: input.name,
      favorite: input.favorite,
      status,
      schema,
    })
    if (!updated) throw new Error("Automation not found")
    return serializeStandardAutomation(updated)
  }

  const social = await services.getXAutomation(input.automationId)
  if (!social) throw new Error("Automation not found")
  if (input.favorite !== undefined) {
    throw new Error("X and Threads automations do not support favorites")
  }
  assertExpectedVersion(social.updatedAt, input.expectedUpdatedAt)
  const updated = await services.upsertXAutomation({
    ...social,
    name: input.name ?? social.name,
    status: statusForAction(input.action) ?? social.status,
    schedule: applySchedulePatch(social.schedule, input.schedule, input.action),
  })
  return serializeSocialAutomation(updated)
}

function applySchedulePatch(
  current: AutomationSchedule,
  patch: UpdateAutomationInput["schedule"],
  action: UpdateAutomationInput["action"]
): AutomationSchedule {
  return {
    ...current,
    timezone: patch?.timezone ?? current.timezone,
    posting_times: patch?.postingTimes
      ? patch.postingTimes.map((row) => ({
          time: row.time as AutomationSchedule["posting_times"][number]["time"],
          days: row.days,
          enabled: row.enabled,
        }))
      : current.posting_times,
    paused:
      action === "pause" ? true : action === "resume" ? false : current.paused,
    jitter_minutes: patch?.jitterMinutes ?? current.jitter_minutes,
  }
}

function statusForAction(action: UpdateAutomationInput["action"]) {
  return action === "pause"
    ? ("paused" as const)
    : action === "resume"
      ? ("live" as const)
      : undefined
}

function assertExpectedVersion(actual: string, expected?: string) {
  if (expected && expected !== actual) {
    throw new Error(
      `Automation changed since ${expected}; current updatedAt is ${actual}`
    )
  }
}

function patchFormattingBlock(
  formatting: AutomationFormatSection[],
  blockId: AutomationFormatSectionId,
  patch: z.infer<typeof formattingBlockPatchSchema>
) {
  const current = formatting.find((block) => block.id === blockId)
  if (!current) throw new Error(`Formatting block not found: ${blockId}`)
  const slideCountMin = patch.slideCountMin ?? current.slideCountMin
  const slideCountMax = patch.slideCountMax ?? current.slideCountMax
  if (
    slideCountMin !== undefined &&
    slideCountMax !== undefined &&
    slideCountMin > slideCountMax
  ) {
    throw new Error("slideCountMin cannot be greater than slideCountMax")
  }
  const { slideCountMode, overlayImage, ...fields } = patch
  const updated: AutomationFormatSection = {
    ...current,
    ...fields,
    ...(slideCountMode
      ? {
          slideCountMode:
            slideCountMode === "dynamic"
              ? ("varying" as const)
              : slideCountMode,
        }
      : {}),
    ...(overlayImage
      ? {
          overlayImage: {
            enabled:
              overlayImage.enabled ?? current.overlayImage?.enabled ?? false,
            collectionId:
              overlayImage.collectionId ??
              current.overlayImage?.collectionId ??
              undefined,
            padding:
              overlayImage.padding ?? current.overlayImage?.padding ?? 20,
          },
        }
      : {}),
  }
  return formatting.map((block) => (block.id === blockId ? updated : block))
}

function patchFormattingTextItem(
  formatting: AutomationFormatSection[],
  blockId: AutomationFormatSectionId,
  textItemId: string,
  patch: z.infer<typeof textItemPatchSchema>
) {
  const current = formatting.find((block) => block.id === blockId)
  if (!current) throw new Error(`Formatting block not found: ${blockId}`)
  const textItem = current.textItems.find((item) => item.id === textItemId)
  if (!textItem) {
    throw new Error(`Text item not found in ${blockId}: ${textItemId}`)
  }
  const wordLengthMin = patch.wordLengthMin ?? textItem.wordLengthMin
  const wordLengthMax = patch.wordLengthMax ?? textItem.wordLengthMax
  if (wordLengthMin > wordLengthMax) {
    throw new Error("wordLengthMin cannot be greater than wordLengthMax")
  }
  const updated: AutomationTextItem = { ...textItem, ...patch }
  return formatting.map((block) =>
    block.id === blockId
      ? {
          ...block,
          textItems: block.textItems.map((item) =>
            item.id === textItemId ? updated : item
          ),
        }
      : block
  )
}

function assertTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format()
  } catch {
    throw new Error(`Invalid timezone: ${value}`)
  }
}

export function buildScheduleReport(input: {
  automations: AutomationRecord[]
  socialAutomations: XAutomationRecord[]
  automationId?: string
  from: Date
  days: number
  includePaused: boolean
  limit: number
}) {
  const from = input.from
  if (!Number.isFinite(from.getTime())) throw new Error("Invalid start date")
  const to = new Date(from.getTime() + input.days * 24 * 60 * 60 * 1000)
  const entries = [
    ...input.automations.map((record) => {
      const automation = automationRecordToSummary(record)
      return {
        automation,
        kind: record.schema.automationKind,
        updatedAt: record.updatedAt,
      }
    }),
    ...input.socialAutomations.map((record) => ({
      automation: socialAutomationAsScheduleAutomation(record),
      kind: record.platform,
      updatedAt: record.updatedAt,
    })),
  ]
    .filter(
      (entry) =>
        !input.automationId || entry.automation.id === input.automationId
    )
    .filter(
      (entry) =>
        input.includePaused ||
        (entry.automation.status === "live" &&
          entry.automation.schedule?.paused !== true)
    )

  if (input.automationId && entries.length === 0) {
    throw new Error("Automation not found")
  }

  const slots = entries
    .flatMap((entry) =>
      automationSlotsInRange(entry.automation, from, to).map((slot) => ({
        ...slot,
        kind: entry.kind,
      }))
    )
    .sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor))
    .slice(0, input.limit)

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    automations: entries.map((entry) => ({
      id: entry.automation.id,
      name: entry.automation.name,
      kind: entry.kind,
      status: entry.automation.status,
      updatedAt: entry.updatedAt,
      schedule: serializeSchedule(entry.automation.schedule),
    })),
    slots,
  }
}

function buildCalendarLifecycleItems(input: {
  projections: Array<{
    automationId: string
    automationName: string
    scheduledFor: string
    timezone: string
    paused: boolean
    kind: string
  }>
  jobs: Job[]
  publications: PostFastPostRecord[]
  remote: unknown
  automationId?: string
  from: Date
  to: Date
  limit: number
}) {
  const inRange = (value: string | null | undefined) => {
    const timestamp = Date.parse(clean(value))
    return (
      Number.isFinite(timestamp) &&
      timestamp >= input.from.getTime() &&
      timestamp <= input.to.getTime()
    )
  }
  const jobItems = input.jobs.flatMap((job) => {
    if (
      job.type !== "run-automation" &&
      job.type !== "run-x-automation" &&
      job.type !== "run-ugc-automation"
    ) {
      return []
    }
    const payload =
      job.payload && typeof job.payload === "object"
        ? (job.payload as Record<string, unknown>)
        : {}
    const automationId = clean(payload.automationId)
    const slot = clean(payload.scheduledFor)
    const datetime = slot || clean(job.availableAt || job.createdAt)
    if (
      (input.automationId && automationId !== input.automationId) ||
      !inRange(datetime)
    ) {
      return []
    }
    const status =
      job.status === "failed" || job.status === "dead"
        ? ("generation_failed" as const)
        : job.status === "queued" || job.status === "processing"
          ? ("generating" as const)
          : null
    if (!status) return []
    return [
      {
        id: `job:${job.id}`,
        status,
        sourceStatus: job.status,
        datetime,
        slot: slot || undefined,
        automationId: automationId || undefined,
        source: "job" as const,
        sourceType: job.type,
        sourceId: job.id,
        title:
          status === "generation_failed"
            ? "Content generation failed"
            : "Content is generating",
        error: job.error,
        timestamps: {
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          expectedPublishedAt: slot || undefined,
        },
      },
    ]
  })
  const publicationItems = input.publications.flatMap((publication) => {
    const automationId = clean(
      (
        publication as PostFastPostRecord & {
          automationId?: string
        }
      ).automationId
    )
    if (input.automationId && automationId !== input.automationId) return []
    const status = calendarStatusForPublication(publication.status)
    if (!status) return []
    const datetime =
      clean(publication.publishedAt) ||
      clean(publication.scheduledAt) ||
      publication.updatedAt ||
      publication.createdAt
    if (!inRange(datetime)) return []
    return [
      {
        id: `publication:${publication.id}`,
        status,
        sourceStatus: publication.status,
        datetime,
        slot: clean(publication.scheduledAt) || undefined,
        automationId: automationId || undefined,
        source: "local_post" as const,
        sourceType: publication.sourceType,
        sourceId: publication.sourceId,
        title: publication.content || `${publication.provider} publication`,
        releaseUrl: publication.releaseUrl,
        targets: [
          {
            integrationId: publication.integrationId,
            provider: publication.provider,
            status,
          },
        ],
        timestamps: {
          createdAt: publication.createdAt,
          updatedAt: publication.updatedAt,
          scheduledAt: publication.scheduledAt,
          publishedAt: publication.publishedAt,
        },
      },
    ]
  })
  const localByRemoteId = new Map(
    input.publications.flatMap((publication) =>
      publication.postfastPostId
        ? [[publication.postfastPostId, publication] as const]
        : []
    )
  )
  const remoteRecord = isRecord(input.remote) ? input.remote : {}
  const remotePosts = Array.isArray(remoteRecord.data)
    ? remoteRecord.data
    : Array.isArray(remoteRecord.posts)
      ? remoteRecord.posts
      : Array.isArray(input.remote)
        ? input.remote
        : []
  const remoteItems = remotePosts.flatMap((value, index) => {
    const post = isRecord(value) ? value : {}
    const status = calendarStatusForRemotePost(clean(post.status))
    if (!status) return []
    const id = clean(post.id)
    const local = id ? localByRemoteId.get(id) : undefined
    const automationId = clean(
      (
        local as
          | (PostFastPostRecord & {
              automationId?: string
            })
          | undefined
      )?.automationId
    )
    if (input.automationId && automationId !== input.automationId) return []
    const scheduledAt = clean(post.scheduledAt) || local?.scheduledAt
    const publishedAt = clean(post.publishedAt) || local?.publishedAt
    const datetime =
      status === "published"
        ? publishedAt || scheduledAt || clean(post.createdAt)
        : scheduledAt || clean(post.createdAt)
    if (!inRange(datetime)) return []
    const integration = isRecord(post.integration) ? post.integration : {}
    return [
      {
        id: `postfast:${id || index}`,
        status,
        sourceStatus: clean(post.status),
        datetime,
        slot: scheduledAt || undefined,
        automationId: automationId || undefined,
        source: "postfast" as const,
        sourceType: local?.sourceType || clean(post.sourceType) || "external",
        sourceId: local?.sourceId || id || `remote-${index}`,
        title:
          clean(post.content) ||
          local?.content ||
          (status === "published" ? "Published post" : "Scheduled post"),
        releaseUrl: clean(
          post.releaseURL || post.releaseUrl || local?.releaseUrl
        ),
        targets: [
          {
            integrationId:
              clean(
                integration.id || local?.integrationId || post.socialMediaId
              ) || undefined,
            provider:
              clean(
                integration.providerIdentifier ||
                  local?.provider ||
                  post.provider
              ).toLowerCase() || "unknown",
            status,
          },
        ],
        timestamps: {
          createdAt: clean(post.createdAt) || local?.createdAt,
          updatedAt: clean(post.updatedAt) || local?.updatedAt,
          scheduledAt: scheduledAt || undefined,
          publishedAt: publishedAt || undefined,
        },
      },
    ]
  })
  const remoteLocalIds = new Set(
    remoteItems.flatMap((item) => {
      const match = item.id.match(/^postfast:(.+)$/)
      const local = match ? localByRemoteId.get(match[1]) : undefined
      return local ? [local.id] : []
    })
  )
  const dedupedPublicationItems = publicationItems.filter(
    (item) => !remoteLocalIds.has(item.id.replace(/^publication:/, ""))
  )
  const materializedSlots = new Set(
    [...jobItems, ...dedupedPublicationItems, ...remoteItems].flatMap((item) =>
      item.automationId && item.slot
        ? [`${item.automationId}:${item.slot}`]
        : []
    )
  )
  const projectedItems = input.projections
    .filter(
      (slot) =>
        !materializedSlots.has(`${slot.automationId}:${slot.scheduledFor}`)
    )
    .map((slot) => ({
      id: `planned:${slot.automationId}:${slot.scheduledFor}`,
      status: "planned" as const,
      sourceStatus: slot.paused ? "paused" : "live",
      datetime: slot.scheduledFor,
      slot: slot.scheduledFor,
      timezone: slot.timezone,
      automationId: slot.automationId,
      automationName: slot.automationName,
      source: "projection" as const,
      sourceType: slot.kind,
      sourceId: slot.automationId,
      title: slot.paused ? "Paused automation slot" : "Planned content slot",
      paused: slot.paused,
      timestamps: {
        scheduledAt: slot.scheduledFor,
        expectedPublishedAt: slot.scheduledFor,
      },
    }))
  const items = [
    ...projectedItems,
    ...jobItems,
    ...dedupedPublicationItems,
    ...remoteItems,
  ]
    .sort((left, right) => left.datetime.localeCompare(right.datetime))
    .slice(0, input.limit)
  return {
    items,
    summary: Object.fromEntries(
      [
        "planned",
        "generating",
        "generation_failed",
        "needs_action",
        "draft",
        "failed",
        "scheduled",
        "published",
      ].map((status) => [
        status,
        items.filter((item) => item.status === status).length,
      ])
    ),
  }
}

function calendarStatusForPublication(status: PostFastPostRecord["status"]) {
  if (status === "awaiting_manual_post" || status === "ready_for_review") {
    return "needs_action" as const
  }
  if (status === "draft") return "draft" as const
  if (status === "failed") return "failed" as const
  if (status === "scheduled") return "scheduled" as const
  if (status === "published") return "published" as const
  return null
}

function calendarStatusForRemotePost(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === "PUBLISHED" || normalized === "POSTED") {
    return "published" as const
  }
  if (normalized === "SCHEDULED" || normalized === "QUEUE") {
    return "scheduled" as const
  }
  return null
}

function socialAutomationAsScheduleAutomation(
  record: XAutomationRecord
): Automation {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    account: "",
    handle: "",
    times: record.schedule.posting_times.map((row) => row.time),
    timezone: record.schedule.timezone,
    schedule: record.schedule,
    favorite: false,
    theme: record.platform,
    automationKind: "x_threads",
    platform: record.platform,
    postingMode: "manual",
    generationLeadMinutes: 0,
    socialIntegrations: [],
  }
}

function serializeStandardAutomation(record: AutomationRecord) {
  const summary = automationRecordToSummary(record)
  return {
    id: record.id,
    name: record.name,
    kind: record.schema.automationKind,
    status: record.status,
    favorite: record.favorite,
    updatedAt: record.updatedAt,
    schedule: serializeSchedule(summary.schedule),
  }
}

function serializeAutomationSchema(schema: AutomationRecord["schema"]) {
  return JSON.parse(JSON.stringify(schema)) as Record<string, unknown>
}

function serializeAutomationTemplate(
  record: AutomationTemplateRecord,
  includeSchema: boolean
) {
  const schema = automationTemplateSchemaToRuntime(record)
  return {
    id: record.id,
    name: record.name,
    theme: record.theme,
    kind: schema.automationKind,
    hookCount: automationHookItems(schema).length,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(includeSchema ? { schema: serializeAutomationSchema(schema) } : {}),
    resourceUri: `lumenclip://automation-templates/${encodeURIComponent(record.id)}`,
  }
}

function serializeAutomationHookPool(record: AutomationRecord) {
  const hooks = automationHookItems(record.schema)
  return {
    automationId: record.id,
    updatedAt: record.updatedAt,
    hooks,
    ...analyzeAutomationHookPool(hooks),
    resourceUri: `lumenclip://automations/${encodeURIComponent(record.id)}/hooks`,
  }
}

async function patchAutomationHooks(
  services: LumenClipMcpServices,
  record: AutomationRecord,
  hooks: AutomationHookItem[]
) {
  const updated = await services.patchAutomationRecord({
    id: record.id,
    schema: schemaWithAutomationHookItems(record.schema, hooks),
  })
  if (!updated) throw new Error("Automation not found")
  return updated
}

function upsertAutomationHooks(input: {
  current: AutomationHookItem[]
  updates: Array<{ id?: string; text: string; enabled?: boolean }>
  now: string
}) {
  const updatesById = new Map(
    input.updates.flatMap((hook) =>
      clean(hook.id) ? [[clean(hook.id), hook] as const] : []
    )
  )
  const consumed = new Set<string>()
  const next = input.current.map((hook) => {
    const update = updatesById.get(hook.id)
    if (!update) return hook
    consumed.add(hook.id)
    const text = clean(update.text)
    const enabled = update.enabled ?? hook.enabled
    return text === hook.text && enabled === hook.enabled
      ? hook
      : { ...hook, text, enabled, updatedAt: input.now }
  })
  for (const update of input.updates) {
    const requestedId = clean(update.id)
    if (requestedId && consumed.has(requestedId)) continue
    const text = clean(update.text)
    const existing = next.find(
      (hook) => hook.text.toLowerCase() === text.toLowerCase()
    )
    if (existing) {
      if (update.enabled !== undefined && update.enabled !== existing.enabled) {
        existing.enabled = update.enabled
        existing.updatedAt = input.now
      }
      continue
    }
    next.push({
      id: requestedId || automationHookId(text),
      text,
      enabled: update.enabled ?? true,
      createdAt: input.now,
    })
  }
  return next
}

function assertHookIdsExist(
  hooks: AutomationHookItem[],
  requestedIds: Set<string>
) {
  const existing = new Set(hooks.map((hook) => hook.id))
  const missing = [...requestedIds].filter((id) => !existing.has(id))
  if (missing.length > 0) {
    throw new Error(`Automation hooks not found: ${missing.join(", ")}`)
  }
}

function serializeSocialAutomationConfiguration(record: XAutomationRecord) {
  return {
    niche: record.niche,
    brief: record.brief,
    excludedTopics: record.excludedTopics,
    proofBank: record.proofBank,
    output: record.output,
    generation: record.generation,
    media: record.media,
    discovery: record.discovery,
    benchmarks: record.benchmarks,
    publishing: {
      autoPost: record.publishing.autoPost,
      integrations: record.publishing.integrations.map(safeAccount),
    },
    schedule: serializeSchedule(record.schedule),
    usage: record.usage,
    operations: record.operations,
  }
}

function serializeSocialAutomation(record: XAutomationRecord) {
  return {
    id: record.id,
    name: record.name,
    kind: record.platform,
    status: record.status,
    updatedAt: record.updatedAt,
    schedule: serializeSchedule(record.schedule),
  }
}

function isJobStatus(value: string | undefined): value is Job["status"] {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "completed" ||
    value === "failed" ||
    value === "dead"
  )
}

function serializeSchedule(schedule: AutomationSchedule | undefined) {
  if (!schedule) return null
  return {
    timezone: schedule.timezone,
    paused: schedule.paused === true,
    jitterMinutes: schedule.jitter_minutes ?? 0,
    postingTimes: schedule.posting_times.map((row) => ({
      time: row.time,
      days: row.days,
      enabled: row.enabled !== false,
    })),
  }
}

function generatedRunSummary(run: AutomationRunRecord) {
  return {
    runId: run.id,
    slideshowId: run.slideshowId,
    status: run.status,
    title: run.plan.title,
    hook: run.plan.hook,
    slideCount: run.plan.slides.length,
    thumbnailUrl: run.thumbnailUrl,
    outputImages: run.outputImages,
    createdAt: run.createdAt,
    error: run.error,
  }
}

type MetricTotals = Partial<Record<CanonicalMetric, number>>

export function buildAnalyticsReport(input: {
  snapshots: PostFastMetricSnapshot[]
  followerSnapshots: AccountFollowerSnapshot[]
  publications?: PostFastPostRecord[]
  now: Date
  days: number
  integrationIds?: string[]
  postLimit: number
}) {
  const generatedAt = input.now.toISOString()
  const since = new Date(
    input.now.getTime() - input.days * 24 * 60 * 60 * 1000
  ).toISOString()
  const requested = new Set(
    (input.integrationIds ?? []).map(clean).filter(Boolean)
  )
  const publicationById = new Map(
    (input.publications ?? []).map((publication) => [
      publication.id,
      publication,
    ])
  )
  const visible = input.snapshots
    .map((snapshot) => {
      const publication = publicationById.get(snapshot.postId)
      return publication
        ? {
            ...snapshot,
            integrationId:
              clean(publication.integrationId) || snapshot.integrationId,
            provider: clean(publication.provider) || snapshot.provider,
            publishedAt: publication.publishedAt ?? snapshot.publishedAt,
            content: publication.content || snapshot.content,
            releaseUrl: publication.releaseUrl ?? snapshot.releaseUrl,
            sourceType: publication.sourceType || snapshot.sourceType,
            sourceId: publication.sourceId || snapshot.sourceId,
          }
        : snapshot
    })
    .filter(
      (snapshot) =>
        Date.parse(snapshot.capturedAt) >= Date.parse(since) &&
        (requested.size === 0 || requested.has(snapshot.integrationId))
    )
  const latestByPost = new Map<string, PostFastMetricSnapshot>()
  for (const snapshot of visible) {
    const key = `${snapshot.integrationId}:${snapshot.postId}`
    const existing = latestByPost.get(key)
    if (
      !existing ||
      Date.parse(snapshot.capturedAt) > Date.parse(existing.capturedAt)
    ) {
      latestByPost.set(key, snapshot)
    }
  }
  const latest = [...latestByPost.values()]
  const integrationIds = new Set([
    ...latest.map((snapshot) => snapshot.integrationId),
    ...input.followerSnapshots
      .filter(
        (snapshot) =>
          Date.parse(snapshot.capturedAt) >= Date.parse(since) &&
          (requested.size === 0 || requested.has(snapshot.integrationId))
      )
      .map((snapshot) => snapshot.integrationId),
  ])
  for (const id of requested) integrationIds.add(id)

  const accounts = [...integrationIds]
    .map((integrationId) => {
      const posts = latest.filter(
        (snapshot) => snapshot.integrationId === integrationId
      )
      const followers = input.followerSnapshots
        .filter(
          (snapshot) =>
            snapshot.integrationId === integrationId &&
            Date.parse(snapshot.capturedAt) >= Date.parse(since)
        )
        .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
      const firstFollower = followers[0]
      const lastFollower = followers.at(-1)
      return {
        integrationId,
        provider:
          posts[0]?.provider ||
          lastFollower?.provider ||
          firstFollower?.provider,
        postCount: posts.length,
        metrics: aggregateMetrics(posts.map((post) => post.metrics)),
        newFollowers: posts.reduce(
          (total, post) =>
            total + (numberValue(post.rawMetrics.newFollowers) ?? 0),
          0
        ),
        followers: lastFollower?.followers,
        followerChange:
          firstFollower && lastFollower
            ? lastFollower.followers - firstFollower.followers
            : undefined,
      }
    })
    .sort((left, right) =>
      left.integrationId.localeCompare(right.integrationId)
    )

  return {
    generatedAt,
    since,
    days: input.days,
    totals: aggregateMetrics(accounts.map((account) => account.metrics)),
    accounts,
    posts: latest
      .sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
      .slice(0, input.postLimit)
      .map((snapshot) => ({
        postId: snapshot.postId,
        integrationId: snapshot.integrationId,
        provider: snapshot.provider,
        capturedAt: snapshot.capturedAt,
        publishedAt: snapshot.publishedAt,
        content: snapshot.content,
        contentType: snapshot.contentType,
        sourceType: snapshot.sourceType,
        sourceId: snapshot.sourceId,
        releaseUrl: snapshot.releaseUrl,
        metrics: snapshot.metrics,
        newFollowers: numberValue(snapshot.rawMetrics.newFollowers),
        analyticsSource: snapshot.source ?? "postfast",
        studioReportTool:
          snapshot.source === "tiktok_studio"
            ? "lumenclip_tiktok_studio_analytics_report"
            : undefined,
      })),
  }
}

function aggregateMetrics(values: MetricTotals[]): MetricTotals {
  const totals: MetricTotals = {}
  for (const metrics of values) {
    for (const [key, value] of Object.entries(metrics) as Array<
      [CanonicalMetric, number | undefined]
    >) {
      if (
        value === undefined ||
        key === "engagementRate" ||
        key === "followers"
      ) {
        continue
      }
      totals[key] = (totals[key] ?? 0) + value
    }
  }
  const denominator = totals.views || totals.impressions || totals.reach
  if (denominator && denominator > 0 && totals.interactions !== undefined) {
    totals.engagementRate = (totals.interactions / denominator) * 100
  }
  return totals
}

function numberValue(value: unknown) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function mcpResult(value: Record<string, unknown> | unknown[]) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: Array.isArray(value) ? { items: value } : value,
  }
}
