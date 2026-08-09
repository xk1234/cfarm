import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { pipelineCatalog } from "@/lib/pipeline-executor"
import {
  PIPELINE_STAGE_CATALOG,
  PIPELINE_WORKFLOW_IDS,
} from "@/lib/pipeline-stages"
import { queueWindmillWorkflow } from "@/lib/windmill-workflows"
import { runProductionPipelineStage } from "@/lib/production-pipeline-runtime"
import { toLumenClipDataError } from "@/lib/appwrite-errors"
import { validateAutomationRunOutput } from "@/lib/automation-output-qa"
import {
  getAutomationExperimentDimensions,
  runAutomationExperiment,
} from "@/lib/automation-experiment"
import { deriveAutomationVariableBindings } from "@/lib/automation-variable-bindings"
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
  listAutomationTemplateRecords,
  missingStarterTemplateRecords,
} from "@/lib/automation-templates"
import {
  analyzeAutomationHookPool,
  replaceAutomationHookPool,
} from "@/lib/automation-hook-pool"
import { lintAutomationHooks } from "@/lib/automation-hook-lint"
import { assertValidAutomationHookTokens } from "@/lib/automation-hook-token-validation"
import {
  deleteAutomationRuns,
  previewAutomationHookVariants,
  runDueAutomations,
  listAutomationRuns,
  markAutomationRunPublished,
  updateAutomationRunSlideText,
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
import { absoluteAssetUrl, slideshowDeliveryLinks } from "@/lib/asset-urls"
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
  listPostFastPostRecords,
  type PostFastPostRecord,
  type PostFastSourceType,
} from "@/lib/postfast-posts"
import {
  deletePosts as deletePostFastPostRecords,
  listPublicationRecordsForRead,
  type PublicationReadFilters,
} from "@/lib/post-repository"
import { publicationLinkState as resolvedPublicationLinkState } from "@/lib/publication-link-state"
import { publishPost } from "@/lib/publishing"
import { enqueueJob, getJob, listJobs, type Job } from "@/lib/queue"
import type { Automation } from "@/lib/realfarm-data"
import type {
  AutomationHookItem,
  AutomationSchedule,
  AutomationSchema,
  AutomationSlideDesign,
  TextItem,
  AutomationUgcConfig,
} from "@/lib/realfarm-automation"
import {
  automationCollectionIds,
  automationFormatSection,
  automationHookId,
  automationHookItems,
  automationSlideDesigns,
  normalizeAutomationSchema,
  normalizeUgcConfig,
  schemaWithAutomationHookItems,
  schemaWithAutomationSlideDesigns,
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
import {
  deleteSlideshowRecord,
  listSlideshowRecords,
  updateSlideshowSlideText,
} from "@/lib/slideshows"
import { withSystemOwner } from "@/lib/system-owner-context"
import { assertPublicHttpUrl } from "@/lib/url-guard"
import { buildSlideshowWorkflowTrace } from "@/lib/slideshow-workflow-trace"
import {
  analyzeSlideshowTone,
  slideshowToneToAutomationFields,
  transcribeTikTokSlideshow,
} from "@/lib/slideshow-tone-analysis"
import {
  createTikTokStudioAnalyticsBatch,
  createTikTokStudioAnalyticsImport,
  inspectTikTokStudioAnalyticsBatch,
  inspectTikTokStudioAnalyticsImport,
  listTikTokStudioAnalyticsImports,
  type TikTokStudioImportRecord,
} from "@/lib/tiktok-studio-analytics"
import { buildTikTokStudioMcpReport } from "@/lib/mcp/tiktok-studio-report"
import {
  approveTikTokReplyDrafts,
  createTikTokCommentCollection,
  listTikTokComments,
  queueApprovedTikTokReplies,
} from "@/lib/tiktok-comments"
import { draftTikTokCommentReplies } from "@/lib/tiktok-comment-replies"
import type { XAutomationRecord, XAutomationRun } from "@/lib/x-automation"
import {
  generateStoredXAutomationRun,
  persistGeneratedXAutomationRun,
} from "@/lib/x-automation-runner"
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
import { getReminderSettings } from "@/lib/reminder-settings"
import {
  ugcExportId,
  ugcRunId,
  ugcStageOrder,
} from "@/lib/ugc-automation-runner"
import { getUgcRunStatus, type UgcRunStatus } from "@/lib/ugc-run-status"
import { hookAnalyticsReport } from "@/lib/hook-publications"
import { listWorkspaceMembers } from "@/lib/workspace-members"

const overlayImagePatchSchema = z.object({
  enabled: z.boolean().optional(),
  collectionId: z.string().trim().max(500).optional(),
  padding: z.number().int().min(0).max(2_000).optional(),
})

const slideDesignPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    instructions: z.string().trim().max(5_000).optional(),
    collectionId: z.string().trim().max(500).optional(),
    aspect_ratio: z.enum(["9:16", "4:5", "3:4", "3:2", "1:1"]).optional(),
    imageGrid: z.enum(["none", "2x2", "1x2", "1x3", "oval-icons"]).optional(),
    overlay: z.boolean().optional(),
    aiImageSelection: z.boolean().optional(),
    noText: z.boolean().optional(),
    imageMode: z.enum(["collection", "single_image"]).optional(),
    overlayImage: overlayImagePatchSchema.optional(),
    visualPresetId: z.string().trim().max(200).nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, {
    message: "Provide at least one slide-design field to update.",
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

const automationHookMutationSchema = z.object({
  id: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1).max(2_000),
  enabled: z.boolean().optional(),
  bodySlideCount: z.number().int().min(1).max(100).nullable().optional(),
  tone: z.string().trim().min(1).max(1_000).nullable().optional(),
})

export type LumenClipMcpServices = {
  now: () => Date
  listAutomationRecords: typeof listAutomationRecords
  getAutomationRecord: typeof getAutomationRecord
  upsertAutomationRecords: typeof upsertAutomationRecords
  patchAutomationRecord: typeof patchAutomationRecord
  getAutomationExperimentDimensions: typeof getAutomationExperimentDimensions
  runAutomationExperiment: typeof runAutomationExperiment
  deleteAutomationCascade: typeof deleteAutomationCascade
  listAutomationTemplateRecords: typeof listAutomationTemplateRecords
  hookAnalyticsReport: typeof hookAnalyticsReport
  listXAutomations: typeof listXAutomations
  getXAutomation: typeof getXAutomation
  upsertXAutomation: typeof upsertXAutomation
  runDueAutomations: typeof runDueAutomations
  previewAutomationHookVariants: typeof previewAutomationHookVariants
  deleteAutomationRuns: typeof deleteAutomationRuns
  listAutomationRuns: typeof listAutomationRuns
  markAutomationRunPublished: typeof markAutomationRunPublished
  updateAutomationRunSlideText: typeof updateAutomationRunSlideText
  generateStoredXAutomationRun: typeof generateStoredXAutomationRun
  persistGeneratedXAutomationRun: typeof persistGeneratedXAutomationRun
  getReminderSettings: typeof getReminderSettings
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
  updateSlideshowSlideText: typeof updateSlideshowSlideText
  uploadPostFastMediaSources: typeof uploadPostFastMediaSources
  publishPost: typeof publishPost
  linkPublishedOutput: typeof linkPublishedOutput
  listMetricSnapshots: typeof listMetricSnapshots
  listFollowerSnapshots: typeof listFollowerSnapshots
  transcribeTikTokSlideshow: typeof transcribeTikTokSlideshow
  analyzeSlideshowTone: typeof analyzeSlideshowTone
  slideshowToneToAutomationFields: typeof slideshowToneToAutomationFields
  createTikTokStudioAnalyticsImport: typeof createTikTokStudioAnalyticsImport
  inspectTikTokStudioAnalyticsImport: typeof inspectTikTokStudioAnalyticsImport
  listTikTokStudioAnalyticsImports: typeof listTikTokStudioAnalyticsImports
  createTikTokStudioAnalyticsBatch: typeof createTikTokStudioAnalyticsBatch
  inspectTikTokStudioAnalyticsBatch: typeof inspectTikTokStudioAnalyticsBatch
  createTikTokCommentCollection: typeof createTikTokCommentCollection
  listTikTokComments: typeof listTikTokComments
  draftTikTokCommentReplies: typeof draftTikTokCommentReplies
  approveTikTokReplyDrafts: typeof approveTikTokReplyDrafts
  queueApprovedTikTokReplies: typeof queueApprovedTikTokReplies
  enqueueJob: typeof enqueueJob
  getJob: typeof getJob
  listJobs: typeof listJobs
  listWorkspaceMembers: typeof listWorkspaceMembers
  postfastRequest: typeof postfastRequest
  getUgcRunStatus: typeof getUgcRunStatus
  estimateUgcCost: typeof estimateUgcCost
  ugcGenerationEnabled: () => boolean
  runPipelineStage: typeof runProductionPipelineStage
  queuePipelineWorkflow: typeof queueWindmillWorkflow
}

const defaultServices: LumenClipMcpServices = {
  now: () => new Date(),
  listAutomationRecords,
  getAutomationRecord,
  upsertAutomationRecords,
  patchAutomationRecord,
  getAutomationExperimentDimensions,
  runAutomationExperiment,
  deleteAutomationCascade,
  listAutomationTemplateRecords,
  hookAnalyticsReport,
  listXAutomations,
  getXAutomation,
  upsertXAutomation,
  runDueAutomations,
  previewAutomationHookVariants,
  deleteAutomationRuns,
  listAutomationRuns,
  markAutomationRunPublished,
  updateAutomationRunSlideText,
  generateStoredXAutomationRun,
  persistGeneratedXAutomationRun,
  getReminderSettings,
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
  updateSlideshowSlideText,
  uploadPostFastMediaSources,
  publishPost,
  linkPublishedOutput,
  listMetricSnapshots,
  listFollowerSnapshots,
  transcribeTikTokSlideshow,
  analyzeSlideshowTone,
  slideshowToneToAutomationFields,
  createTikTokStudioAnalyticsImport,
  inspectTikTokStudioAnalyticsImport,
  listTikTokStudioAnalyticsImports,
  createTikTokStudioAnalyticsBatch,
  inspectTikTokStudioAnalyticsBatch,
  createTikTokCommentCollection,
  listTikTokComments,
  draftTikTokCommentReplies,
  approveTikTokReplyDrafts,
  queueApprovedTikTokReplies,
  enqueueJob,
  getJob,
  listJobs,
  listWorkspaceMembers,
  postfastRequest,
  getUgcRunStatus,
  estimateUgcCost,
  ugcGenerationEnabled: () => process.env.ENABLE_UGC_AUTOMATION === "true",
  runPipelineStage: runProductionPipelineStage,
  queuePipelineWorkflow: queueWindmillWorkflow,
}

function readMcpPublications(
  services: Pick<LumenClipMcpServices, "listPostFastPostRecords">,
  surface: string,
  filters?: PublicationReadFilters
) {
  return listPublicationRecordsForRead({
    surface: `mcp_${surface}`,
    filters,
    legacy: () => services.listPostFastPostRecords(filters),
  })
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
  const owned = <T>(task: () => T) => ownedMcpTask(ownerId, task)
  registerAutomationReadAndRunTools(server, ownerId, services)
  registerCollectionTools(server, ownerId, services)
  registerOutputAndPublishingTools(server, ownerId, services)

  server.registerTool(
    "lumenclip_slideshow_generate",
    {
      title: "Generate a slideshow draft",
      description:
        "Runs one existing slideshow template immediately and returns an unpublished, unscheduled draft summary. It never auto-publishes, even when the saved template is live. An optional exact hook bypasses random selection. Each completed run carries `outputImages` (relative slide paths), a per-slide `slides` array (`index`, `role`, `text`, absolute `renderedImageUrl`, absolute `sourceImageUrl`), a signed public `previewUrl`, and a signed direct ZIP `downloadUrl`. Delivery and slide URLs are absolutised against the server's BASE_URL; when BASE_URL is unset they fall back to relative paths.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved slideshow template ID to run."),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'Optional caller-generated idempotency key for this draft request, e.g. "uat-hdb-2026-07-23".'
          ),
        hook: z
          .string()
          .trim()
          .min(1)
          .max(2_000)
          .optional()
          .describe(
            "Optional exact hook text for this draft. When supplied, generation uses this hook instead of randomly selecting from the saved pool."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ templateId: automationId, requestId, hook }) =>
      mcpResult(
        await owned(async () => {
          const automation = await services.getAutomationRecord(automationId)
          if (!automation) throw new Error("Template not found")
          if (automation.schema.automationKind !== "slideshow") {
            throw new Error("The selected template is not a slideshow")
          }
          const traceId = requestId || `mcp-${crypto.randomUUID()}`
          const result = await services.runDueAutomations({
            automationId,
            force: true,
            requestId: traceId,
            hook,
          })
          const priorRuns = await services.listAutomationRuns({
            automationId,
            limit: 500,
          })
          const runs = result.created.map((run) => {
            const qa =
              run.status === "succeeded"
                ? validateAutomationRunOutput({
                    run,
                    schema: automation.schema,
                    priorRuns,
                  })
                : undefined
            return generatedRunSummary(run, ownerId, qa)
          })
          return {
            templateId: automationId,
            requestId: traceId,
            runs,
            skipped: result.skipped,
            nextSteps: result.created.flatMap((run, index) =>
              qaNextSteps({
                automationId,
                outputId: run.slideshowId,
                qa: runs[index]?.qa,
              })
            ),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_ugc_estimate",
    {
      title: "Estimate an AI UGC draft",
      description:
        "Returns an itemized USD generation estimate for a saved UGC template or an estimate-only configuration. This never starts generation or publishing.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Optional saved AI UGC template ID to estimate."),
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
          const { templateId: automationId, ...overrides } = input
          let saved: AutomationUgcConfig | undefined
          if (automationId) {
            const automation = await services.getAutomationRecord(automationId)
            if (!automation) throw new Error("Template not found")
            if (automation.schema.automationKind !== "ugc") {
              throw new Error("The selected template is not an AI UGC template")
            }
            saved = automation.schema.ugc
          }
          const configuration = normalizeUgcConfig({
            ...(saved ?? {}),
            ...overrides,
          })
          return {
            templateId: automationId,
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
        "Generates one AI UGC draft by queueing a saved AI UGC template, then returns an unpublished draft operation, expected output ID, cost estimate, and polling action. It never publishes content.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved live AI UGC template ID to queue."),
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
    async ({ templateId, ...input }) =>
      mcpResult(
        await owned(async () =>
          canonicalTemplateEnvelope(
            await runUgcDraft(services, {
              ...input,
              automationId: templateId,
            })
          )
        )
      )
  )

  server.registerTool(
    "lumenclip_template_update",
    {
      title: "Update a template",
      description:
        "Updates a template's display name, favorite state, or Active/Hidden visibility. Template generation is always an explicit manual action.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved template ID to update."),
        expectedUpdatedAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            'Optional optimistic-lock timestamp from template_get.updatedAt, e.g. "2026-07-23T01:15:00.000Z".'
          ),
        name: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'New display name for the template, e.g. "Astrology informational".'
          ),
        favorite: z
          .boolean()
          .optional()
          .describe(
            "Whether the template should be pinned/favorited in the app, e.g. true."
          ),
        hidden: z
          .boolean()
          .optional()
          .describe(
            "Whether the template belongs in the Hidden tab. Set false to move a built-in starter into Active."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ templateId, ...input }) =>
      mcpResult(
        await owned(() =>
          updateAutomation(services, { ...input, automationId: templateId })
        )
      )
  )

  server.registerTool(
    "lumenclip_analytics_report",
    {
      title: "Read content analytics",
      description:
        "Reads the same stored, owner-scoped publications and snapshots used by Studio reporting without refreshing providers. Returns latest-per-post totals, account breakdowns, follower change, per-post followers gained, and recent posts.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            "Optional template ID whose attributed output metrics should be returned."
          ),
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
        await owned(async () => {
          const [
            allSnapshots,
            allFollowers,
            allPublications,
            runs,
            studioImports,
          ] = await Promise.all([
            services.listMetricSnapshots(),
            services.listFollowerSnapshots(),
            readMcpPublications(services, "analytics"),
            input.templateId
              ? services.listAutomationRuns({
                  automationId: input.templateId,
                  limit: 500,
                })
              : Promise.resolve([]),
            services.listTikTokStudioAnalyticsImports({ limit: 1_000 }),
          ])
          const sourceIds = new Set(
            runs.flatMap((run) => [
              run.id,
              ...(run.slideshowId ? [run.slideshowId] : []),
            ])
          )
          const publications = input.templateId
            ? allPublications.filter((item) => sourceIds.has(item.sourceId))
            : allPublications
          const publicationIds = new Set(
            publications.map((publication) => publication.id)
          )
          const snapshots = input.templateId
            ? allSnapshots.filter((snapshot) =>
                publicationIds.has(snapshot.postId)
              )
            : allSnapshots
          const inferredIntegrationIds = input.templateId
            ? [
                ...new Set(
                  publications
                    .map((publication) => clean(publication.integrationId))
                    .filter(Boolean)
                ),
              ]
            : input.integrationIds
          const report = buildAnalyticsReport({
            snapshots,
            followerSnapshots: allFollowers,
            publications,
            captureImports: studioImports,
            now: services.now(),
            days: input.days,
            integrationIds: input.integrationIds ?? inferredIntegrationIds,
            postLimit: input.postLimit,
          })
          return {
            ...report,
            templateId: input.templateId,
            dataWarning:
              input.templateId && runs.length > 0 && publications.length === 0
                ? "Outputs exist for this template, but no publication records are linked. Metrics cannot be attributed until a publication is linked to its output."
                : undefined,
            nextSteps: analyticsCaptureNextSteps({
              awaitingCapture: report.awaitingCapture,
              integrationIds: report.accounts
                .filter((account) => account.awaitingCapture > 0)
                .map((account) => account.integrationId),
            }),
          }
        })
      )
  )

  registerSlideshowAnalysisTools(server, ownerId, services)
  registerTikTokStudioAnalyticsTools(server, ownerId, services)
  registerTikTokCommentTools(server, ownerId, services)
  registerPipelineTools(server, ownerId, services)

  return server
}

