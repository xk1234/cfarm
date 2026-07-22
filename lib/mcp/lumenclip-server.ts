import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import {
  automationRecordToSummary,
  getAutomationRecord,
  listAutomationRecords,
  patchAutomationRecord,
  type AutomationRecord,
} from "@/lib/automations"
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
import { clean } from "@/lib/guards"
import {
  deleteImageCollections,
  importRemoteImagesToCollection,
  listImageCollections,
  upsertImageCollection,
  type StoredImageCollection,
} from "@/lib/image-collections"
import { linkPublishedOutput } from "@/lib/manual-publication-linking"
import type { CanonicalMetric } from "@/lib/metric-registry"
import { listAnalyticsIntegrations } from "@/lib/postfast-analytics"
import type {
  PostFastCreatePostType,
  PostFastSocialIntegration,
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
import { enqueueJob, getJob, type Job } from "@/lib/queue"
import type { Automation } from "@/lib/realfarm-data"
import type {
  AutomationDay,
  AutomationSchedule,
  AutomationUgcConfig,
} from "@/lib/realfarm-automation"
import {
  automationCollectionIds,
  normalizeUgcConfig,
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
import { listWordCollections } from "@/lib/word-collections"
import { estimateUgcCost } from "@/lib/ugc-cost"
import {
  ugcExportId,
  ugcRunId,
  ugcStageOrder,
} from "@/lib/ugc-automation-runner"
import { getUgcRunStatus, type UgcRunStatus } from "@/lib/ugc-run-status"

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
    ),
  days: z.array(z.enum(automationDays)).min(1).max(7),
  enabled: z.boolean().optional(),
})

const schedulePatchSchema = z.object({
  timezone: z.string().trim().min(1).max(100).optional(),
  postingTimes: z.array(postingTimeSchema).min(1).max(20).optional(),
  jitterMinutes: z.number().int().min(0).max(720).optional(),
})

export type LumenClipMcpServices = {
  now: () => Date
  listAutomationRecords: typeof listAutomationRecords
  getAutomationRecord: typeof getAutomationRecord
  patchAutomationRecord: typeof patchAutomationRecord
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
  listProductCollections: typeof listProductCollections
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
  enqueueJob: typeof enqueueJob
  getJob: typeof getJob
  getUgcRunStatus: typeof getUgcRunStatus
  estimateUgcCost: typeof estimateUgcCost
  ugcGenerationEnabled: () => boolean
}

