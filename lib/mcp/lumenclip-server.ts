import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { absoluteAssetUrl, slideshowDeliveryLinks } from "@/lib/asset-urls"
import { listAssetRecords } from "@/lib/assets"
import { toLumenClipDataError } from "@/lib/data-store-errors"
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
import {
  postfastRequest,
  type PostFastCreatePostType,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import { listConnectedPostFastIntegrations } from "@/lib/postfast-integrations"
import { uploadPostFastMediaSources } from "@/lib/postfast-media-upload"
import {
  listPostFastPostRecords,
  type PostFastPostRecord,
} from "@/lib/postfast-posts"
import {
  deletePosts as deletePostFastPostRecords,
  listPublicationRecordsForRead,
  type PublicationReadFilters,
} from "@/lib/post-repository"
import { publicationLinkState as resolvedPublicationLinkState } from "@/lib/publication-link-state"
import { publishPost } from "@/lib/publishing"
import { getJob, listJobs, type Job } from "@/lib/queue"
import {
  collectionMatchesId,
  storedToCollection,
} from "@/lib/realfarm-collections"
import {
  isPostLinkedToSlideshow,
  slideshowDeletionBlockReason,
} from "@/lib/slideshow-lifecycle"
import {
  deleteSlideshowRecord,
  listSlideshowRecords,
  type SlideshowRecord,
} from "@/lib/slideshows"
import { withSystemOwner } from "@/lib/system-owner-context"
import { assertPublicHttpUrl } from "@/lib/url-guard"

export type LumenClipMcpServices = {
  now: () => Date
  listImageCollections: typeof listImageCollections
  deleteImageCollections: typeof deleteImageCollections
  upsertImageCollection: typeof upsertImageCollection
  importRemoteImagesToCollection: typeof importRemoteImagesToCollection
  listAssetRecords: typeof listAssetRecords
  listMediaLibraryAssets: typeof listMediaLibraryAssets
  listAccounts: (ownerId: string) => Promise<PostFastSocialIntegration[]>
  listPostFastPostRecords: typeof listPostFastPostRecords
  deletePostFastPostRecords: typeof deletePostFastPostRecords
  listSlideshowRecords: typeof listSlideshowRecords
  deleteSlideshowRecord: typeof deleteSlideshowRecord
  uploadPostFastMediaSources: typeof uploadPostFastMediaSources
  publishPost: typeof publishPost
  linkPublishedOutput: typeof linkPublishedOutput
  getJob: typeof getJob
  listJobs: typeof listJobs
  postfastRequest: typeof postfastRequest
}

const defaultServices: LumenClipMcpServices = {
  now: () => new Date(),
  listImageCollections,
  deleteImageCollections,
  upsertImageCollection,
  importRemoteImagesToCollection,
  listAssetRecords,
  listMediaLibraryAssets,
  listAccounts: listConnectedPostFastIntegrations,
  listPostFastPostRecords,
  deletePostFastPostRecords,
  listSlideshowRecords,
  deleteSlideshowRecord,
  uploadPostFastMediaSources,
  publishPost,
  linkPublishedOutput,
  getJob,
  listJobs,
  postfastRequest,
}

const OUTPUT_LIST_LIMIT = 500

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
  overrides: Partial<LumenClipMcpServices> = {},
  options: { disabledToolNames?: Iterable<string> } = {}
) {
  const services = { ...defaultServices, ...overrides }
  const server = new McpServer({
    name: "lumenclip",
    version: "3.0.0",
  })
  const disabledToolNames = new Set(options.disabledToolNames)
  const registerTool = server.registerTool.bind(server)
  server.registerTool = ((name: string, ...args: unknown[]) => {
    const tool = (
      registerTool as (...input: unknown[]) => ReturnType<typeof registerTool>
    )(name, ...args)
    if (disabledToolNames.has(name)) tool.disable()
    return tool
  }) as typeof server.registerTool

  registerScheduleTools(server, ownerId, services)
  registerCollectionTools(server, ownerId, services)
  registerOutputTools(server, ownerId, services)
  registerPublishingTools(server, ownerId, services)

  return server
}

function registerScheduleTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  const owned = <T>(task: () => T) => ownedMcpTask(ownerId, task)

  server.registerTool(
    "lumenclip_schedule_get",
    {
      title: "Check the publishing schedule",
      description:
        "Returns scheduled, published, draft, and failed publications plus queued render jobs in a time window. This never renders or publishes content.",
      inputSchema: {
        from: z
          .string()
          .datetime({ offset: true })
          .optional()
          .describe(
            'Inclusive ISO datetime with timezone offset for the window start, e.g. "2026-07-23T09:00:00+08:00". Defaults to now.'
          ),
        days: z
          .number()
          .int()
          .min(1)
          .max(90)
          .default(14)
          .describe("Number of calendar days to include from the start, e.g. 14."),
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
          const from = input.from ? new Date(input.from) : services.now()
          const to = new Date(
            from.getTime() + input.days * 24 * 60 * 60 * 1000
          )
          const [jobs, publications, remote] = await Promise.all([
            services.listJobs({ limit: 500 }),
            readMcpPublications(services, "schedule"),
            services
              .postfastRequest("/social-posts", {
                query: {
                  from: from.toISOString(),
                  to: to.toISOString(),
                  page: 0,
                  limit: 200,
                },
              })
              .catch(() => []),
          ])
          return {
            from: from.toISOString(),
            to: to.toISOString(),
            calendarItems: buildCalendarLifecycleItems({
              jobs,
              publications,
              remote,
              from,
              to,
              limit: input.limit,
            }),
          }
        })
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
        "Lists caller-owned image and video collections with stable IDs and item counts.",
      inputSchema: {
        query: z
          .string()
          .trim()
          .max(200)
          .optional()
          .describe(
            'Optional case-insensitive search over collection name, e.g. "hdb interiors".'
          ),
        mediaType: z
          .enum(["image", "video"])
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
          const query = clean(input.query).toLowerCase()
          const items = (await services.listImageCollections())
            .map(mediaCollectionSummary)
            .filter(
              (item) => !input.mediaType || item.mediaType === input.mediaType
            )
            .filter((item) => item.itemCount >= input.minimumItemCount)
            .filter(
              (item) => !query || item.name.toLowerCase().includes(query)
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
    "lumenclip_assets_list",
    {
      title: "List media-library assets",
      description:
        "Lists uploaded AssetRecord entries together with media-library items.",
      inputSchema: {
        kind: z.enum(["image", "video", "audio", "text"]).optional(),
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
            services.listAssetRecords({ kind: input.kind }),
            services.listMediaLibraryAssets(),
          ])
          const query = clean(input.query).toLowerCase()
          const items = [
            ...records.map((asset) => ({
              recordType: "asset_record" as const,
              ...asset,
            })),
            ...library
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
              "Renaming media collections is not supported because the collection ID is derived from its name"
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
              ? ["The collection is empty. Add assets before using it."]
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
        "Downloads validated HTTPS image or video assets into one existing caller-owned media collection. Returns the updated collection summary plus added/duplicate counts.",
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
        "Soft-deletes one caller-owned image or video collection for 30 days. Returns deletion timestamps.",
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
            }
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
          }
        })
      )
    }
  )
}

function registerOutputTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  const owned = <T>(task: () => T) => ownedMcpTask(ownerId, task)

  server.registerTool(
    "lumenclip_outputs_list",
    {
      title: "List rendered outputs",
      description:
        "Lists caller-owned rendered slideshows with readiness, publication state, and signed public viewer/download URLs when sharing is configured.",
      inputSchema: {
        status: z
          .enum(["ready", "failed"])
          .optional()
          .describe('Optional render status filter, e.g. "ready".'),
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
          const [slideshows, publications] = await Promise.all([
            services.listSlideshowRecords({ limit: OUTPUT_LIST_LIMIT }),
            readMcpPublications(services, "output_summaries"),
          ])
          const createdFrom = input.createdFrom
            ? Date.parse(input.createdFrom)
            : undefined
          const createdTo = input.createdTo
            ? Date.parse(input.createdTo)
            : undefined
          const filtered = slideshows
            .map((slideshow) =>
              outputSummary(slideshow, publications, ownerId)
            )
            .filter((item) => !input.status || item.status === input.status)
            .filter(
              (item) =>
                !input.publicationState ||
                item.publicationState === input.publicationState
            )
            .filter(
              (item) =>
                createdFrom === undefined ||
                Date.parse(item.createdAt) >= createdFrom
            )
            .filter(
              (item) =>
                createdTo === undefined ||
                Date.parse(item.createdAt) <= createdTo
            )
            .sort((left, right) =>
              right.createdAt.localeCompare(left.createdAt)
            )
          const offset = input.cursor ? Number(input.cursor) : 0
          const page = filtered.slice(offset, offset + input.limit)
          const nextOffset = offset + page.length
          return {
            items: page,
            nextCursor:
              nextOffset < filtered.length ? String(nextOffset) : undefined,
            hasMore: nextOffset < filtered.length,
            total: filtered.length,
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_output_get",
    {
      title: "Inspect a rendered output",
      description:
        "Returns one caller-owned rendered slideshow with its per-slide text, source and rendered image URLs, settings, caption, publication state, and signed public viewer/direct-download URLs when sharing is configured.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Output ID returned by outputs_list, e.g. "slideshow-123".'
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
          const slideshow = await findSlideshow(services, outputId)
          if (!slideshow) throw new Error("Output not found")
          const publications = await readMcpPublications(
            services,
            "output_get",
            { sourceIds: [slideshow.id] }
          )
          return {
            ...outputSummary(slideshow, publications, ownerId),
            caption: slideshow.caption,
            hashtags: slideshow.hashtags,
            settings: slideshow.settings,
            updatedAt: slideshow.updated_at,
            slides: slideshow.images.map((slide, index) => {
              const sourcePath = clean(
                slide.source_image_url ?? slide.image_url
              )
              const renderedPath = clean(slideshow.output_images[index])
              return {
                index: index + 1,
                textItems: (slide.textItems ?? []).map((item) => ({
                  id: item.id,
                  text: item.text,
                })),
                sourceImageUrl: sourcePath
                  ? absoluteAssetUrl(sourcePath)
                  : undefined,
                renderedImageUrl: renderedPath
                  ? absoluteAssetUrl(renderedPath)
                  : undefined,
              }
            }),
            publications: publications
              .filter((publication) =>
                isPostLinkedToSlideshow(publication, {
                  slideshowId: slideshow.id,
                })
              )
              .map(publicationSummary),
          }
        })
      )
  )

  server.registerTool(
    "lumenclip_output_delete",
    {
      title: "Delete an unpublished output",
      description:
        "Permanently deletes one caller-owned rendered slideshow and its local draft publication records. Published and scheduled outputs are never deleted.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe('Output ID returned by outputs_list, e.g. "slideshow-123".'),
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
      title: "List background operations",
      description:
        "Lists queue jobs with status, attempts, timestamps, errors, payload, and result.",
      inputSchema: {
        status: z
          .enum(["queued", "processing", "completed", "failed", "dead"])
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
          const jobs = await services.listJobs({
            status: input.status,
            type: input.type,
            limit: input.limit,
          })
          const operations = jobs.map(jobOperation)
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
      title: "Get background operation",
      description:
        "Reads current or terminal status for one queue job. Returns status, attempts, timestamps, payload, result, and error.",
      inputSchema: {
        operationId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Job ID returned by operations_list or another tool, e.g. "job_123".'
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
          if (!job) throw new Error("Operation not found")
          return jobOperation(job)
        })
      )
  )
}

function registerPublishingTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  const owned = <T>(task: () => T) => ownedMcpTask(ownerId, task)

  server.registerTool(
    "lumenclip_accounts_list",
    {
      title: "List connected publishing accounts",
      description:
        "Reads safe connected-account metadata and the publishing capabilities exposed by the current publishing bridge. Returns account IDs, provider/profile metadata, and capabilities; credentials are never returned.",
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
          const accounts = (await services.listAccounts(ownerId))
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
        "Uploads a ready caller-owned rendered slideshow and creates a publication for explicitly selected connected accounts. Requires literal confirmation and suppresses duplicate successful publications per output/account.",
      inputSchema: {
        outputId: z
          .string()
          .trim()
          .min(1)
          .describe(
            'Ready output ID returned by outputs_list, e.g. "slideshow-123".'
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
            "Optional caption override. Omit to use the output's saved caption and hashtags."
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
      return mcpResult(
        await owned(() => publishOutput(services, ownerId, input))
      )
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
            'Output ID to mark as manually published, e.g. "slideshow-123".'
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
      return mcpResult(
        await owned(() => markOutputPublished(services, ownerId, input))
      )
    }
  )
}

type OutputPublicationState =
  | "not_published"
  | "draft"
  | "scheduled"
  | "published"
  | "published_unlinked"
  | "failed"

function outputSummary(
  slideshow: SlideshowRecord,
  publications: PostFastPostRecord[],
  ownerId: string
) {
  const related = publications.filter((publication) =>
    isPostLinkedToSlideshow(publication, { slideshowId: slideshow.id })
  )
  const preview = clean(slideshow.thumbnail_url ?? slideshow.output_images[0])
  return {
    id: slideshow.id,
    outputType: "slideshow" as const,
    status:
      slideshow.status === "failed" ? ("failed" as const) : ("ready" as const),
    publicationState: publicationState(related),
    title: slideshow.title,
    slideCount: slideshow.images.length,
    previewUri: preview ? absoluteAssetUrl(preview) : undefined,
    ...slideshowDeliveryFields(ownerId, slideshow.id),
    createdAt: slideshow.created_at,
    resourceUri: `lumenclip://outputs/${encodeURIComponent(slideshow.id)}`,
  }
}

function publicationState(
  publications: PostFastPostRecord[]
): OutputPublicationState {
  const published = publications.find((item) => item.status === "published")
  if (published) {
    return resolvedPublicationLinkState(published).state === "unlinked"
      ? "published_unlinked"
      : "published"
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

async function findSlideshow(
  services: Pick<LumenClipMcpServices, "listSlideshowRecords">,
  outputId: string
) {
  const [slideshow] = await services.listSlideshowRecords({
    id: outputId,
    limit: 1,
  })
  return slideshow ?? null
}

async function deleteOutput(
  services: LumenClipMcpServices,
  input: { outputId: string; requestId: string }
) {
  const slideshow = await findSlideshow(services, input.outputId)
  if (!slideshow) throw new Error("Output not found")
  const publications = await readMcpPublications(
    services,
    "output_deletion_guard",
    { sourceIds: [slideshow.id] }
  )
  const blocked = slideshowDeletionBlockReason({
    slideshowStatus: slideshow.status,
    slideshowId: slideshow.id,
    posts: publications,
  })
  if (blocked === "published" || blocked === "scheduled") {
    throw new Error(`${capitalize(blocked)} outputs cannot be deleted`)
  }
  await services.deleteSlideshowRecord({ id: slideshow.id })
  await services.deletePostFastPostRecords({
    sourceType: "slideshow",
    sourceIds: [slideshow.id],
  })
  return {
    requestId: input.requestId,
    outputId: slideshow.id,
    outputType: "slideshow",
    deleted: true,
    recoverable: false,
  }
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

async function getPublishableSlideshow(
  services: LumenClipMcpServices,
  outputId: string
) {
  const slideshow = await findSlideshow(services, outputId)
  if (!slideshow) throw new Error("Output not found")
  if (slideshow.status !== "exported" || !slideshow.output_images.length) {
    throw new Error("Output is not ready to publish")
  }
  const content = [slideshow.caption || slideshow.title, slideshow.hashtags]
    .map(clean)
    .filter(Boolean)
    .join("\n\n")
  return {
    slideshow,
    content: content || "Slideshow",
    mediaUrls: slideshow.output_images,
  }
}

async function publishOutput(
  services: LumenClipMcpServices,
  ownerId: string,
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
  const output = await getPublishableSlideshow(services, input.outputId)
  const warnings: string[] = []
  const [accounts, existingPublications] = await Promise.all([
    services.listAccounts(ownerId),
    readMcpPublications(services, "output_publish_lookup", {
      sourceIds: [output.slideshow.id],
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
          isPostLinkedToSlideshow(publication, {
            slideshowId: output.slideshow.id,
          }) &&
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
      sourceType: "slideshow",
      sourceId: output.slideshow.id,
    })
    records.push(result.record)
    if (!result.ok) failed += 1
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
      id: output.slideshow.id,
      outputType: "slideshow",
      resourceUri: `lumenclip://outputs/${encodeURIComponent(output.slideshow.id)}`,
    },
    published: records.filter((record) => record.status === "published").length,
    scheduled: records.filter((record) => record.status === "scheduled").length,
    failed,
    reused,
    publications: records.map(publicationSummary),
    warnings,
  }
}

async function markOutputPublished(
  services: LumenClipMcpServices,
  ownerId: string,
  input: {
    outputId: string
    platform: string
    publishedUrl: string
    publishedAt: string
    accountId?: string
    requestId: string
  }
) {
  const output = await getPublishableSlideshow(services, input.outputId)
  const platform = normalizeProvider(input.platform)
  if (!platform) throw new Error("A valid platform is required")
  const publishedAt = new Date(input.publishedAt)
  if (!Number.isFinite(publishedAt.getTime())) {
    throw new Error("publishedAt must be a valid datetime")
  }
  let account: PostFastSocialIntegration | undefined
  if (input.accountId) {
    account = (await services.listAccounts(ownerId)).find(
      (candidate) => candidate.integration_id === input.accountId
    )
    if (!account) throw new Error("Publishing account not found")
    if (normalizeProvider(account.provider) !== platform) {
      throw new Error("The selected account does not match the platform")
    }
  }

  const publication = await services.linkPublishedOutput({
    sourceType: "slideshow",
    sourceId: output.slideshow.id,
    integrationId: account?.integration_id ?? `manual-${platform}`,
    provider: account?.provider ?? platform,
    releaseUrl: input.publishedUrl,
    publishedAt: publishedAt.toISOString(),
    content: output.content,
    media: [],
  })

  return {
    requestId: input.requestId,
    output: {
      id: output.slideshow.id,
      outputType: "slideshow",
      publicationState: "published",
      resourceUri: `lumenclip://outputs/${encodeURIComponent(output.slideshow.id)}`,
    },
    publication: publicationSummary(publication),
  }
}

function jobOperation(job: Job) {
  return {
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
    resourceUri: `lumenclip://operations/${encodeURIComponent(job.id)}`,
  }
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
      schedule: true,
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

function slideshowDeliveryFields(ownerId: string, outputId: string) {
  if (!ownerId || !outputId) return {}
  const delivery = slideshowDeliveryLinks({ ownerId, outputId })
  return delivery
    ? {
        previewUrl: delivery.previewUrl,
        downloadUrl: delivery.downloadUrl,
      }
    : {}
}

function buildCalendarLifecycleItems(input: {
  jobs: Job[]
  publications: PostFastPostRecord[]
  remote: unknown
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
    const datetime = clean(job.availableAt || job.createdAt)
    if (!inRange(datetime)) return []
    const status =
      job.status === "failed" || job.status === "dead"
        ? ("render_failed" as const)
        : job.status === "queued" || job.status === "processing"
          ? ("rendering" as const)
          : null
    if (!status) return []
    return [
      {
        id: `job:${job.id}`,
        status,
        sourceStatus: job.status,
        datetime,
        source: "job" as const,
        sourceType: job.type,
        sourceId: job.id,
        title:
          status === "render_failed" ? "Background job failed" : "Job queued",
        error: job.error,
        timestamps: {
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        },
      },
    ]
  })
  const publicationItems = input.publications.flatMap((publication) => {
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
  const remoteItems = remotePosts.flatMap((value: unknown, index: number) => {
    const post = isRecord(value) ? value : {}
    const status = calendarStatusForRemotePost(clean(post.status))
    if (!status) return []
    const id = clean(post.id)
    const local = id ? localByRemoteId.get(id) : undefined
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
        localId: local?.id,
        status,
        sourceStatus: clean(post.status),
        datetime,
        slot: scheduledAt || undefined,
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
    remoteItems.flatMap((item) => (item.localId ? [item.localId] : []))
  )
  const dedupedPublicationItems = publicationItems.filter(
    (item) => !remoteLocalIds.has(item.id.replace(/^publication:/, ""))
  )
  const items = [
    ...jobItems,
    ...dedupedPublicationItems,
    ...remoteItems.map(({ localId, ...item }) => {
      void localId
      return item
    }),
  ]
    .sort((left, right) => left.datetime.localeCompare(right.datetime))
    .slice(0, input.limit)
  return {
    items,
    summary: Object.fromEntries(
      [
        "rendering",
        "render_failed",
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