function registerPipelineTools(
  server: McpServer,
  ownerId: string,
  services: Pick<
    LumenClipMcpServices,
    "runPipelineStage" | "queuePipelineWorkflow"
  >
) {
  server.registerTool(
    "lumenclip_pipeline_catalog",
    {
      title: "List production generation pipelines",
      description:
        "Lists the registered slideshow, UGC video, LinkedIn, and X/Threads production workflows plus every atomic and composite deterministic, provider, and storage stage. Each entry declares granularity, side effect, operation, maxExternalCalls, provider/model provenance, and workflow membership. It never executes a stage.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => mcpResult({ workflows: pipelineCatalog() })
  )

  server.registerTool(
    "lumenclip_pipeline_stage_run",
    {
      title: "Run one production pipeline stage",
      description:
        "Runs one registered atomic or composite generation stage with explicit structured JSON input. Atomic network/storage stages declare a one-call boundary; decomposed composites invoke registered stages through the same registry used by full workflow execution. Secrets and media bytes are rejected; provider and storage stages return durable references or operations. The workflow docs identify residual non-provider storage limitations.",
      inputSchema: {
        stageId: z.enum(
          PIPELINE_STAGE_CATALOG.map((stage) => stage.id) as [
            (typeof PIPELINE_STAGE_CATALOG)[number]["id"],
            ...(typeof PIPELINE_STAGE_CATALOG)[number]["id"][],
          ]
        ),
        input: z.record(z.string(), z.unknown()),
        requestId: z.string().trim().min(1).max(200).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      mcpResult(
        await ownedMcpTask(ownerId, () =>
          services.runPipelineStage({
            ownerId,
            stageId: input.stageId,
            stageInput: input.input,
            requestId: input.requestId,
          })
        )
      )
  )

  server.registerTool(
    "lumenclip_pipeline_run",
    {
      title: "Run a named production generation pipeline",
      description:
        "Queues the registered Windmill workflow. Windmill invokes each production stage in order and records every stage as its own run step. startAt and stopAfter select a composable workflow slice. Generation never publishes; publishing remains a separate confirmed MCP action.",
      inputSchema: {
        workflowId: z.enum(PIPELINE_WORKFLOW_IDS),
        input: z.record(z.string(), z.unknown()),
        requestId: z.string().trim().min(1).max(200).optional(),
        startAt: z.string().trim().min(1).optional(),
        stopAfter: z.string().trim().min(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input) =>
      mcpResult(
        await ownedMcpTask(ownerId, () =>
          services.queuePipelineWorkflow({
            ownerId,
            workflowId: input.workflowId,
            workflowInput: input.input,
            requestId: input.requestId,
            startAt: input.startAt,
            stopAfter: input.stopAfter,
          })
        )
      )
  )
}

function registerAutomationReadAndRunTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  const owned = <T>(task: () => T) => ownedMcpTask(ownerId, task)

  server.registerTool(
    "lumenclip_templates_list",
    {
      title: "List templates",
      description:
        "Lists caller-owned slideshow, video, AI UGC, X, and Threads templates with safe configuration summaries and last-run state.",
      inputSchema: {
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe(
            'Optional case-insensitive search over template name and kind, e.g. "astrology".'
          ),
        kind: z
          .enum(["slideshow", "video", "ugc", "x", "threads"])
          .optional()
          .describe('Optional template kind filter, e.g. "slideshow".'),
        status: z
          .enum(["live", "paused", "unknown"])
          .optional()
          .describe('Optional template lifecycle filter, e.g. "live".'),
        visibility: z
          .enum(["active", "hidden", "all"])
          .default("active")
          .describe(
            'Template library visibility. Defaults to "active"; use "hidden" to discover built-in starter templates.'
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of template summaries to return, e.g. 20."),
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
          const [
            ownedStandard,
            starterTemplates,
            social,
            standardRuns,
            socialRuns,
            mediaCollections,
          ] = await Promise.all([
            services.listAutomationRecords(),
            services.listAutomationTemplateRecords(),
            services.listXAutomations(),
            services.listAutomationRuns({ limit: 500 }),
            services.listXAutomationRuns(),
            services.listImageCollections(),
          ])
          const missingStarters = missingStarterTemplateRecords(
            ownedStandard,
            starterTemplates
          )
          const standard =
            missingStarters.length > 0
              ? await services.upsertAutomationRecords({
                  records: missingStarters,
                })
              : ownedStandard
          const query = clean(input.query).toLowerCase()
          const items = [
            ...standard.map((record) =>
              automationListItem(
                record,
                standardRuns.find((run) => run.automationId === record.id),
                mediaCollections,
                ownerId
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
                input.visibility === "all" ||
                (input.visibility === "hidden" ? item.hidden : !item.hidden)
            )
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
    "lumenclip_template_create",
    {
      title: "Create a template",
      description:
        "Creates a caller-owned slideshow, video, or AI UGC template, optionally copying any existing active or hidden template. The requestId makes retries return the same template.",
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
          const [ownedTemplates, starterTemplates] = await Promise.all([
            services.listAutomationRecords(),
            services.listAutomationTemplateRecords(),
          ])
          const missingStarters = missingStarterTemplateRecords(
            ownedTemplates,
            starterTemplates
          )
          const current =
            missingStarters.length > 0
              ? await services.upsertAutomationRecords({
                  records: missingStarters,
                })
              : ownedTemplates
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
              template: serializeStandardAutomation(existing),
              nextSteps: automationCreateNextSteps(current, input),
            }
          }
          const template = input.templateId
            ? current.find((record) => record.id === input.templateId)
            : undefined
          if (input.templateId && !template) {
            throw new Error("Template not found")
          }
          const templateKind = template?.schema.automationKind
          if (input.kind && templateKind && input.kind !== templateKind) {
            throw new Error(
              `Template kind is ${templateKind}; requested kind was ${input.kind}`
            )
          }
          const record = createLocalAutomationRecord({
            name: input.name,
            automationKind: input.kind ?? templateKind,
            schema: template ? structuredClone(template.schema) : undefined,
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
            template: {
              ...serializeStandardAutomation(saved),
              schema: serializeAutomationSchema(saved.schema),
            },
            nextSteps: automationCreateNextSteps(current, input),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_template_clone",
    {
      title: "Clone a template",
      description:
        "Deep-copies one caller-owned template's slide designs, text-agent settings, optional hook pool, and collection bindings into a new template. Run history and outputs are not copied.",
      inputSchema: {
        sourceTemplateId: z.string().trim().min(1),
        name: z.string().trim().min(1).max(200),
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
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
              record.raw?.mcpOperation === "automation_clone"
          )
          if (existing) {
            return {
              created: false,
              reused: true,
              requestId: input.requestId,
              sourceTemplateId: existing.raw?.sourceAutomationId,
              template: {
                ...serializeStandardAutomation(existing),
                schema: serializeAutomationSchema(existing.schema),
              },
            }
          }
          const source = current.find(
            (record) => record.id === input.sourceTemplateId
          )
          if (!source) throw new Error("Source template not found")
          assertExpectedVersion(source.updatedAt, input.expectedUpdatedAt)
          const clone = createLocalAutomationRecord({
            name: input.name,
            automationKind: source.schema.automationKind,
            schema: structuredClone(source.schema),
            overrides: { status: "paused" },
          })
          const saved: AutomationRecord = {
            ...clone,
            status: "paused",
            favorite: false,
            theme: source.theme,
            raw: {
              mcpOperation: "automation_clone",
              mcpRequestId: input.requestId,
              sourceAutomationId: source.id,
            },
          }
          await services.upsertAutomationRecords({ records: [saved] })
          return {
            created: true,
            reused: false,
            requestId: input.requestId,
            sourceTemplateId: source.id,
            template: {
              ...serializeStandardAutomation(saved),
              schema: serializeAutomationSchema(saved.schema),
            },
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_template_get",
    {
      title: "Get template",
      description:
        "Returns one caller-owned template's text rules, optional hooks, slide designs, linked media collections, and most recent draft run.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved template ID returned by templates_list."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ templateId: automationId }) =>
      mcpResult(
        await owned(async () => {
          const standard = await services.getAutomationRecord(automationId)
          if (standard) {
            const [runs, wordCollections, mediaCollections] = await Promise.all(
              [
                services.listAutomationRuns({
                  automationId,
                  limit: 1,
                }),
                services.listWordCollections(),
                services.listImageCollections(),
              ]
            )
            const lastRun = runs[0]
            const variableBindings = deriveAutomationVariableBindings({
              schema: standard.schema,
              collections: wordCollections,
            })
            const collectionReferences =
              normalizeAutomationCollectionReferences(
                standard.schema,
                mediaCollections
              )
            const configurationWarnings =
              automationConfigurationWarnings(standard)
            const nextSteps = automationConfigurationNextSteps({
              automation: standard,
              variableBindings,
              unresolvedCollectionReferences: collectionReferences.unresolved,
            })
            return {
              template: {
                ...serializeStandardAutomation(standard),
                schema: {
                  ...serializeAutomationSchema(standard.schema),
                  hook_slots: variableBindings.hookSlots,
                  hook_slot_overrides: variableBindings.explicitOverrides,
                },
                hookPool: serializeAutomationHookPool(
                  standard,
                  variableBindings
                ),
                variableBindings: {
                  ...variableBindings,
                  unusedExplicitOverrides: variableBindings.unusedOverrides,
                },
                configurationWarnings,
                manualRunSupported:
                  standard.schema.automationKind === "slideshow" ||
                  standard.schema.automationKind === "ugc",
                linkedCollections: collectionReferences.ids,
                unresolvedCollectionReferences: collectionReferences.unresolved,
                lastRun: lastRun ? generatedRunSummary(lastRun, ownerId) : null,
                resourceUri: `lumenclip://templates/${encodeURIComponent(standard.id)}`,
              },
              nextSteps,
            }
          }

          const social = await services.getXAutomation(automationId)
          if (!social) throw new Error("Template not found")
          const lastRun = (await services.listXAutomationRuns(automationId))[0]
          return {
            template: {
              ...serializeSocialAutomation(social),
              configuration: serializeSocialAutomationConfiguration(social),
              manualRunSupported: true,
              platform: social.platform,
              niche: social.niche.label,
              strategyReady: Boolean(social.brief),
              linkedCollections: [],
              lastRun: lastRun ? socialRunSummary(lastRun) : null,
              resourceUri: `lumenclip://templates/${encodeURIComponent(social.id)}`,
            },
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_template_variable_bindings_get",
    {
      title: "Inspect template variable bindings",
      description:
        "Returns the enabled hook tokens, their effective collection bindings or runtime source, every registered runtime variable, explicit override precedence, and stale-override diagnostics. Runtime variables never require a collection.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved slideshow template ID to inspect."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ templateId: automationId }) =>
      mcpResult(
        await owned(async () => {
          const automation = await services.getAutomationRecord(automationId)
          if (!automation) throw new Error("Template not found")
          const bindings = deriveAutomationVariableBindings({
            schema: automation.schema,
            collections: await services.listWordCollections(),
          })
          return {
            templateId: automationId,
            updatedAt: automation.updatedAt,
            ...bindings,
            unusedExplicitOverrides: bindings.unusedOverrides,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_template_experiment_dimensions",
    {
      title: "Inspect template experiment dimensions",
      description:
        "Returns whole-block and per-body-slide content-direction dimensions, tone and model dimensions with their current values; sweepable hook variables with their bound collections and sample values; fixed runtime variables; and the enabled hook count. Call this before running a template experiment.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved slideshow template ID to inspect."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ templateId: automationId }) =>
      mcpResult(
        await owned(() =>
          services.getAutomationExperimentDimensions(automationId)
        )
      )
  )

  const experimentVariationSchema = z.object({
    dimension: z
      .enum([
        "hook",
        "variable",
        "tone",
        "model",
        "collection",
        "contentDirection",
      ])
      .describe(
        'Input axis to sweep, e.g. "contentDirection" for one formatting block.'
      ),
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe(
        'Variable token name for "variable", e.g. "zodiac", or formatting block ID for "contentDirection", e.g. "body"; omit for other dimensions.'
      ),
    slideIndex: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'One-based body slide to target for a "contentDirection" sweep, e.g. 2. Omit to vary the whole formatting block.'
      ),
    values: z
      .array(z.string().trim().min(1).max(1_000))
      .min(1)
      .max(200)
      .describe('Values for this axis, e.g. ["Aries", "Taurus", "Gemini"].'),
  })

  server.registerTool(
    "lumenclip_template_experiment_run",
    {
      title: "Run a template experiment",
      description:
        "Previews the Cartesian product of selected dimensions against one saved slideshow template without persisting, publishing, or consuming hooks. Individual cell failures are returned without aborting the sweep.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved slideshow template ID to test."),
        vary: z
          .array(experimentVariationSchema)
          .max(20)
          .describe(
            'Dimensions to combine, e.g. [{"dimension":"variable","name":"zodiac","values":["Aries","Taurus"]},{"dimension":"tone","values":["Bold & Provocative"]}].'
          ),
        allHooks: z
          .boolean()
          .optional()
          .describe(
            "Whether to add every enabled hook as a sweep axis, e.g. true."
          ),
        repeats: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe(
            "Number of seeded previews for every variant, e.g. 2; defaults to 1."
          ),
        seed: z
          .number()
          .int()
          .optional()
          .describe(
            "Base integer seed for reproducible variable draws, e.g. 4242."
          ),
        textOnly: z
          .boolean()
          .optional()
          .describe(
            "When true, generates and validates slide copy without requiring image collections or selecting visual media. Defaults to false."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ templateId, ...input }) =>
      mcpResult(
        await owned(() =>
          services.runAutomationExperiment({
            ...input,
            automationId: templateId,
          })
        )
      )
  )

  server.registerTool(
    "lumenclip_template_schema_update",
    {
      title: "Patch or replace a template schema",
      description:
        "Patches the normalized editor schema by default: nested objects merge and supplied arrays replace only their array field, while omitted fields remain unchanged. Use mode=replace only when intentionally replacing the complete schema. Always send the current updatedAt timestamp.",
      inputSchema: {
        templateId: z.string().trim().min(1),
        expectedUpdatedAt: z.string().datetime({ offset: true }),
        mode: z.enum(["patch", "replace"]).default("patch"),
        schema: z.record(z.string(), z.unknown()),
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
          const record = await services.getAutomationRecord(input.templateId)
          if (!record) throw new Error("Template not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const candidate =
            input.mode === "replace"
              ? input.schema
              : mergeAutomationSchemaPatch(record.schema, input.schema)
          const schema = normalizeAutomationSchema(
            candidate as unknown as AutomationRecord["schema"],
            automationRecordToSummary(record)
          )
          const updated = await services.patchAutomationRecord({
            id: record.id,
            schema,
            expectedUpdatedAt: input.expectedUpdatedAt,
            now: services.now(),
          })
          if (!updated) throw new Error("Template not found")
          const serializedSchema = serializeAutomationSchema(updated.schema)
          return {
            template: {
              ...serializeStandardAutomation(updated),
              schema: serializedSchema,
            },
            schemaDiff: diffAutomationSchemas(
              serializeAutomationSchema(record.schema),
              serializedSchema
            ),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_template_slide_design_update",
    {
      title: "Patch one template slide design",
      description:
        "Updates one independent slide design used by the text agent when planning a slideshow. Omitted fields and every other design remain unchanged.",
      inputSchema: {
        templateId: z.string().trim().min(1),
        designId: z.string().trim().min(1),
        patch: slideDesignPatchSchema,
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
          const record = await services.getAutomationRecord(input.templateId)
          if (!record) throw new Error("Template not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const slideDesigns = patchSlideDesign(
            automationSlideDesigns(record.schema),
            input.designId,
            input.patch
          )
          const schema = schemaWithAutomationSlideDesigns(
            record.schema,
            slideDesigns
          )
          const updated = await services.patchAutomationRecord({
            id: record.id,
            schema,
            expectedUpdatedAt: input.expectedUpdatedAt,
            now: services.now(),
          })
          if (!updated) throw new Error("Template not found")
          return {
            templateId: updated.id,
            updatedAt: updated.updatedAt,
            slideDesign: automationSlideDesigns(updated.schema).find(
              (design) => design.id === input.designId
            ),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_template_slide_text_item_update",
    {
      title: "Patch one template text item",
      description:
        "Updates one existing text item inside one slide design. Omitted text and style fields remain unchanged; this tool intentionally does not create or delete renderer items.",
      inputSchema: {
        templateId: z.string().trim().min(1),
        designId: z.string().trim().min(1),
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
          const record = await services.getAutomationRecord(input.templateId)
          if (!record) throw new Error("Template not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const slideDesigns = patchSlideDesignTextItem(
            automationSlideDesigns(record.schema),
            input.designId,
            input.textItemId,
            input.patch
          )
          const schema = schemaWithAutomationSlideDesigns(
            record.schema,
            slideDesigns
          )
          const updated = await services.patchAutomationRecord({
            id: record.id,
            schema,
            expectedUpdatedAt: input.expectedUpdatedAt,
            now: services.now(),
          })
          if (!updated) throw new Error("Template not found")
          const slideDesign = automationSlideDesigns(updated.schema).find(
            (item) => item.id === input.designId
          )
          return {
            templateId: updated.id,
            updatedAt: updated.updatedAt,
            designId: input.designId,
            textItem: slideDesign?.textItems.find(
              (item) => item.id === input.textItemId
            ),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_template_delete",
    {
      title: "Delete a template",
      description:
        "Permanently deletes one caller-owned slideshow, video, or AI UGC template and cascades its generated slideshows, run history, queue jobs, and draft publication records.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved template ID returned by templates_list."),
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
            "Must be literal true to confirm permanent deletion of the template and its generated history."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ templateId, requestId, confirmDelete }) => {
      void confirmDelete
      return mcpResult(
        await owned(async () => {
          const result = await services.deleteAutomationCascade({
            id: templateId,
          })
          return {
            requestId,
            templateId,
            deleted: true,
            ...result,
          }
        })
      )
    }
  )

  server.registerTool(
    "lumenclip_template_hooks_get",
    {
      title: "Read a template hook pool",
      description:
        "Returns the canonical hook pool stored on a template, including enabled state and exact or near-duplicate groups. This is the authoritative hook source; rendered output prompts are not.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved slideshow, video, or AI UGC template ID."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ templateId: automationId }) =>
      mcpResult(
        await owned(async () => {
          const record = await services.getAutomationRecord(automationId)
          if (!record) throw new Error("Template not found")
          return serializeAutomationHookPool(
            record,
            deriveAutomationVariableBindings({
              schema: record.schema,
              collections: await services.listWordCollections(),
            })
          )
        })
      )
  )

  server.registerTool(
    "lumenclip_template_hooks_update",
    {
      title: "Replace a template hook pool",
      description:
        "Replaces the complete canonical hook pool so agents can add, edit, disable, or prune hooks without reading rendered output prompts. Read the pool first, preserve desired IDs, and optionally remove detected near-duplicates.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved template ID returned by template_hooks_get."),
        expectedUpdatedAt: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            "Optimistic-lock timestamp returned by automation_hooks_get."
          ),
        hooks: z
          .array(automationHookMutationSchema)
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
          const record = await services.getAutomationRecord(input.templateId)
          if (!record) throw new Error("Template not found")
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
            expectedUpdatedAt: input.expectedUpdatedAt,
            now: services.now(),
          })
          if (!updated) throw new Error("Automation not found")
          return {
            ...serializeAutomationHookPool(updated),
            tokenWarnings: tokenValidation.warnings,
            hookWarnings: lintAutomationHooks(input.hooks),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_template_hook_upsert",
    {
      title: "Add or edit template hooks",
      description:
        "Adds hooks or edits existing hooks by stable ID without replacing the rest of the pool. Returns the complete authoritative pool and duplicate analysis.",
      inputSchema: {
        templateId: z.string().trim().min(1),
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
        hooks: z.array(automationHookMutationSchema).min(1).max(100),
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
          const record = await services.getAutomationRecord(input.templateId)
          if (!record) throw new Error("Template not found")
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
          const updated = await patchAutomationHooks(
            services,
            record,
            hooks,
            input.expectedUpdatedAt
          )
          return {
            ...serializeAutomationHookPool(updated),
            tokenWarnings: tokenValidation.warnings,
            hookWarnings: lintAutomationHooks(input.hooks),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_template_hook_set_enabled",
    {
      title: "Enable or disable template hooks",
      description:
        "Toggles selected hooks by stable ID. Disabled hooks remain stored for attribution and can be re-enabled later.",
      inputSchema: {
        templateId: z.string().trim().min(1),
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
          const record = await services.getAutomationRecord(input.templateId)
          if (!record) throw new Error("Template not found")
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
          const updated = await patchAutomationHooks(
            services,
            record,
            hooks,
            input.expectedUpdatedAt
          )
          return serializeAutomationHookPool(updated)
        })
      )
  )

  server.registerTool(
    "lumenclip_template_hook_delete",
    {
      title: "Delete template hooks",
      description:
        "Permanently removes selected hooks from the canonical pool. Historical run plans and performance attribution retain their hook IDs.",
      inputSchema: {
        templateId: z.string().trim().min(1),
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
          const record = await services.getAutomationRecord(input.templateId)
          if (!record) throw new Error("Template not found")
          assertExpectedVersion(record.updatedAt, input.expectedUpdatedAt)
          const ids = new Set(input.hookIds)
          const current = automationHookItems(record.schema)
          const hooks = current.filter((hook) => !ids.has(hook.id))
          const updated =
            hooks.length === current.length
              ? record
              : await patchAutomationHooks(
                  services,
                  record,
                  hooks,
                  input.expectedUpdatedAt
                )
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
        templateId: z.string().trim().min(1),
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
          const report = await services.hookAnalyticsReport(input.templateId, {
            days: input.days,
            now: services.now(),
          })
          if (!report) throw new Error("Template not found")
          return report
        })
      )
  )

  server.registerTool(
    "lumenclip_hook_variants_generate",
    {
      title: "Generate random hook variants",
      description:
        "Stage 1 of hook-variant generation. Randomly resolves 2-10 distinct unused hooks from a saved slideshow template and generates a text-only slide draft for each. Returns every hook and the text of every slide without persisting outputs.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe("Saved slideshow template ID."),
        count: z
          .number()
          .int()
          .min(2)
          .max(10)
          .default(3)
          .describe("Number of distinct random hook variations to generate."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ templateId: automationId, count }) =>
      mcpResult(
        await owned(async () => {
          const automation = await services.getAutomationRecord(automationId)
          if (!automation) throw new Error("Template not found")
          if (automation.schema.automationKind !== "slideshow") {
            throw new Error("Hook variants require a slideshow template")
          }
          const variants = await services.previewAutomationHookVariants(
            automation.schema,
            {
              automationId,
              automationTitle: automation.name,
              count,
              now: services.now(),
            }
          )
          return {
            templateId: automationId,
            count: variants.length,
            variants,
            nextAction: {
              tool: "lumenclip_hook_variant_select",
              instructions:
                "Choose the best variant and pass its exact hook text as selectedHook with a new requestId.",
            },
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_hook_variant_select",
    {
      title: "Select and generate a hook variant",
      description:
        "Stage 2 of hook-variant generation. Persists one unpublished slideshow draft using the exact selected hook and returns the chosen hook plus the text and media URLs of every slide.",
      inputSchema: {
        templateId: z.string().trim().min(1),
        selectedHook: z
          .string()
          .trim()
          .min(1)
          .max(2_000)
          .describe(
            "Exact hook text copied from a stage-1 variant or supplied by the caller."
          ),
        requestId: z
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe(
            'Caller-generated idempotency key, e.g. "hook-selection-2026-08-01-001".'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ selectedHook, templateId, ...input }) =>
      mcpResult(
        await owned(async () =>
          canonicalTemplateEnvelope(
            await runAutomationDraft(
              services,
              { ...input, automationId: templateId, hook: selectedHook },
              ownerId
            )
          )
        )
      )
  )

  server.registerTool(
    "lumenclip_run_plan_get",
    {
      title: "Get a template run plan",
      description:
        "Returns the persisted generation plan for one standard template run, including hook attribution, substitutions, selected media, slide text/layout, reuse warnings, and strategy.",
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
          if (!run) throw new Error("Template run not found")
          const { debug, ...safePlan } = run.plan
          return {
            runId: run.id,
            templateId: run.automationId,
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
    "lumenclip_template_run",
    {
      title: "Run a template",
      description:
        "Generates one unpublished, unscheduled draft from a saved slideshow, AI UGC, X, or Threads template. Slideshow callers may supply an exact hook instead of random selection. AI UGC runs asynchronously and returns a pollable operation. Saved video templates remain discoverable but do not yet have a shared runner. For completed slideshow runs the output entry includes the selected hook, `outputImages` (relative slide paths), a per-slide `slides` array (`index`, `role`, `text`, absolute `renderedImageUrl`, absolute `sourceImageUrl`), a signed public `previewUrl`, and a signed direct ZIP `downloadUrl`. Delivery and slide URLs are absolutised against the server's BASE_URL; when BASE_URL is unset they fall back to relative paths.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .describe(
            "Saved slideshow, AI UGC, X, or Threads template ID to run."
          ),
        topic: z
          .string()
          .trim()
          .max(1000)
          .optional()
          .describe(
            'Optional topic override for this manual draft, e.g. "Singapore HDB resale prices in 2026".'
          ),
        hook: z
          .string()
          .trim()
          .min(1)
          .max(2_000)
          .optional()
          .describe(
            "Optional exact hook for a slideshow draft. This bypasses random hook selection without changing the saved hook pool."
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
    async ({ templateId, ...input }) =>
      mcpResult(
        await owned(async () =>
          canonicalTemplateEnvelope(
            await runAutomationDraft(
              services,
              { ...input, automationId: templateId },
              ownerId
            )
          )
        )
      )
  )
}

function registerCollectionTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  const owned = <T>(task: () => T) => ownedMcpTask(ownerId, task)

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
  const owned = <T>(task: () => T) => ownedMcpTask(ownerId, task)

  server.registerTool(
    "lumenclip_outputs_list",
    {
      title: "List generated outputs",
      description:
        "Lists caller-owned slideshow, generated-video, X, and Threads outputs with readiness, publication state, latest metric summaries, and explicit guidance for deeper analytics.",
      inputSchema: {
        templateId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Optional template ID to filter generated outputs by."),
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
        cursor: z
          .string()
          .trim()
          .regex(/^\d+$/)
          .optional()
          .describe(
            'Opaque pagination cursor returned by a prior call, e.g. "20".'
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
          const items = await listOutputSummaries(services)
          const filtered = items
            .filter(
              (item) =>
                !input.templateId || item.automationId === input.templateId
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
          const offset = input.cursor ? Number(input.cursor) : 0
          const page = filtered.slice(offset, offset + input.limit)
          const nextOffset = offset + page.length
          const awaitingCapture = page.reduce(
            (total, item) => total + item.analytics.awaitingCapture,
            0
          )
          return {
            items: page.map(({ automationId, ...item }) => ({
              ...item,
              templateId: automationId,
            })),
            nextCursor:
              nextOffset < filtered.length ? String(nextOffset) : undefined,
            hasMore: nextOffset < filtered.length,
            total: filtered.length,
            nextSteps: [
              ...page.flatMap((item) => item.nextSteps ?? []),
              ...analyticsCaptureNextSteps({
                awaitingCapture,
                integrationIds: [
                  ...new Set(
                    page.flatMap(
                      (item) => item.analytics.awaitingIntegrationIds
                    )
                  ),
                ],
              }),
            ],
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_output_get",
    {
      title: "Inspect a generated output",
      description:
        "Returns one caller-owned generated output with its resolved hook, token values, rendered per-slide text and image identity, publication state, timestamps, deterministic QA findings, and signed public preview/direct-download URLs when the output is a slideshow.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Output ID returned by outputs_list or automation_run, e.g. "slideshow_123".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ outputId }) =>
      mcpResult(
        await owned(async () => {
          const output = await getAutomationOutput(services, outputId, ownerId)
          if (!output) throw new Error("Output not found")
          return { ...output, nextSteps: outputNextSteps(output) }
        })
      )
  )

  server.registerTool(
    "lumenclip_workflow_trace_get",
    {
      title: "Inspect an output workflow trace",
      description:
        "Returns the complete 16-stage slideshow generation trace for one caller-owned output. Every stage includes its metadata, status, persisted or reconstructed input, and persisted or reconstructed output, plus the signed visual workflow URL.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Slideshow output ID returned by outputs_list or output_get, e.g. "slideshow_123".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ outputId }) =>
      mcpResult(
        await owned(async () => {
          const trace = await slideshowWorkflowTrace(services, outputId)
          return {
            ...trace,
            ...slideshowDeliveryFields(ownerId, trace.outputId),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_workflow_stage_get",
    {
      title: "Inspect one output workflow stage",
      description:
        "Returns one exact slideshow workflow stage with its input and output. Use workflow_trace_get to discover ordered stage IDs, then address a stage by ID.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe('Slideshow output ID, e.g. "slideshow_123".'),
        stageId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Stage ID returned by workflow_trace_get, e.g. "slideshow-generation.generate-slide-text".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ outputId, stageId }) =>
      mcpResult(
        await owned(async () => {
          const trace = await slideshowWorkflowTrace(services, outputId)
          const stage = trace.stages.find(
            (candidate) => candidate.id === stageId
          )
          if (!stage) throw new Error("Workflow stage not found")
          return {
            workflowId: trace.workflowId,
            runId: trace.runId,
            outputId: trace.outputId,
            stage,
            workflowUrl: slideshowDeliveryFields(ownerId, trace.outputId)
              .workflowUrl,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_output_validate",
    {
      title: "Validate a generated output",
      description:
        "Runs deterministic, model-free QA over one caller-owned output. Checks promised count, unresolved tokens, duplicate variable draws, prior hook/value reuse, empty text, and configured word limits.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Output ID returned by outputs_list or automation_run, e.g. "slideshow_123".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ outputId }) =>
      mcpResult(
        await owned(async () => {
          const output = await getAutomationOutput(services, outputId, ownerId)
          if (!output) throw new Error("Output not found")
          return {
            outputId: output.id,
            outputType: output.outputType,
            status: output.status,
            qa: output.qa,
            resourceUri: output.resourceUri,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_output_slide_text_update",
    {
      title: "Edit one generated slide",
      description:
        "Updates selected text items on one unpublished slideshow slide and rerenders only that slide. Use output_get first to obtain the one-based slide index, text-item IDs, and optimistic-lock timestamp.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Slideshow output ID returned by output_get or outputs_list, e.g. "slideshow_123".'
          ),
        slideIndex: z
          .number()
          .int()
          .min(1)
          .max(100)
          .describe("One-based slide index returned by output_get, e.g. 1."),
        edits: z
          .array(
            z.object({
              textItemId: z
                .string()
                .trim()
                .min(1)
                .describe(
                  'Stable text-item ID returned for the slide, e.g. "hook__heading".'
                ),
              text: z
                .string()
                .max(5_000)
                .describe(
                  "Complete replacement text. An empty string deliberately clears the item and will be reported by QA."
                ),
            })
          )
          .min(1)
          .max(20),
        expectedUpdatedAt: z
          .string()
          .datetime({ offset: true })
          .describe(
            'Optimistic-lock timestamp from output_get.updatedAt, e.g. "2026-07-28T12:00:00.000Z".'
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await owned(() => editOutputSlideText(services, ownerId, input))
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
          if (job?.type === "run-ugc-template") {
            return ugcJobOperation(services, job)
          }
          const regularRuns = await services.listAutomationRuns({ limit: 500 })
          const regular = regularRuns.find((run) => run.id === operationId)
          if (regular) {
            const automation = await services.getAutomationRecord(
              regular.automationId
            )
            return regularOperation(
              regular,
              false,
              {
                schema: automation?.schema,
                priorRuns: regularRuns,
              },
              ownerId
            )
          }
          const social = await services.getXAutomationRun(operationId)
          if (social) return socialOperation(social)
          const video = await services.getGeneratedVideoExport(operationId)
          if (video) return videoOperation(video)
          const ugc = await services.getUgcRunStatus(operationId)
          if (ugc) return ugcRunOperation(services, ugc)
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
        "Uploads a ready caller-owned output and creates a PostFast publication for explicitly selected connected accounts. Requires literal confirmation, blocks deterministic slideshow QA errors unless a reasoned override is supplied, and suppresses duplicate successful publications per output/account.",
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
        overrideQaFailure: z
          .boolean()
          .default(false)
          .describe(
            "Explicitly accept deterministic QA errors and allow publication. Defaults to false; warnings do not require an override."
          ),
        qaOverrideReason: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .optional()
          .describe(
            "Required when overrideQaFailure is true; records why the QA findings were accepted."
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
  input: {
    automationId: string
    topic?: string
    hook?: string
    requestId: string
  },
  ownerId: string
) {
  const standard = await services.getAutomationRecord(input.automationId)
  if (standard) {
    if (standard.schema.automationKind === "ugc") {
      if (input.hook) {
        throw new Error("Explicit hooks are supported only for slideshow runs")
      }
      return runUgcDraft(services, input)
    }
    if (standard.schema.automationKind === "video") {
      throw new Error(
        "Saved video automations do not yet have a server-side generation runner. They can be listed, inspected, scheduled, paused, and resumed through MCP."
      )
    }
    const priorRuns = await services.listAutomationRuns({
      automationId: input.automationId,
      limit: 100,
    })
    const existing = priorRuns.find((run) => run.requestId === input.requestId)
    if (existing) {
      return regularOperation(
        existing,
        true,
        {
          schema: standard.schema,
          priorRuns,
        },
        ownerId
      )
    }

    const result = await services.runDueAutomations({
      automationId: input.automationId,
      force: true,
      requestId: input.requestId,
      hook: input.hook,
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
    return regularOperation(
      run,
      false,
      {
        schema: standard.schema,
        priorRuns,
      },
      ownerId
    )
  }

  const social = await services.getXAutomation(input.automationId)
  if (!social) throw new Error("Automation not found")
  if (input.hook) {
    throw new Error("Explicit hooks are supported only for slideshow runs")
  }
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

function canonicalTemplateEnvelope<T extends Record<string, unknown>>(
  value: T
) {
  return canonicalizeTemplateFields(value) as Record<string, unknown>
}

function canonicalizeTemplateFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeTemplateFields)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key === "automationId"
        ? "templateId"
        : key === "sourceAutomationId"
          ? "sourceTemplateId"
          : key,
      canonicalizeTemplateFields(entry),
    ])
  )
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
    type: "run-ugc-template",
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
    stopAfter: clean(payload.stopAfter) || undefined,
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
    stopAfter?: string
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
  const stageSucceeded = Boolean(
    input.stopAfter &&
    input.job?.status === "completed" &&
    input.run?.checkpoints[input.stopAfter]
  )
  const succeeded = output?.status === "ready" || stageSucceeded
  const status = failed ? "failed" : succeeded ? "succeeded" : "running"
  const activeStage = input.run?.stages.find(
    (stage) => stage.status === "active" || stage.status === "failed"
  )?.name
  const stage = succeeded
    ? input.stopAfter
      ? input.stopAfter
      : "complete"
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
      kind: input.stopAfter ? `ugc.stage.${input.stopAfter}` : "ugc.generate",
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
      succeeded && output && !input.stopAfter
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
    blockers?: Array<{ code: string; message: string }>
  }>
  now: Date
}) {
  const reason = input.skipped[0]?.reason ?? "generation_failed"
  const blockers = input.skipped.flatMap((item) => item.blockers ?? [])
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
      ...(blockers.length
        ? blockers.map((blocker) => ({
            code: automationBlockerErrorCode(blocker.code),
            message: blocker.message,
            retryable: false,
          }))
        : [
            {
              code:
                reason === "no_images"
                  ? "COLLECTION_EMPTY"
                  : "OPERATION_FAILED",
              message: `Automation did not create an output: ${reason}`,
              retryable: true,
            },
          ]),
    ],
  }
}

function automationBlockerErrorCode(code: string) {
  switch (code) {
    case "missing_collection_selection":
      return "COLLECTION_NOT_SELECTED"
    case "missing_collection":
      return "COLLECTION_NOT_FOUND"
    case "empty_collection":
      return "COLLECTION_EMPTY"
    case "missing_hook":
      return "HOOK_POOL_EMPTY"
    case "invalid_hook_variable":
      return "HOOK_VARIABLE_INVALID"
    case "invalid_ugc_configuration":
      return "UGC_CONFIGURATION_INVALID"
    case "unsupported_runner":
      return "RUNNER_UNSUPPORTED"
    default:
      return "AUTOMATION_BLOCKED"
  }
}

function automationListItem(
  record: AutomationRecord,
  lastRun: AutomationRunRecord | undefined,
  mediaCollections: StoredImageCollection[],
  ownerId: string
) {
  const collectionReferences = normalizeAutomationCollectionReferences(
    record.schema,
    mediaCollections
  )
  return {
    id: record.id,
    name: record.name,
    hidden: record.hidden,
    kind: record.schema.automationKind,
    status: record.status,
    updatedAt: record.updatedAt,
    collectionIds: collectionReferences.ids,
    unresolvedCollectionReferences: collectionReferences.unresolved,
    nextSteps: missingCollectionReferenceNextSteps(
      collectionReferences.unresolved
    ),
    platforms: [] as string[],
    manualRunSupported:
      record.schema.automationKind === "slideshow" ||
      record.schema.automationKind === "ugc",
    lastRun: lastRun ? generatedRunSummary(lastRun, ownerId) : null,
    resourceUri: `lumenclip://templates/${encodeURIComponent(record.id)}`,
  }
}

function socialAutomationListItem(
  record: XAutomationRecord,
  lastRun?: XAutomationRun
) {
  return {
    id: record.id,
    name: record.name,
    hidden: record.hidden,
    kind: record.platform,
    status: record.status,
    updatedAt: record.updatedAt,
    collectionIds: [] as string[],
    unresolvedCollectionReferences: [] as string[],
    platforms: [record.platform],
    manualRunSupported: true,
    lastRun: lastRun ? socialRunSummary(lastRun) : null,
    resourceUri: `lumenclip://templates/${encodeURIComponent(record.id)}`,
  }
}

function normalizeAutomationCollectionReferences(
  schema: AutomationRecord["schema"],
  mediaCollections: StoredImageCollection[]
) {
  const references = automationMediaCollectionReferences(schema)
  const ids: string[] = []
  const unresolved: string[] = []
  for (const reference of references) {
    const collection = findMediaCollection(mediaCollections, reference)
    if (!collection) {
      unresolved.push(reference)
      continue
    }
    const id = storedToCollection(collection).id
    if (!ids.includes(id)) ids.push(id)
  }
  return { ids, unresolved }
}

function automationMediaCollectionReferences(
  schema: AutomationRecord["schema"]
) {
  return [
    ...automationCollectionIds(schema),
    ...schema.formatting.flatMap((block) => [
      ...(block.imageOverrides ?? []).map((override) => override.collectionId),
      block.overlayImage?.collectionId,
    ]),
    ...(schema.video_format?.segments.map((segment) => segment.collectionId) ??
      []),
  ]
    .map(clean)
    .filter(
      (reference, index, references): reference is string =>
        Boolean(reference) && references.indexOf(reference) === index
    )
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
  const references = automationMediaCollectionReferences(automation.schema)
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
  qaValid?: boolean
  qaFindings?: ReturnType<typeof validateAutomationRunOutput>["findings"]
  nextSteps?: LumenClipNextStep[]
  analytics: {
    available: boolean
    postCount: number
    awaitingCapture: number
    publicationIds: string[]
    integrationIds: string[]
    awaitingIntegrationIds: string[]
    latestCapturedAt?: string
    captureAttempts: AnalyticsCaptureAttempt[]
    metrics: MetricTotals
    newFollowers: number
    reportTools: string[]
    guidance: string
  }
}

type AnalyticsCaptureAttempt = {
  publicationId: string
  importId?: string
  status:
    | "not_started"
    | "pending"
    | "capturing"
    | "ready"
    | "captured"
    | "failed"
    | "expired"
  reason?: string
  section?: string
  createdAt?: string
  updatedAt?: string
}

async function listOutputSummaries(
  services: LumenClipMcpServices
): Promise<OutputSummary[]> {
  const [
    runs,
    videos,
    socialRuns,
    publications,
    snapshots,
    automations,
    studioImports,
  ] = await Promise.all([
    services.listAutomationRuns({ limit: 500 }),
    services.listGeneratedVideoExports({ limit: 500 }),
    services.listXAutomationRuns(),
    readMcpPublications(services, "output_summaries"),
    services.listMetricSnapshots(),
    services.listAutomationRecords(),
    services.listTikTokStudioAnalyticsImports({ limit: 1_000 }),
  ])
  const automationById = new Map(
    automations.map((automation) => [automation.id, automation])
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
      const qa =
        run.status === "succeeded"
          ? validateAutomationRunOutput({
              run,
              schema: automationById.get(run.automationId)?.schema,
              priorRuns: runs.filter(
                (candidate) => candidate.automationId === run.automationId
              ),
            })
          : undefined
      const resolvedPublicationState = publicationState(
        related,
        run.manuallyPublishedAt
      )
      return [
        {
          id,
          outputType: "slideshow" as const,
          automationId: run.automationId,
          status: automationRunOutputStatus(run),
          publicationState: resolvedPublicationState,
          title: run.plan.title,
          previewUri: run.thumbnailUrl ?? run.outputImages?.[0],
          createdAt: run.createdAt,
          resourceUri: `lumenclip://outputs/${encodeURIComponent(id)}`,
          qaValid: qa?.valid,
          qaFindings: qa?.findings,
          nextSteps: [
            ...qaNextSteps({
              automationId: run.automationId,
              outputId: id,
              qa,
            }),
            ...outputNextSteps({
              id,
              publicationState: resolvedPublicationState,
              qa,
            }).filter((step) => step.id === "publish-output"),
          ],
          analytics: outputAnalyticsSummary(
            related,
            snapshots,
            studioImports,
            services.now()
          ),
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
          snapshots,
          studioImports,
          services.now()
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
        analytics: outputAnalyticsSummary(
          related,
          snapshots,
          studioImports,
          services.now()
        ),
      }
    }),
  ]
}

async function getAutomationOutput(
  services: LumenClipMcpServices,
  outputId: string,
  ownerId = ""
) {
  const summaries = await listOutputSummaries(services)
  const summary = summaries.find((item) => item.id === outputId)
  if (!summary) return null

  if (summary.outputType === "slideshow") {
    const runs = await services.listAutomationRuns({ limit: 500 })
    const run = runs.find(
      (candidate) =>
        candidate.id === outputId || candidate.slideshowId === outputId
    )
    if (!run) return null
    const [automation, slideshow] = await Promise.all([
      services.getAutomationRecord(run.automationId),
      run.slideshowId
        ? services
            .listSlideshowRecords({ id: run.slideshowId, limit: 1 })
            .then((items) => items[0] ?? null)
        : Promise.resolve(null),
    ])
    const qa = validateAutomationRunOutput({
      run,
      schema: automation?.schema,
      priorRuns: runs.filter(
        (candidate) => candidate.automationId === run.automationId
      ),
    })
    const rendered = slideshow?.images ?? []
    const slides = run.plan.slides.map((planSlide, index) => {
      const renderedSlide = rendered[index]
      const textItems = (
        renderedSlide?.textItems ??
        planSlide.textItems ??
        (planSlide.text ? [{ id: "text", text: planSlide.text }] : [])
      ).map((item) => ({ id: item.id, text: item.text }))
      const section = automation
        ? automationFormatSection(
            automation.schema,
            planSlide.role === "hook"
              ? "hook"
              : planSlide.role === "cta"
                ? "cta"
                : "content"
          )
        : undefined
      const configuredById = new Map(
        (section?.textItems ?? []).map((item) => [item.id, item])
      )
      const headingItem =
        textItems.find((item) => /heading|headline|title/i.test(item.id)) ??
        textItems[0]
      const paragraphItems = textItems.filter(
        (item) =>
          item.id !== headingItem?.id &&
          (/paragraph|body|description|copy|content/i.test(item.id) ||
            textItems.length > 1)
      )
      return {
        index: index + 1,
        id: planSlide.id,
        role: planSlide.role,
        heading: headingItem?.text ?? "",
        paragraph: paragraphItems.map((item) => item.text).join("\n"),
        renderedText: textItems.map((item) => item.text).join("\n"),
        textItems: textItems.map((item) => {
          const configured = configuredById.get(item.id)
          return {
            ...item,
            wordLengthMin: configured?.wordLengthMin,
            wordLengthMax: configured?.wordLengthMax,
          }
        }),
        imageAssetId: planSlide.imageKey,
        imageUrl:
          renderedSlide?.source_image_url ??
          renderedSlide?.image_url ??
          planSlide.imageUrl,
        renderedImageUrl: run.outputImages?.[index],
      }
    })
    return {
      ...summary,
      ...slideshowDeliveryFields(ownerId, run.slideshowId || summary.id),
      runId: run.id,
      automationId: run.automationId,
      resolvedHookText: run.plan.hook,
      hookId: run.plan.hookId,
      hookTemplate: run.plan.hookTemplate,
      tokenValues: run.plan.hookSubstitutions ?? {},
      actualSlideCount: slides.length,
      bodySlideCount: slides.filter((slide) => slide.role === "content").length,
      // Non-fatal quality findings recorded at generation time (word ranges).
      // Distinct from `qa`, which is recomputed on read.
      violations: run.plan.violations ?? [],
      generationPasses: generationPasses(run),
      slides,
      title: run.plan.title,
      caption: run.plan.caption,
      hashtags: run.plan.hashtags,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      error: run.error,
      qa,
    }
  }

  if (summary.outputType === "video") {
    const video = await services.getGeneratedVideoExport(outputId)
    if (!video) return null
    return {
      ...summary,
      automationId: clean(video.sourceConfig.automationId) || undefined,
      title: video.title,
      description: video.description,
      hashtags: video.hashtags,
      videoUrl: video.videoUrl,
      previewUrl: video.previewUrl,
      createdAt: video.createdAt,
      updatedAt: video.updatedAt,
      error: video.error,
      qa: {
        valid: video.status === "ready",
        actualSlideCount: 0,
        bodySlideCount: 0,
        findings: [],
      },
    }
  }

  const social = await services.getXAutomationRun(outputId)
  if (!social) return null
  return {
    ...summary,
    automationId: social.automationId,
    platform: social.platform,
    resolvedHookText: social.hook,
    topic: social.topic,
    posts: social.posts,
    actualSlideCount: 0,
    createdAt: social.createdAt,
    updatedAt: social.updatedAt,
    error: social.error,
    qa: {
      valid: social.status !== "failed",
      actualSlideCount: 0,
      bodySlideCount: 0,
      findings: [],
    },
  }
}

async function slideshowWorkflowTrace(
  services: LumenClipMcpServices,
  outputId: string
) {
  const runs = await services.listAutomationRuns({ limit: 500 })
  const run = runs.find(
    (candidate) =>
      candidate.slideshowId === outputId || candidate.id === outputId
  )
  if (!run?.slideshowId) throw new Error("Slideshow workflow not found")
  const [automation, slideshows] = await Promise.all([
    services.getAutomationRecord(run.automationId),
    services.listSlideshowRecords({ id: run.slideshowId, limit: 1 }),
  ])
  const slideshow = slideshows[0]
  if (!slideshow) throw new Error("Slideshow output not found")
  const qa = validateAutomationRunOutput({
    run,
    schema: automation?.schema,
    priorRuns: runs,
  })
  return buildSlideshowWorkflowTrace({ run, automation, slideshow, qa })
}

function outputAnalyticsSummary(
  publications: PostFastPostRecord[],
  snapshots: PostFastMetricSnapshot[],
  studioImports: TikTokStudioImportRecord[],
  now: Date
): OutputSummary["analytics"] {
  const publicationIds = publications.map((publication) => publication.id)
  const integrationIds = [
    ...new Set(
      publications
        .map((publication) => publication.integrationId)
        .filter(Boolean)
    ),
  ]
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
  const awaitingIntegrationIds = [
    ...new Set(
      publications
        .filter((publication) => !latestByPost.has(publication.id))
        .map((publication) => publication.integrationId)
        .filter(Boolean)
    ),
  ]
  const hasTikTokStudio = latest.some(
    (snapshot) => snapshot.source === "tiktok_studio"
  )
  const captureAttempts = publications.map((publication) =>
    analyticsCaptureAttempt({
      publication,
      snapshot: latestByPost.get(publication.id),
      imports: studioImports,
      now,
    })
  )
  const failedCaptureCount = captureAttempts.filter((attempt) =>
    ["failed", "expired"].includes(attempt.status)
  ).length
  return {
    available: latest.length > 0,
    postCount: latest.length,
    awaitingCapture: Math.max(0, publicationIds.length - latest.length),
    publicationIds,
    integrationIds,
    awaitingIntegrationIds,
    captureAttempts,
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
        : failedCaptureCount > 0
          ? `${failedCaptureCount} Studio capture ${failedCaptureCount === 1 ? "attempt has" : "attempts have"} failed or expired. Inspect captureAttempts for the recorded reason, then start a new capture.`
          : publications.length > 0
            ? "This output is published but has no stored metrics yet; capture analytics, then call lumenclip_analytics_report."
            : "This output has no publication record yet; publish or mark it published before requesting analytics.",
  }
}

function analyticsCaptureAttempt(input: {
  publication: PostFastPostRecord
  snapshot?: PostFastMetricSnapshot
  imports: TikTokStudioImportRecord[]
  now: Date
}): AnalyticsCaptureAttempt {
  if (input.snapshot) {
    return {
      publicationId: input.publication.id,
      status: "captured",
      updatedAt: input.snapshot.capturedAt,
    }
  }
  const importRecord = input.imports
    .filter(
      (candidate) =>
        candidate.targetPostId === input.publication.id ||
        (clean(input.publication.externalPostId) &&
          candidate.externalPostId === clean(input.publication.externalPostId))
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
  if (!importRecord) {
    return {
      publicationId: input.publication.id,
      status: "not_started",
      reason: "No TikTok Studio capture attempt has been recorded.",
    }
  }
  const base = {
    publicationId: input.publication.id,
    importId: importRecord.id,
    createdAt: importRecord.createdAt,
    updatedAt: importRecord.updatedAt,
  }
  if (importRecord.status === "failed") {
    return {
      ...base,
      status: "failed" as const,
      reason: importRecord.failure?.reason || "TikTok Studio capture failed.",
      section: importRecord.failure?.section,
    }
  }
  if (
    importRecord.status === "expired" ||
    (importRecord.status !== "linked" &&
      Date.parse(importRecord.expiresAt) <= input.now.getTime())
  ) {
    return {
      ...base,
      status: "expired" as const,
      reason: "TikTok Studio capture expired before analytics were received.",
    }
  }
  return {
    ...base,
    status:
      importRecord.status === "linked"
        ? ("captured" as const)
        : importRecord.status === "ready"
          ? ("ready" as const)
          : importRecord.status === "capturing"
            ? ("capturing" as const)
            : ("pending" as const),
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
  const published = publications.find((item) => item.status === "published")
  if (published) {
    return resolvedPublicationLinkState(published).state === "unlinked"
      ? "published_unlinked"
      : "published"
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

function regularOperation(
  run: AutomationRunRecord,
  reused = false,
  qaContext: {
    schema?: AutomationSchema
    priorRuns?: AutomationRunRecord[]
  } = {},
  ownerId = ""
) {
  const progress =
    run.status === "running" ? automationRunProgress(run.id) : undefined
  const outputId = run.slideshowId
  const qa =
    run.status === "succeeded"
      ? validateAutomationRunOutput({
          run,
          schema: qaContext.schema,
          priorRuns: qaContext.priorRuns,
        })
      : undefined
  const delivery = outputId
    ? slideshowDeliveryFields(ownerId, outputId)
    : undefined
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
            title: run.plan.title,
            hook: run.plan.hook,
            publicationState: "not_published",
            qaFindings: qa?.findings ?? [],
            qaValid: qa?.valid,
            generationPasses: generationPasses(run),
            outputImages: run.outputImages ?? [],
            slides: buildRunSlides(run),
            ...delivery,
            resourceUri: `lumenclip://outputs/${encodeURIComponent(outputId)}`,
          },
        ]
      : [],
    nextSteps: qaNextSteps({
      automationId: run.automationId,
      outputId,
      qa,
    }),
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

async function editOutputSlideText(
  services: LumenClipMcpServices,
  ownerId: string,
  input: {
    outputId: string
    slideIndex: number
    edits: Array<{ textItemId: string; text: string }>
    expectedUpdatedAt: string
  }
) {
  const [runs, publications] = await Promise.all([
    services.listAutomationRuns({ limit: 500 }),
    readMcpPublications(services, "output_edit_guard"),
  ])
  const run = runs.find(
    (candidate) =>
      candidate.id === input.outputId ||
      candidate.slideshowId === input.outputId
  )
  if (!run?.slideshowId) throw new Error("Slideshow output not found")
  if (run.status !== "succeeded") {
    throw new Error("Only ready slideshow outputs can be edited")
  }
  if (run.updatedAt !== input.expectedUpdatedAt) {
    throw new Error(
      `Output changed after it was read; expected ${input.expectedUpdatedAt}, current ${run.updatedAt}`
    )
  }
  const related = publications.filter(
    (publication) =>
      (publication.sourceType === "automation" &&
        publication.sourceId === run.id) ||
      (publication.sourceType === "slideshow" &&
        publication.sourceId === run.slideshowId)
  )
  assertOutputCanBeMutated(related, run.manuallyPublishedAt, "edited")

  const [slideshow] = await services.listSlideshowRecords({
    id: run.slideshowId,
    limit: 1,
  })
  if (!slideshow) throw new Error("Rendered slideshow not found")
  const zeroBasedIndex = input.slideIndex - 1
  const updatedSlideshow = await services.updateSlideshowSlideText({
    id: slideshow.id,
    slideIndex: zeroBasedIndex,
    edits: input.edits,
  })
  if (!updatedSlideshow) throw new Error("Rendered slideshow not found")
  const updatedRun = await services.updateAutomationRunSlideText({
    slideshowId: slideshow.id,
    runId: run.id,
    slideIndex: zeroBasedIndex,
    slideshow: updatedSlideshow,
  })
  if (!updatedRun) throw new Error("Automation run not found")

  const output = await getAutomationOutput(services, slideshow.id, ownerId)
  if (!output) throw new Error("Edited output could not be read")
  return {
    output,
    editedSlide:
      "slides" in output ? output.slides?.[zeroBasedIndex] : undefined,
    nextSteps: outputNextSteps(output),
  }
}

async function deleteOutput(
  services: LumenClipMcpServices,
  input: { outputId: string; requestId: string }
) {
  const [runs, publications] = await Promise.all([
    services.listAutomationRuns({ limit: 500 }),
    readMcpPublications(services, "output_deletion_guard"),
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
  assertOutputCanBeMutated(publications, manuallyPublishedAt, "deleted")
}

function assertOutputCanBeMutated(
  publications: PostFastPostRecord[],
  manuallyPublishedAt: string | undefined,
  action: "deleted" | "edited"
) {
  if (
    manuallyPublishedAt ||
    publications.some((publication) => publication.status === "published")
  ) {
    throw new Error(`Published outputs cannot be ${action}`)
  }
  if (publications.some((publication) => publication.status === "scheduled")) {
    throw new Error(`Scheduled outputs cannot be ${action}`)
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
    overrideQaFailure: boolean
    qaOverrideReason?: string
  }
) {
  const output = await getPublishableOutput(services, input.outputId)
  if (!output) throw new Error("Output not found")
  const warnings: string[] = []
  const [accounts, existingPublications] = await Promise.all([
    services.listAccounts(),
    readMcpPublications(services, "output_publish_lookup", {
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
  if (output.automationRun && existingForTarget.size < resolved.length) {
    const qa = await qaForAutomationRun(services, output.automationRun)
    if (!qa.valid && !input.overrideQaFailure) {
      throw new Error(
        `Output failed deterministic QA and cannot be published without overrideQaFailure=true: ${qa.findings
          .filter((finding) => finding.severity === "error")
          .map((finding) => finding.message)
          .join("; ")}`
      )
    }
    if (!qa.valid && !clean(input.qaOverrideReason)) {
      throw new Error(
        "qaOverrideReason is required when overrideQaFailure accepts QA errors"
      )
    }
    if (!qa.valid) {
      warnings.push(
        `QA override accepted: ${clean(input.qaOverrideReason)} (${qa.findings
          .filter((finding) => finding.severity === "error")
          .map((finding) => finding.code)
          .join(", ")}).`
      )
    }
  }
  const media =
    output.mediaUrls.length && existingForTarget.size < resolved.length
      ? await services.uploadPostFastMediaSources({ urls: output.mediaUrls })
      : []
  const records: PostFastPostRecord[] = []
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
      publication,
    })
  } else if (output.video) {
    await services.markGeneratedVideoExportPublished({
      id: output.video.id,
      publishedAt,
      publication,
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

function registerSlideshowAnalysisTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  server.registerTool(
    "lumenclip_slideshow_analyze",
    {
      title: "Analyze a TikTok slideshow tone",
      description:
        "Transcribes one explicitly supplied TikTok photo slideshow, analyzes its writing voice, and returns tone fields that can seed a LumenClip template. It does not match or link publications.",
      inputSchema: {
        url: z
          .string()
          .url()
          .describe(
            'Public TikTok /photo/ slideshow URL to analyze, e.g. "https://www.tiktok.com/@horoiq/photo/7662360324313517330".'
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ url }) =>
      mcpResult(
        await withSystemOwner(ownerId, async () => {
          const transcript = await services.transcribeTikTokSlideshow(url)
          if (!transcript) throw new Error("TikTok slideshow not found")
          const analysis = await services.analyzeSlideshowTone(transcript)
          return {
            transcript,
            analysis,
            suggestedFields: services.slideshowToneToAutomationFields(analysis),
            ...(transcript.transcriptionFallback
              ? {
                  warning:
                    "OpenRouter is not configured. Slide 1 uses the post caption and remaining slides are blank; this is not a full transcription.",
                }
              : {}),
          }
        })
      )
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
        templateId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe("Optional source template ID."),
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
    async ({ templateId, ...input }) =>
      mcpResult(
        await withSystemOwner(ownerId, () =>
          buildTikTokStudioMcpReport(
            { ...input, automationId: templateId, now: services.now() },
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

function registerTikTokCommentTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  server.registerTool(
    "lumenclip_tiktok_comments_collect_start",
    {
      title: "Collect top-level TikTok comments",
      description:
        "Creates a scoped collection job for local LumenClip TikTok publications and returns the HMAC-authenticated Chrome companion configuration.",
      inputSchema: {
        postIds: z
          .array(z.string().trim().min(1))
          .min(1)
          .max(50)
          .describe(
            'Local LumenClip publication IDs, e.g. ["publication_123"].'
          ),
        scope: z
          .literal("topLevel")
          .default("topLevel")
          .describe(
            'Comment scope; currently literal "topLevel", e.g. "topLevel".'
          ),
        maxComments: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Maximum top-level comments per post, e.g. 100."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) =>
      mcpResult(
        await withSystemOwner(ownerId, async () => {
          const result = await services.createTikTokCommentCollection({
            ownerId,
            ...input,
          })
          const baseUrl = (
            process.env.BASE_URL || "http://localhost:3000"
          ).replace(/\/$/, "")
          return {
            collectionId: result.collection.id,
            status: result.collection.status,
            postCount: result.collection.posts.length,
            expiresAt: result.collection.expiresAt,
            companion: {
              version: 1,
              endpoint: `${baseUrl}/api/tiktok-comments/capture`,
              token: result.token,
              expiresAt: result.collection.expiresAt,
            },
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_tiktok_comments_list",
    {
      title: "List captured TikTok comments",
      description:
        "Reads captured top-level comments for one collection or one local LumenClip publication.",
      inputSchema: {
        collectionId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe('Optional collection job ID, e.g. "collection_123".'),
        postId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Optional local LumenClip publication ID, e.g. "publication_123".'
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
      mcpResult({
        comments: await withSystemOwner(ownerId, () =>
          services.listTikTokComments(input)
        ),
      })
  )

  server.registerTool(
    "lumenclip_tiktok_comment_replies_draft",
    {
      title: "Draft replies to every captured TikTok comment",
      description:
        "Classifies reply style and creates a separate unsendable draft for every captured comment. Emoji replies are assembled in code.",
      inputSchema: {
        collectionId: z
          .string()
          .trim()
          .min(1)
          .describe('Collection job ID, e.g. "collection_123".'),
        postContextById: z
          .record(z.string(), z.string().max(100000))
          .optional()
          .describe(
            'Optional local publication ID to post-text map, e.g. {"publication_123":"Five-slide Cancer traits post"}.'
          ),
        emojiSet: z
          .array(z.string().trim().min(1).max(20))
          .min(4)
          .max(40)
          .optional()
          .describe(
            'Optional per-automation emoji set, e.g. ["✨","💛","🙌","♋"].'
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
      mcpResult({
        drafts: await withSystemOwner(ownerId, () =>
          services.draftTikTokCommentReplies(input)
        ),
      })
  )

  server.registerTool(
    "lumenclip_tiktok_comment_replies_approve",
    {
      title: "Approve reviewed TikTok comment replies",
      description:
        "Writes explicit approval records scoped to one collection. Omitted drafts remain unapproved and unsendable.",
      inputSchema: {
        collectionId: z
          .string()
          .trim()
          .min(1)
          .describe('Collection job ID, e.g. "collection_123".'),
        approvals: z
          .array(
            z.object({
              draftId: z
                .string()
                .trim()
                .min(1)
                .describe('Reviewed draft ID, e.g. "draft_123".'),
              text: z
                .string()
                .trim()
                .min(1)
                .max(1000)
                .optional()
                .describe(
                  'Optional human-edited final reply, e.g. "That last slide really lands.".'
                ),
              heart: z
                .boolean()
                .default(false)
                .describe("Whether to heart this comment, e.g. true."),
            })
          )
          .min(1)
          .max(500)
          .describe(
            'Approvals only for this collection, e.g. [{"draftId":"draft_123","heart":true}].'
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
      mcpResult({
        approvals: await withSystemOwner(ownerId, () =>
          services.approveTikTokReplyDrafts(input)
        ),
      })
  )

  server.registerTool(
    "lumenclip_tiktok_comment_replies_send",
    {
      title: "Queue approved TikTok comment replies for sending",
      description:
        "Queues only drafts carrying separate explicit approval records. Requires literal send confirmation; the Chrome companion performs paced browser actions.",
      inputSchema: {
        collectionId: z
          .string()
          .trim()
          .min(1)
          .describe('Collection job ID, e.g. "collection_123".'),
        draftIds: z
          .array(z.string().trim().min(1))
          .min(1)
          .max(500)
          .describe(
            'Explicit approved draft IDs, e.g. ["draft_123","draft_124"].'
          ),
        confirmSend: z
          .literal(true)
          .describe(
            "Must be literal true after every selected reply and heart action has been reviewed."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      mcpResult({
        sends: await withSystemOwner(ownerId, () =>
          services.queueApprovedTikTokReplies(input)
        ),
      })
  )
}

type UpdateAutomationInput = {
  automationId: string
  expectedUpdatedAt?: string
  name?: string
  favorite?: boolean
  hidden?: boolean
}

async function updateAutomation(
  services: LumenClipMcpServices,
  input: UpdateAutomationInput
) {
  if (
    input.name === undefined &&
    input.favorite === undefined &&
    input.hidden === undefined
  ) {
    throw new Error("Provide a template name, favorite state, or visibility")
  }

  const standard = await services.getAutomationRecord(input.automationId)
  if (standard) {
    assertExpectedVersion(standard.updatedAt, input.expectedUpdatedAt)
    const updated = await services.patchAutomationRecord({
      id: standard.id,
      name: input.name,
      favorite: input.favorite,
      hidden: input.hidden,
      expectedUpdatedAt: input.expectedUpdatedAt,
      now: services.now(),
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
    hidden: input.hidden ?? social.hidden,
  })
  return serializeSocialAutomation(updated)
}

function assertExpectedVersion(actual: string, expected?: string) {
  if (expected && expected !== actual) {
    throw new Error(
      `Automation changed since ${expected}; current updatedAt is ${actual}`
    )
  }
}

function patchSlideDesign(
  designs: AutomationSlideDesign[],
  designId: string,
  patch: z.infer<typeof slideDesignPatchSchema>
) {
  const current = designs.find((design) => design.id === designId)
  if (!current) throw new Error(`Slide design not found: ${designId}`)
  const { overlayImage, visualPresetId, ...fields } = patch
  const updated: AutomationSlideDesign = {
    ...current,
    ...fields,
    ...(visualPresetId !== undefined
      ? { visualPresetId: visualPresetId || undefined }
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
  return designs.map((design) => (design.id === designId ? updated : design))
}

function patchSlideDesignTextItem(
  designs: AutomationSlideDesign[],
  designId: string,
  textItemId: string,
  patch: z.infer<typeof textItemPatchSchema>
) {
  const current = designs.find((design) => design.id === designId)
  if (!current) throw new Error(`Slide design not found: ${designId}`)
  const textItem = current.textItems.find((item) => item.id === textItemId)
  if (!textItem) {
    throw new Error(`Text item not found in ${designId}: ${textItemId}`)
  }
  const wordLengthMin = patch.wordLengthMin ?? textItem.wordLengthMin
  const wordLengthMax = patch.wordLengthMax ?? textItem.wordLengthMax
  if (wordLengthMin > wordLengthMax) {
    throw new Error("wordLengthMin cannot be greater than wordLengthMax")
  }
  const updated: TextItem = { ...textItem, ...patch }
  return designs.map((design) =>
    design.id === designId
      ? {
          ...design,
          textItems: design.textItems.map((item) =>
            item.id === textItemId ? updated : item
          ),
        }
      : design
  )
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

export function buildCalendarLifecycleItems(input: {
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
      job.type !== "run-template" &&
      job.type !== "run-social-template" &&
      job.type !== "run-ugc-template"
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
    hidden: record.hidden,
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
  return {
    id: record.id,
    name: record.name,
    hidden: record.hidden,
    kind: record.schema.automationKind,
    status: record.status,
    favorite: record.favorite,
    updatedAt: record.updatedAt,
  }
}

function serializeAutomationSchema(schema: AutomationRecord["schema"]) {
  const stored = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>
  delete stored.schedule
  delete stored.social_integrations
  delete stored.social_post_settings
  delete stored.social_publish_as
  delete stored.posting_mode
  delete stored.generation_lead_minutes
  return stored
}

function serializeAutomationHookPool(
  record: AutomationRecord,
  variableBindings?: ReturnType<typeof deriveAutomationVariableBindings>
) {
  const hooks = automationHookItems(record.schema)
  return {
    templateId: record.id,
    updatedAt: record.updatedAt,
    hooks,
    ...analyzeAutomationHookPool(hooks),
    ...(variableBindings ? { variableBindings } : {}),
    resourceUri: `lumenclip://templates/${encodeURIComponent(record.id)}/hooks`,
  }
}

async function patchAutomationHooks(
  services: LumenClipMcpServices,
  record: AutomationRecord,
  hooks: AutomationHookItem[],
  expectedUpdatedAt?: string
) {
  const updated = await services.patchAutomationRecord({
    id: record.id,
    schema: schemaWithAutomationHookItems(record.schema, hooks),
    expectedUpdatedAt,
    now: services.now(),
  })
  if (!updated) throw new Error("Automation not found")
  return updated
}

export function mergeAutomationSchemaPatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    const existing = merged[key]
    merged[key] =
      isRecord(existing) && isRecord(value)
        ? mergeAutomationSchemaPatch(existing, value)
        : value
  }
  return merged
}

export type LumenClipNextStep = {
  id: string
  severity: "required" | "recommended"
  reason: string
  tool: string
  args: Record<string, unknown>
  blocks: string[]
}

type SchemaDiffEntry = {
  path: string
  before?: unknown
  after?: unknown
}

export function diffAutomationSchemas(
  before: Record<string, unknown>,
  after: Record<string, unknown>
) {
  const added: SchemaDiffEntry[] = []
  const changed: SchemaDiffEntry[] = []
  const removed: SchemaDiffEntry[] = []

  const visit = (left: unknown, right: unknown, path: string) => {
    if (isRecord(left) && isRecord(right)) {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)])
      for (const key of [...keys].sort()) {
        const childPath = path ? `${path}.${key}` : key
        if (!(key in left)) {
          added.push({ path: childPath, after: right[key] })
        } else if (!(key in right)) {
          removed.push({ path: childPath, before: left[key] })
        } else {
          visit(left[key], right[key], childPath)
        }
      }
      return
    }
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      changed.push({ path, before: left, after: right })
    }
  }

  visit(before, after, "")
  return { added, changed, removed }
}

function analyticsCaptureNextSteps(input: {
  awaitingCapture: number
  integrationIds: string[]
}): LumenClipNextStep[] {
  if (input.awaitingCapture < 1 || input.integrationIds.length < 1) return []
  return [
    {
      id: "capture-missing-tiktok-analytics",
      severity: "recommended",
      reason: `${input.awaitingCapture} published ${input.awaitingCapture === 1 ? "post is" : "posts are"} still awaiting an analytics capture.`,
      tool: "lumenclip_tiktok_studio_analytics_batch_start",
      args: {
        integrationIds: [...new Set(input.integrationIds)],
        mode: "new",
        recentDays: 90,
      },
      blocks: [],
    },
  ]
}

function automationCreateNextSteps(
  current: AutomationRecord[],
  input: { name: string; requestId: string }
): LumenClipNextStep[] {
  const source = current
    .filter((automation) => automation.raw?.mcpRequestId !== input.requestId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
  if (!source) return []
  return [
    {
      id: "prefer-clone-for-related-template",
      severity: "recommended",
      reason:
        "This workspace already owns templates. Clone the closest one when you want to preserve its full schema and change only the differences.",
      tool: "lumenclip_template_clone",
      args: {
        sourceTemplateId: source.id,
        name: input.name,
        requestId: `${input.requestId}-clone`,
      },
      blocks: [],
    },
  ]
}

function automationConfigurationNextSteps(input: {
  automation: AutomationRecord
  variableBindings: ReturnType<typeof deriveAutomationVariableBindings>
  unresolvedCollectionReferences: string[]
}): LumenClipNextStep[] {
  const steps: LumenClipNextStep[] = [
    ...missingCollectionReferenceNextSteps(
      input.unresolvedCollectionReferences
    ),
    ...bodyTextLayerRepairNextSteps(input.automation),
    ...toneStyleBoundaryNextSteps(input.automation),
  ]
  if (input.variableBindings.missingTokens.length > 0) {
    steps.push({
      id: "resolve-missing-variable-collections",
      severity: "required",
      reason: `These hook variables do not resolve to an existing word collection: ${input.variableBindings.missingTokens.join(", ")}. Create or select matching variable collections before running this template.`,
      tool: "lumenclip_collections_list",
      args: { mediaType: "word", minimumItemCount: 1, limit: 100 },
      blocks: ["lumenclip_template_run"],
    })
  }
  const narrative = clean(input.automation.schema.prompt_formatting.narrative)
  const narrativeLines = narrative
    .split(/\r?\n/)
    .map((line) => clean(line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")))
    .filter(Boolean)
  const enabledHooks = automationHookItems(input.automation.schema)
    .filter((hook) => hook.enabled)
    .map((hook) => hook.text.toLocaleLowerCase())
  const enabledHookSet = new Set(enabledHooks)
  const matchingNarrativeLines = narrativeLines.filter((line) =>
    enabledHookSet.has(line.toLocaleLowerCase())
  )
  const narrativeLooksLikeHookCatalog =
    narrativeLines.length >= 3 &&
    matchingNarrativeLines.length / narrativeLines.length >= 0.6
  const narrativeMatchesEnabledPool =
    narrativeLines.length === enabledHooks.length &&
    narrativeLines.every((line) => enabledHookSet.has(line.toLocaleLowerCase()))

  if (narrativeLooksLikeHookCatalog) {
    steps.push({
      id: "remove-stale-narrative-hook-catalog",
      severity: "recommended",
      reason: narrativeMatchesEnabledPool
        ? "prompt_formatting.narrative duplicates the enabled hook pool. Generation reads hooks[] directly, so clear the redundant catalog."
        : "prompt_formatting.narrative is a stale copy of the enabled hook pool. Generation reads hooks[] directly, so clear the duplicate catalog.",
      tool: "lumenclip_template_schema_update",
      args: {
        templateId: input.automation.id,
        expectedUpdatedAt: input.automation.updatedAt,
        mode: "patch",
        schema: { prompt_formatting: { narrative: "" } },
      },
      blocks: [],
    })
  }

  if (input.variableBindings.unusedOverrides.length > 0) {
    steps.push({
      id: "remove-unused-hook-slot-overrides",
      severity: "recommended",
      reason: `Unused explicit variable overrides are configured: ${input.variableBindings.unusedOverrides.join(", ")}.`,
      tool: "lumenclip_template_schema_update",
      args: {
        templateId: input.automation.id,
        expectedUpdatedAt: input.automation.updatedAt,
        mode: "patch",
        schema: {
          hook_slots: Object.fromEntries(
            input.variableBindings.unusedOverrides.map((name) => [name, null])
          ),
        },
      },
      blocks: [],
    })
  }
  return steps
}

type AutomationConfigurationWarning = {
  code: "BODY_TEXT_LAYERS_COLLAPSED" | "STYLE_CONTAINS_VOICE_RULES"
  severity: "warning"
  path: string
  message: string
}

function automationConfigurationWarnings(
  automation: AutomationRecord
): AutomationConfigurationWarning[] {
  const warnings: AutomationConfigurationWarning[] = []
  const bodyIssue = bodyTextLayerIssue(automation)
  if (bodyIssue) {
    warnings.push({
      code: "BODY_TEXT_LAYERS_COLLAPSED",
      severity: "warning",
      path: "formatting.body.textItems",
      message:
        "The body heading is configured for paragraph-length copy while the paragraph layer has no usable prompt or static text. Generated body copy will collapse into the heading layer.",
    })
  }
  const voiceRules = styleVoiceRules(automation.schema.prompt_formatting.style)
  if (voiceRules.length > 0) {
    warnings.push({
      code: "STYLE_CONTAINS_VOICE_RULES",
      severity: "warning",
      path: "prompt_formatting.style",
      message: `Structural style contains voice rules owned by tone: ${voiceRules.join(" ")}`,
    })
  }
  return warnings
}

function bodyTextLayerRepairNextSteps(
  automation: AutomationRecord
): LumenClipNextStep[] {
  const issue = bodyTextLayerIssue(automation)
  if (!issue) return []
  const formatting = structuredClone(automation.schema.formatting)
  const body = formatting.find((section) => section.id === "body")
  const heading = body?.textItems.find((item) => item.id === issue.heading.id)
  const paragraph = body?.textItems.find(
    (item) => item.id === issue.paragraph.id
  )
  if (!body || !heading || !paragraph) return []

  const paragraphDirection =
    clean(heading.contentDirection) &&
    !/\b(?:heading|headline|title)\b/i.test(heading.contentDirection)
      ? clean(heading.contentDirection)
      : "Write one concise supporting paragraph that develops this slide's heading and the selected hook."
  const paragraphMin = Math.max(
    10,
    Math.min(30, Number(heading.wordLengthMin) || 10)
  )
  const paragraphMax = Math.max(
    paragraphMin,
    Math.min(60, Number(heading.wordLengthMax) || 30)
  )
  Object.assign(heading, {
    contentDirection:
      "Write a specific 2-3 word heading that captures this slide's main idea.",
    wordLengthMin: 2,
    wordLengthMax: 3,
    textMode: "prompt",
    staticText: "",
  })
  Object.assign(paragraph, {
    contentDirection: paragraphDirection,
    wordLengthMin: paragraphMin,
    wordLengthMax: paragraphMax,
    textMode: "prompt",
    staticText: "",
  })

  return [
    {
      id: "restore-body-heading-and-paragraph-layers",
      severity: "recommended",
      reason:
        "The body heading currently owns paragraph-length copy and the paragraph layer is inert. Split the scan heading from its supporting paragraph before the next run.",
      tool: "lumenclip_template_schema_update",
      args: {
        templateId: automation.id,
        expectedUpdatedAt: automation.updatedAt,
        mode: "patch",
        schema: { formatting },
      },
      blocks: [],
    },
  ]
}

function bodyTextLayerIssue(automation: AutomationRecord) {
  const body = automationFormatSection(automation.schema, "content")
  const heading = body.textItems.find((item) =>
    /\b(?:heading|headline|title)\b/i.test(item.id)
  )
  const paragraph = body.textItems.find((item) =>
    /\b(?:paragraph|description|supporting-copy|body-copy)\b/i.test(item.id)
  )
  if (!heading || !paragraph) return null
  const headingDirectionWords = clean(heading.contentDirection)
    .split(/\s+/)
    .filter(Boolean).length
  const paragraphHasContent =
    clean(paragraph.contentDirection) ||
    clean(paragraph.staticText) ||
    clean(paragraph.text)
  const paragraphLengthHeading =
    Number(heading.wordLengthMax) >= 15 || headingDirectionWords >= 15
  if (!paragraphLengthHeading || paragraphHasContent) return null
  return { heading, paragraph }
}

function toneStyleBoundaryNextSteps(
  automation: AutomationRecord
): LumenClipNextStep[] {
  const style = clean(automation.schema.prompt_formatting.style)
  const voiceRules = styleVoiceRules(style)
  if (voiceRules.length === 0) return []
  const structuralRules = splitPromptRules(style).filter(
    (rule) => !isVoiceRule(rule)
  )
  return [
    {
      id: "move-voice-rules-out-of-structural-style",
      severity: "recommended",
      reason:
        "tone.value owns register, diction, rhythm, person, and casing. Remove those voice rules from prompt_formatting.style so structural instructions cannot contradict tone.",
      tool: "lumenclip_template_schema_update",
      args: {
        templateId: automation.id,
        expectedUpdatedAt: automation.updatedAt,
        mode: "patch",
        schema: {
          prompt_formatting: {
            style: structuralRules.join("\n"),
          },
        },
      },
      blocks: [],
    },
  ]
}

function styleVoiceRules(style: string) {
  return splitPromptRules(style).filter(isVoiceRule)
}

function splitPromptRules(value: string) {
  return clean(value)
    .split(/\r?\n+|(?<=[.!?])\s+/)
    .map(clean)
    .filter(Boolean)
}

function isVoiceRule(value: string) {
  return /\b(?:voice|register|diction|sentence rhythm|word choice|slang|all lowercase|lowercase|uppercase|sentence case|title case|first person|second person|conversational|informal|formal|witty|humorous|calm|reflective|motivational|empowering|authoritative|reassuring|provocative|relatable)\b/i.test(
    value
  )
}

function missingCollectionReferenceNextSteps(
  unresolvedCollectionReferences: string[]
): LumenClipNextStep[] {
  const references = [...new Set(unresolvedCollectionReferences)]
  if (references.length === 0) return []
  return [
    {
      id: "replace-missing-collection-references",
      severity: "required",
      reason: `This template references missing media ${references.length === 1 ? "collection" : "collections"}: ${references.join(", ")}. Select replacement collection IDs and patch every dangling reference before running it.`,
      tool: "lumenclip_collections_list",
      args: { minimumItemCount: 1, limit: 100 },
      blocks: ["lumenclip_template_run"],
    },
  ]
}

function outputNextSteps(output: {
  id: string
  publicationState: OutputSummary["publicationState"]
  qa?: ReturnType<typeof validateAutomationRunOutput>
}): LumenClipNextStep[] {
  const steps: LumenClipNextStep[] = []
  if (output.qa && !output.qa.valid) {
    steps.push({
      id: "resolve-output-qa-failure",
      severity: "required",
      reason:
        "This output failed deterministic QA. Regenerate it, or explicitly accept the findings with overrideQaFailure and qaOverrideReason.",
      tool: "lumenclip_output_validate",
      args: { outputId: output.id },
      blocks: ["lumenclip_output_publish"],
    })
  }
  if (["not_published", "draft", "failed"].includes(output.publicationState)) {
    steps.push({
      id: "publish-output",
      severity: "recommended",
      reason:
        "This generated output has no completed publication, so it cannot accumulate post analytics yet.",
      tool: "lumenclip_output_publish",
      args: { outputId: output.id },
      blocks: ["lumenclip_analytics_report"],
    })
  }
  return steps
}

function qaNextSteps(input: {
  automationId: string
  outputId?: string
  qa?: ReturnType<typeof validateAutomationRunOutput>
}): LumenClipNextStep[] {
  if (!input.qa || input.qa.valid) return []
  return [
    {
      id: "resolve-generated-output-qa-failure",
      severity: "required",
      reason:
        "Generation completed with deterministic QA errors. Regenerate before publishing, or use an explicit QA override with a recorded reason.",
      tool: "lumenclip_template_run",
      args: {
        templateId: input.automationId,
        requestId: `qa-retry-${input.outputId ?? crypto.randomUUID()}`,
      },
      blocks: ["lumenclip_output_publish"],
    },
  ]
}

async function qaForAutomationRun(
  services: LumenClipMcpServices,
  run: AutomationRunRecord
) {
  const [automation, runs] = await Promise.all([
    services.getAutomationRecord(run.automationId),
    services.listAutomationRuns({ automationId: run.automationId, limit: 500 }),
  ])
  return validateAutomationRunOutput({
    run,
    schema: automation?.schema,
    priorRuns: runs,
  })
}

function upsertAutomationHooks(input: {
  current: AutomationHookItem[]
  updates: Array<{
    id?: string
    text: string
    enabled?: boolean
    bodySlideCount?: number | null
    tone?: string | null
  }>
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
    const bodySlideCount =
      update.bodySlideCount === undefined
        ? hook.bodySlideCount
        : (update.bodySlideCount ?? undefined)
    const tone =
      update.tone === undefined ? hook.tone : clean(update.tone) || undefined
    return text === hook.text &&
      enabled === hook.enabled &&
      bodySlideCount === hook.bodySlideCount &&
      tone === hook.tone
      ? hook
      : {
          ...hook,
          text,
          enabled,
          bodySlideCount,
          tone,
          updatedAt: input.now,
        }
  })
  for (const update of input.updates) {
    const requestedId = clean(update.id)
    if (requestedId && consumed.has(requestedId)) continue
    const text = clean(update.text)
    const existing = next.find(
      (hook) => hook.text.toLowerCase() === text.toLowerCase()
    )
    if (existing) {
      const nextEnabled = update.enabled ?? existing.enabled
      const nextBodySlideCount =
        update.bodySlideCount === undefined
          ? existing.bodySlideCount
          : (update.bodySlideCount ?? undefined)
      const nextTone =
        update.tone === undefined
          ? existing.tone
          : clean(update.tone) || undefined
      if (
        nextEnabled !== existing.enabled ||
        nextBodySlideCount !== existing.bodySlideCount ||
        nextTone !== existing.tone
      ) {
        existing.enabled = nextEnabled
        existing.bodySlideCount = nextBodySlideCount
        existing.tone = nextTone
        existing.updatedAt = input.now
      }
      continue
    }
    next.push({
      id: requestedId || automationHookId(text),
      text,
      enabled: update.enabled ?? true,
      ...(update.bodySlideCount
        ? { bodySlideCount: update.bodySlideCount }
        : {}),
      ...(clean(update.tone) ? { tone: clean(update.tone) } : {}),
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
    usage: record.usage,
    operations: record.operations,
  }
}

function serializeSocialAutomation(record: XAutomationRecord) {
  return {
    id: record.id,
    name: record.name,
    hidden: record.hidden,
    kind: record.platform,
    status: record.status,
    updatedAt: record.updatedAt,
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

function buildRunSlides(run: AutomationRunRecord) {
  return run.plan.slides.map((planSlide, index) => {
    const renderedSlide = run.renderedSlides?.[index]
    const renderedPath = run.outputImages?.[index] ?? ""
    const sourcePath = renderedSlide?.sourceImageUrl ?? planSlide.imageUrl ?? ""
    return {
      index: index + 1,
      role: planSlide.role,
      text: renderedSlide?.text || planSlide.text,
      renderedImageUrl: absoluteAssetUrl(renderedPath),
      sourceImageUrl: sourcePath ? absoluteAssetUrl(sourcePath) : undefined,
    }
  })
}

function slideshowDeliveryFields(ownerId: string, outputId: string) {
  if (!ownerId || !outputId) return {}
  const delivery = slideshowDeliveryLinks({ ownerId, outputId })
  return delivery
    ? {
        previewUrl: delivery.previewUrl,
        workflowUrl: delivery.workflowUrl,
        downloadUrl: delivery.downloadUrl,
      }
    : {}
}

function generationPasses(run: AutomationRunRecord) {
  const generatedCaption = clean(
    run.plan.debug?.generatedCaption ??
      run.plan.debug?.textGenerationResult?.caption
  )
  const resolvedCaption = clean(run.plan.caption)
  const transformationPasses = Object.entries(
    Object.groupBy(
      run.plan.debug?.textTransformations ?? [],
      (transformation) => transformation.pass
    )
  ).map(([id, transformations]) => ({
    id,
    ran: true,
    changes: (transformations ?? []).map(({ field, before, after }) => ({
      field,
      before,
      after,
    })),
  }))
  return [
    ...transformationPasses,
    {
      id: "caption_resolution",
      ran: true,
      changes:
        generatedCaption && generatedCaption !== resolvedCaption
          ? [
              {
                field: "caption",
                before: generatedCaption,
                after: resolvedCaption,
              },
            ]
          : [],
    },
    {
      id: "image_text_coherence_repair",
      ran: run.plan.debug?.imageTextCoherenceRepair === true,
      changes: [],
    },
  ]
}

function generatedRunSummary(
  run: AutomationRunRecord,
  ownerId: string,
  qa?: ReturnType<typeof validateAutomationRunOutput>
) {
  return {
    runId: run.id,
    slideshowId: run.slideshowId,
    status: run.status,
    title: run.plan.title,
    hook: run.plan.hook,
    slideCount: run.plan.slides.length,
    violations: run.plan.violations ?? [],
    qa,
    qaValid: qa?.valid,
    qaFindings: qa?.findings ?? [],
    generationPasses: generationPasses(run),
    thumbnailUrl: run.thumbnailUrl,
    outputImages: run.outputImages,
    slides: buildRunSlides(run),
    ...(run.slideshowId
      ? slideshowDeliveryFields(ownerId, run.slideshowId)
      : {}),
    createdAt: run.createdAt,
    error: run.error,
  }
}

type MetricTotals = Partial<Record<CanonicalMetric, number>>

export function buildAnalyticsReport(input: {
  snapshots: PostFastMetricSnapshot[]
  followerSnapshots: AccountFollowerSnapshot[]
  publications?: PostFastPostRecord[]
  captureImports?: TikTokStudioImportRecord[]
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
  const suppliedPublications = input.publications !== undefined
  const publications = canonicalAnalyticsPublications(
    (input.publications ?? []).filter((publication) => {
      const activityAt =
        publication.publishedAt ||
        publication.createdAt ||
        publication.updatedAt
      return (
        (publication.status === "published" ||
          Boolean(publication.publishedAt)) &&
        Date.parse(activityAt) >= Date.parse(since) &&
        (requested.size === 0 || requested.has(publication.integrationId))
      )
    })
  )
  const publicationById = new Map(
    publications.map((publication) => [publication.id, publication])
  )
  const visibleSnapshots = input.snapshots
    .map((snapshot) => {
      const publication =
        publicationById.get(snapshot.postId) ??
        publications.find(
          (item) =>
            clean(item.externalPostId) &&
            clean(item.externalPostId) === clean(snapshot.platformPostId)
        )
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
  for (const snapshot of visibleSnapshots) {
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
  const snapshotForPublication = (publication: PostFastPostRecord) =>
    latest.find(
      (snapshot) =>
        snapshot.postId === publication.id ||
        (clean(publication.externalPostId) &&
          clean(publication.externalPostId) === clean(snapshot.platformPostId))
    )
  const posts: Array<{
    publication?: PostFastPostRecord
    snapshot?: PostFastMetricSnapshot
  }> = suppliedPublications
    ? publications.map((publication) => ({
        publication,
        snapshot: snapshotForPublication(publication),
      }))
    : latest.map((snapshot) => ({ snapshot }))
  const integrationIds = new Set([
    ...posts.map(
      (post) => post.publication?.integrationId ?? post.snapshot!.integrationId
    ),
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
      const accountPosts = posts.filter(
        (post) =>
          (post.publication?.integrationId ?? post.snapshot?.integrationId) ===
          integrationId
      )
      const metricPosts = accountPosts.flatMap((post) =>
        post.snapshot ? [post.snapshot] : []
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
          accountPosts[0]?.publication?.provider ||
          metricPosts[0]?.provider ||
          lastFollower?.provider ||
          firstFollower?.provider,
        postCount: accountPosts.length,
        withMetrics: metricPosts.length,
        awaitingCapture: accountPosts.length - metricPosts.length,
        metrics: aggregateMetrics(metricPosts.map((post) => post.metrics)),
        newFollowers: metricPosts.reduce(
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
    postCount: posts.length,
    withMetrics: posts.filter((post) => post.snapshot).length,
    awaitingCapture: posts.filter((post) => !post.snapshot).length,
    totals: aggregateMetrics(accounts.map((account) => account.metrics)),
    accounts,
    posts: posts
      .sort((left, right) =>
        analyticsPostSortAt(right).localeCompare(analyticsPostSortAt(left))
      )
      .slice(0, input.postLimit)
      .map(({ publication, snapshot }) => ({
        postId: publication?.id ?? snapshot!.postId,
        externalPostId: publication?.externalPostId ?? snapshot?.platformPostId,
        integrationId: publication?.integrationId ?? snapshot!.integrationId,
        provider: publication?.provider ?? snapshot!.provider,
        status: publication?.status,
        linkState: publication?.linkState,
        hasMetrics: Boolean(snapshot),
        metricsStatus: snapshot ? "captured" : "awaiting_capture",
        capture: publication
          ? analyticsCaptureAttempt({
              publication,
              snapshot,
              imports: input.captureImports ?? [],
              now: input.now,
            })
          : {
              publicationId: snapshot!.postId,
              status: "captured" as const,
              updatedAt: snapshot!.capturedAt,
            },
        capturedAt: snapshot?.capturedAt,
        publishedAt: publication?.publishedAt ?? snapshot?.publishedAt,
        content: publication?.content ?? snapshot?.content,
        contentType: snapshot?.contentType,
        sourceType: publication?.sourceType ?? snapshot?.sourceType,
        sourceId: publication?.sourceId ?? snapshot?.sourceId,
        releaseUrl: publication?.releaseUrl ?? snapshot?.releaseUrl,
        metrics: snapshot?.metrics ?? {},
        newFollowers: snapshot
          ? numberValue(snapshot.rawMetrics.newFollowers)
          : undefined,
        analyticsSource: snapshot?.source ?? undefined,
        studioReportTool:
          snapshot?.source === "tiktok_studio"
            ? "lumenclip_tiktok_studio_analytics_report"
            : undefined,
      })),
  }
}

function canonicalAnalyticsPublications(publications: PostFastPostRecord[]) {
  const byIdentity = new Map<string, PostFastPostRecord>()
  for (const publication of publications) {
    const externalId = clean(publication.externalPostId)
    const key = externalId
      ? `${publication.provider.toLowerCase()}:${externalId}`
      : publication.id
    const existing = byIdentity.get(key)
    if (
      !existing ||
      Date.parse(publication.updatedAt) > Date.parse(existing.updatedAt)
    ) {
      byIdentity.set(key, publication)
    }
  }
  return [...byIdentity.values()]
}

function analyticsPostSortAt(post: {
  publication?: PostFastPostRecord
  snapshot?: PostFastMetricSnapshot
}) {
  return (
    post.publication?.publishedAt ||
    post.snapshot?.publishedAt ||
    post.snapshot?.capturedAt ||
    post.publication?.createdAt ||
    ""
  )
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

async function ownedMcpTask<T>(ownerId: string, task: () => T): Promise<T> {
  try {
    return await withSystemOwner(ownerId, task)
  } catch (error) {
    throw toLumenClipDataError(error)
  }
}
