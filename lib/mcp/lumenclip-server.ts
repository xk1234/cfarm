import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import { listAssetRecords } from "@/lib/assets"
import { toLumenClipDataError } from "@/lib/data-store-errors"
import { clean } from "@/lib/guards"
import {
  deleteImageCollections,
  importRemoteImagesToCollection,
  listImageCollections,
  upsertImageCollection,
  type StoredImageCollection,
} from "@/lib/image-collections"
import {
  collectionMatchesId,
  storedToCollection,
} from "@/lib/realfarm-collections"

/**
 * MCP server for one workspace. Every service takes the workspace id
 * explicitly; there is no ambient owner context.
 *
 * Output, scheduling and publishing tools were removed with the PostFast and
 * Railway data layers; the API/MCP owner re-adds them on renders, posts and
 * SocialBu.
 */
export type LumenClipMcpServices = {
  now: () => Date
  listImageCollections: typeof listImageCollections
  deleteImageCollections: typeof deleteImageCollections
  upsertImageCollection: typeof upsertImageCollection
  importRemoteImagesToCollection: typeof importRemoteImagesToCollection
  listAssetRecords: typeof listAssetRecords
}

const defaultServices: LumenClipMcpServices = {
  now: () => new Date(),
  listImageCollections,
  deleteImageCollections,
  upsertImageCollection,
  importRemoteImagesToCollection,
  listAssetRecords,
}

export function createLumenClipMcpServer(
  ownerId: string,
  overrides: Partial<LumenClipMcpServices> = {},
  options: { disabledToolNames?: Iterable<string> } = {}
) {
  const services = { ...defaultServices, ...overrides }
  const server = new McpServer({
    name: "lumenclip",
    version: "4.0.0",
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

  registerCollectionTools(server, ownerId, services)

  return server
}

function registerCollectionTools(
  server: McpServer,
  ownerId: string,
  services: LumenClipMcpServices
) {
  const owned = <T>(task: () => Promise<T>) => ownedMcpTask(task)

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
          const items = (await services.listImageCollections(ownerId))
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
          const records = await services.listAssetRecords(ownerId, {
            kind: input.kind,
          })
          const query = clean(input.query).toLowerCase()
          const items = records
            .map((asset) => ({ recordType: "asset_record" as const, ...asset }))
            .filter(
              (asset) =>
                !query ||
                `${asset.name} ${asset.caption}`.toLowerCase().includes(query)
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
          const collections = await services.listImageCollections(ownerId)
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
              "Renaming media collections is not supported by this tool"
            )
          }
          const created = !existing
          const saved = await services.upsertImageCollection(
            ownerId,
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
          const collections = await services.listImageCollections(ownerId)
          const collection = findMediaCollection(
            collections,
            input.collectionId
          )
          if (!collection) throw new Error("Media collection not found")
          const before = collection.images.length
          const result = await services.importRemoteImagesToCollection(ownerId, {
            collectionName: collection.name,
            collectionCreatedAt: collection.created_at,
            mediaType: collection.mediaType,
            images: input.assets.map((asset) => ({
              url: asset.httpsUrl,
              caption: asset.caption,
              sourceUrl: asset.sourceUrl,
            })),
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
          const collections = await services.listImageCollections(ownerId, {
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
          const deleted = await services.deleteImageCollections(ownerId, [
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


function mediaCollectionSummary(collection: StoredImageCollection) {
  const normalized = storedToCollection(collection)
  const captioned = collection.images.filter((image) =>
    clean(image.caption)
  ).length
  return {
    id: collection.id ?? normalized.id,
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
    collections.find((collection) => collection.id === requested) ??
    collections.find((collection) =>
      collectionMatchesId(storedToCollection(collection), requested)
    ) ??
    collections.find(
      (collection) => collection.name.toLowerCase() === requested.toLowerCase()
    ) ??
    null
  )
}

function mcpResult(value: Record<string, unknown> | unknown[]) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: Array.isArray(value) ? { items: value } : value,
  }
}

async function ownedMcpTask<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (error) {
    throw toLumenClipDataError(error)
  }
}