const defaultServices: LumenClipMcpServices = {
  now: () => new Date(),
  listAutomationRecords,
  getAutomationRecord,
  patchAutomationRecord,
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
  listProductCollections,
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
  enqueueJob,
  getJob,
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
    version: "1.5.0",
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
        automationId: z.string().trim().min(1).optional(),
        from: z.string().datetime({ offset: true }).optional(),
        days: z.number().int().min(1).max(90).default(14),
        includePaused: z.boolean().default(true),
        limit: z.number().int().min(1).max(200).default(100),
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
          const [automations, socialAutomations] = await Promise.all([
            services.listAutomationRecords(),
            services.listXAutomations(),
          ])
          return buildScheduleReport({
            automations,
            socialAutomations,
            automationId: input.automationId,
            from: input.from ? new Date(input.from) : services.now(),
            days: input.days,
            includePaused: input.includePaused,
            limit: input.limit,
          })
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
        automationId: z.string().trim().min(1),
        requestId: z.string().trim().min(1).max(200).optional(),
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
        automationId: z.string().trim().min(1).optional(),
        actorSource: z.enum(["generate", "gallery", "upload"]).optional(),
        actorAssetUrl: z.string().url().optional(),
        voiceModel: z.string().trim().min(1).max(200).optional(),
        lipSyncTier: z.enum(["standard", "premium"]).optional(),
        targetDurationSeconds: z.number().int().min(15).max(180).optional(),
        brollCount: z.number().int().min(0).max(6).optional(),
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
              throw new Error("The selected automation is not an AI UGC automation")
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
        "Queues one saved AI UGC automation and immediately returns an unpublished draft operation, expected output ID, cost estimate, and polling action. It never publishes content.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        requestId: z.string().trim().min(1).max(200),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) =>
      mcpResult(await owned(() => runUgcDraft(services, input)))
  )

  server.registerTool(
    "lumenclip_automation_update",
    {
      title: "Update or pause an automation",
      description:
        "Updates safe common automation settings. Use action pause or resume to stop or restart scheduled runs; schedule changes preserve all generation and publishing configuration.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
        action: z.enum(["pause", "resume"]).optional(),
        name: z.string().trim().min(1).max(200).optional(),
        favorite: z.boolean().optional(),
        schedule: schedulePatchSchema.optional(),
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
        "Reads stored, owner-scoped post and follower analytics without refreshing providers. Returns latest-per-post totals, account breakdowns, follower change, and recent posts.",
      inputSchema: {
        days: z.number().int().min(1).max(365).default(30),
        integrationIds: z.array(z.string().trim().min(1)).max(100).optional(),
        postLimit: z.number().int().min(1).max(200).default(50),
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
            now: services.now(),
            days: input.days,
            integrationIds: input.integrationIds,
            postLimit: input.postLimit,
          })
        )
      )
  )

  registerTikTokPublicationTools(server, ownerId, services)

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
        query: z.string().trim().max(200).optional(),
        kind: z.enum(["slideshow", "video", "ugc", "x", "threads"]).optional(),
        status: z.enum(["live", "paused", "unknown"]).optional(),
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
    "lumenclip_automation_get",
    {
      title: "Get automation",
      description:
        "Returns one caller-owned automation's normalized schedule, linked collections/accounts, publishing policy, and most recent run.",
      inputSchema: { automationId: z.string().trim().min(1) },
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
    "lumenclip_automation_run",
    {
      title: "Run an automation",
      description:
        "Generates one unpublished, unscheduled draft from a saved slideshow, AI UGC, X, or Threads automation. AI UGC runs asynchronously and returns a pollable operation. Saved video automations remain discoverable but do not yet have a shared runner.",
      inputSchema: {
        automationId: z.string().trim().min(1),
        topic: z.string().trim().max(1000).optional(),
        requestId: z.string().trim().min(1).max(200),
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
        query: z.string().trim().max(200).optional(),
        mediaType: z.enum(["image", "video", "word", "product"]).optional(),
        minimumItemCount: z.number().int().min(0).default(0),
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
    "lumenclip_collection_save",
    {
      title: "Create or save a media collection",
      description:
        "Creates an empty caller-owned image or video collection, or updates an existing collection's pinned state without replacing its assets. Use collection_add_assets afterward to import media.",
      inputSchema: {
        collectionId: z.string().trim().min(1).optional(),
        name: z.string().trim().min(1).max(200),
        mediaType: z.enum(["image", "video"]),
        pinned: z.boolean().optional(),
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
        "Downloads validated HTTPS image or video assets into one existing caller-owned media collection. Word and product collections are read-only through this tool.",
      inputSchema: {
        collectionId: z.string().trim().min(1),
        assets: z
          .array(
            z.object({
              httpsUrl: z
                .string()
                .url()
                .refine((value) => value.startsWith("https://"), {
                  message: "Asset URLs must use HTTPS",
                }),
              caption: z.string().trim().max(5000).optional(),
              sourceUrl: z.string().url().optional(),
            })
          )
          .min(1)
          .max(80),
        requestId: z.string().trim().min(1).max(200),
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
        "Soft-deletes one caller-owned image or video collection for 30 days. Referenced collections are rejected unless allowReferenced is explicitly true.",
      inputSchema: {
        collectionId: z.string().trim().min(1),
        requestId: z.string().trim().min(1).max(200),
        allowReferenced: z.boolean().default(false),
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
        "Lists caller-owned slideshow, generated-video, X, and Threads outputs with readiness and publication state.",
      inputSchema: {
        automationId: z.string().trim().min(1).optional(),
        outputType: z
          .enum(["slideshow", "video", "x_post", "threads_post"])
          .optional(),
        status: z.enum(["running", "ready", "failed"]).optional(),
        publicationState: z
          .enum(["not_published", "draft", "scheduled", "published", "failed"])
          .optional(),
        createdFrom: z.string().datetime({ offset: true }).optional(),
        createdTo: z.string().datetime({ offset: true }).optional(),
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
        outputId: z.string().trim().min(1),
        requestId: z.string().trim().min(1).max(200),
        confirmDelete: z.literal(true),
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
    "lumenclip_operation_get",
    {
      title: "Get generation operation",
      description:
        "Reads current or terminal status for a slideshow automation run, AI UGC queue/run, social draft run, or generated-video job.",
      inputSchema: { operationId: z.string().trim().min(1) },
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
        "Reads safe connected-account metadata and the publishing capabilities exposed by the current PostFast bridge. Credentials are never returned.",
      inputSchema: {
        provider: z.string().trim().min(1).optional(),
        limit: z.number().int().min(1).max(100).default(50),
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
    "lumenclip_output_publish",
    {
      title: "Publish or schedule an output",
      description:
        "Uploads a ready caller-owned output and creates a PostFast publication for explicitly selected connected accounts. Requires literal confirmation and suppresses duplicate successful publications per output/account.",
      inputSchema: {
        outputId: z.string().trim().min(1),
        targets: z
          .array(
            z.object({
              accountId: z.string().trim().min(1),
              mode: z.enum(["now", "schedule"]),
              scheduledAt: z.string().datetime({ offset: true }).optional(),
            })
          )
          .min(1)
          .max(20),
        caption: z.string().trim().max(100000).optional(),
        requestId: z.string().trim().min(1).max(200),
        confirmPublish: z.literal(true),
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
        outputId: z.string().trim().min(1),
        platform: z.string().trim().min(1).max(100),
        publishedUrl: z.string().url(),
        publishedAt: z.string().datetime({ offset: true }),
        accountId: z.string().trim().min(1).optional(),
        requestId: z.string().trim().min(1).max(200),
        confirmLink: z.literal(true),
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
      ? activeStage ?? "failed"
      : activeStage ?? input.job?.status ?? input.run?.status ?? "queued"
  const createdAt =
    input.run?.createdAt ?? input.job?.createdAt ?? input.scheduledFor ?? null
  const updatedAt =
    input.run?.updatedAt ?? input.job?.updatedAt ?? createdAt
  return {
    automationId: input.automationId || undefined,
    runId: input.run?.id,
    operation: {
      id: input.id,
      kind: "ugc.generate",
      status,
      stage,
      progress: succeeded || failed
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
    "not_published" | "draft" | "scheduled" | "published" | "failed"
  title: string
  previewUri?: string
  createdAt: string
  resourceUri: string
}

async function listOutputSummaries(
  services: LumenClipMcpServices
): Promise<OutputSummary[]> {
  const [runs, videos, socialRuns, publications] = await Promise.all([
    services.listAutomationRuns({ limit: 500 }),
    services.listGeneratedVideoExports({ limit: 500 }),
    services.listXAutomationRuns(),
    services.listPostFastPostRecords(),
  ])
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
      }
    }),
    ...socialRuns.map((run) => ({
      id: run.id,
      outputType:
        run.platform === "threads"
          ? ("threads_post" as const)
          : ("x_post" as const),
      automationId: run.automationId,
      status:
        run.status === "failed" ? ("failed" as const) : ("ready" as const),
      publicationState: publicationState(
        publications.filter(
          (publication) =>
            publication.sourceType === "x_automation" &&
            publication.sourceId === run.id
        ),
        run.status === "published" ? run.updatedAt : undefined
      ),
      title: run.hook || run.topic || run.automationName,
      previewUri: run.imageUrls[0],
      createdAt: run.createdAt,
      resourceUri: `lumenclip://outputs/${encodeURIComponent(run.id)}`,
    })),
  ]
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
  if (
    manuallyPublishedAt ||
    publications.some((item) => item.status === "published")
  ) {
    return "published"
  }
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
        [video.description || video.caption || video.title, ...video.hashtags]
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
        "Starts a read-only download of TikTok photo slideshows. Poll the preview tool with the returned operation id.",
      inputSchema: {
        urls: z
          .array(z.string().url())
          .min(1)
          .max(20)
          .describe("Public TikTok /photo/ URLs"),
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
        "Reads imported TikTok slide text and compares each post with one automation's generated slideshows. This never changes publication data.",
      inputSchema: {
        operationId: z.string().trim().min(1),
        automationId: z.string().trim().min(1),
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
        "Records selected TikTok posts as published and attributes them to generated slideshows. Recovery creates a historical output when the local output was lost. Requires explicit confirmation.",
      inputSchema: {
        operationId: z.string().trim().min(1),
        automationId: z.string().trim().min(1),
        integrationId: z.string().trim().min(1),
        selections: z
          .array(
            z
              .object({
                postId: z.string().trim().min(1),
                runId: z.string().trim().min(1).optional(),
                recover: z.boolean().optional(),
              })
              .refine(
                (selection) =>
                  Boolean(selection.runId) !== Boolean(selection.recover),
                "Choose exactly one runId or recover: true"
              )
          )
          .min(1)
          .max(20),
        confirm: z
          .literal(true)
          .describe("Must be true after the matches have been reviewed"),
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
  const visible = input.snapshots.filter(
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

function mcpResult(value: Record<string, unknown> | unknown[]) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: Array.isArray(value) ? { items: value } : value,
  }
}
