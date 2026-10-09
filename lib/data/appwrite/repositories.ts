/**
 * Appwrite Cloud implementation of the repository contracts
 * (docs/refactor/03-appwrite-data-layer.md §3–§6). Behaviour mirrors
 * lib/data/memory.ts, which is the reference implementation.
 *
 * Atomicity without compare-and-set:
 * - idempotent creates use deterministic row ids (a 409 returns the winner),
 * - job claims create lease rows `<jobId>.<attempt>` (a 409 means another
 *   worker won),
 * - collection names and API key hashes are unique indexes.
 */
import { Query } from "node-appwrite"
import { InputFile } from "node-appwrite/file"
import type { Models } from "node-appwrite"

import { SlideshowSpecSchema, canvasSize } from "@/lib/render/spec"
import type { ResolvedSpec, SlideshowSpec, SlotValues, SpecIssue } from "@/lib/render/spec"

import { generateApiKey, hashApiKey, leaseId as rawLeaseId, newId, sha256Hex, deterministicJobId } from "../crypto"
import { signedFileUrl } from "../file-tokens"
import {
  DataConflictError,
  DataNotFoundError,
  type ApiKeysRepository,
  type BlobStorage,
  type CollectionsRepository,
  type JobLeasesRepository,
  type JobsRepository,
  type MediaRepository,
  type NotificationsRepository,
  type PostsRepository,
  type RendersRepository,
  type Repositories,
  type SettingsRepository,
  type TemplatesRepository,
} from "../repositories"
import {
  API_KEY_SCOPES,
  DEFAULT_JOB_MAX_ATTEMPTS,
  JOB_LEASE_EXHAUSTED_ERROR,
  DEFAULT_PAGE_SIZE,
  DEFAULT_WORKSPACE_SETTINGS,
  JobPayloadSchemas,
  MAX_PAGE_SIZE,
  RenderOutputSchema,
  type ApiKey,
  type ApiKeyScope,
  type BucketId,
  type Collection,
  type Job,
  type JobLease,
  type JobType,
  type Media,
  type MediaKind,
  type MediaSource,
  type Notification,
  type NotificationEvent,
  type NotificationStatus,
  type Page,
  type PageQuery,
  type Post,
  type PostPatch,
  type PostStatus,
  type Render,
  type RenderSource,
  type RenderStatus,
  type RenderSummary,
  type Template,
  type TemplateSummary,
  type WorkspaceSettings,
} from "../types"
import { createAppwriteClients, type StorageApi, type TablesApi } from "./client"
import { DataIntegrityError, isConflict, isNotFound, toDataError } from "./errors"
import { TABLES, appwriteIdsFromEnv } from "./schema.mjs"

export type AppwriteRepositoryOptions = {
  tables?: TablesApi
  storage?: StorageApi
  databaseId?: string
  /** Logical → physical bucket ids. */
  buckets?: Partial<Record<BucketId, string>>
  /** Injectable clock (tests). */
  now?: () => Date
  /** Base URL + secret for signed file URLs. */
  signedUrls?: { baseUrl?: string; secret?: string }
}

type Row = Models.DefaultRow & Record<string, unknown>

const PURGE_AFTER_MS = 30 * 24 * 3600 * 1000
const ID_MAX = 36
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/
const LIST_ALL_CAP = 5_000

// ───────────────────────────── helpers ─────────────────────────────

const isoOrNull = (v: unknown): string | null =>
  typeof v === "string" && v ? new Date(v).toISOString() : null
const iso = (v: unknown): string => isoOrNull(v) ?? new Date(0).toISOString()
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null)
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
}

/** 20-char deterministic id (same length as `newId()`). */
function deterministicId(prefix: string, ...parts: string[]): string {
  return prefix + sha256Hex(parts.join("\u0000")).slice(0, 19)
}

function parseJson(table: string, row: Row, column: string): unknown {
  const raw = row[column]
  if (raw == null || raw === "") return null
  if (typeof raw !== "string") throw new DataIntegrityError(table, row.$id, `${column} is not a JSON string`)
  try {
    return JSON.parse(raw)
  } catch {
    throw new DataIntegrityError(table, row.$id, `${column} is not valid JSON`)
  }
}

function jsonArray<T>(table: string, row: Row, column: string, fallback: T[] = []): T[] {
  const v = parseJson(table, row, column)
  if (v == null) return fallback
  if (!Array.isArray(v)) throw new DataIntegrityError(table, row.$id, `${column} is not an array`)
  return v as T[]
}

function jsonObject<T extends object>(table: string, row: Row, column: string, fallback: T): T {
  const v = parseJson(table, row, column)
  if (v == null) return fallback
  if (typeof v !== "object" || Array.isArray(v)) throw new DataIntegrityError(table, row.$id, `${column} is not an object`)
  return v as T
}

function aspectRatioOf(spec: SlideshowSpec): string {
  if (spec.canvas.preset) return spec.canvas.preset
  const size = canvasSize(spec.canvas)
  return size ? `${size.width}x${size.height}` : "unknown"
}

function imageSlotCount(spec: SlideshowSpec): number {
  let n = 0
  for (const def of Object.values(spec.slots ?? {})) {
    if (def.type === "image") n++
    if (def.type === "list") n += Object.values(def.item).filter((d) => d.type === "image").length
  }
  return n
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/zip": "zip",
}

/** Appwrite file name: `<workspaceId>~<fileId>.<ext>` (ownership + allowed extension). */
export function storedFileName(workspaceId: string, fileId: string, mime: string): string {
  const ext = EXT_BY_MIME[mime.toLowerCase()] ?? "bin"
  return `${workspaceId}~${fileId}.${ext}`
}

function ownsFile(workspaceId: string, name: string): boolean {
  return name.startsWith(`${workspaceId}~`)
}

/** Lease row id: `<jobId>.<attempt>`, hashed when it would exceed 36 chars. */
export function leaseRowId(jobId: string, attempt: number): string {
  const raw = rawLeaseId(jobId, attempt)
  return raw.length <= ID_MAX && ID_RE.test(raw) ? raw : "l" + sha256Hex(raw).slice(0, 35)
}

// ───────────────────────────── factory ─────────────────────────────

export function createAppwriteRepositories(options: AppwriteRepositoryOptions = {}): Repositories {
  const ids = appwriteIdsFromEnv()
  const clients =
    options.tables && options.storage
      ? { tables: options.tables, storage: options.storage }
      : createAppwriteClients()
  const tables = options.tables ?? clients.tables
  const storage = options.storage ?? clients.storage
  const databaseId = options.databaseId ?? ids.databaseId
  const bucketIds: Record<BucketId, string> = { ...ids.buckets, ...options.buckets }
  const now = () => (options.now ? options.now() : new Date())
  const nowIso = () => now().toISOString()
  const purgeAfter = () => new Date(now().getTime() + PURGE_AFTER_MS).toISOString()

  // ─── low-level row access (errors normalised) ───
  async function call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      throw toDataError(error)
    }
  }
  const getRow = async (tableId: string, rowId: string): Promise<Row | null> => {
    if (!ID_RE.test(rowId)) return null
    try {
      return (await tables.getRow({ databaseId, tableId, rowId })) as Row
    } catch (error) {
      if (isNotFound(error)) return null
      throw toDataError(error)
    }
  }
  const createRow = (tableId: string, rowId: string, data: Record<string, unknown>) =>
    tables.createRow({ databaseId, tableId, rowId, data }) as Promise<Row>
  const updateRow = (tableId: string, rowId: string, data: Record<string, unknown>) =>
    call(() => tables.updateRow({ databaseId, tableId, rowId, data }) as Promise<Row>)
  const listRows = (tableId: string, queries: string[], total = false) =>
    call(() => tables.listRows({ databaseId, tableId, queries, total })) as Promise<{ total: number; rows: Row[] }>

  /** Cursor page: fetch limit+1 to know whether there is a next page. */
  async function pageRows(tableId: string, queries: string[], query: PageQuery | undefined): Promise<Page<Row>> {
    const limit = clampLimit(query?.limit)
    const q = [...queries, Query.limit(limit + 1)]
    if (query?.cursor) q.push(Query.cursorAfter(query.cursor))
    const { rows } = await listRows(tableId, q)
    const items = rows.slice(0, limit)
    return { items, nextCursor: rows.length > limit ? (items.at(-1)?.$id ?? null) : null }
  }

  /** Every row matching `queries` (bounded), following cursors. */
  async function allRows(tableId: string, queries: string[], cap = LIST_ALL_CAP): Promise<Row[]> {
    const out: Row[] = []
    let cursor: string | null = null
    for (;;) {
      const q = [...queries, Query.limit(MAX_PAGE_SIZE)]
      if (cursor) q.push(Query.cursorAfter(cursor))
      const { rows } = await listRows(tableId, q)
      out.push(...rows)
      if (rows.length < MAX_PAGE_SIZE || out.length >= cap) return out.slice(0, cap)
      cursor = rows.at(-1)!.$id
    }
  }

  async function countRows(tableId: string, queries: string[]): Promise<number> {
    const { total } = await listRows(tableId, [...queries, Query.limit(1)], true)
    return total
  }

  async function ownedRow(tableId: string, workspaceId: string | null, id: string): Promise<Row | null> {
    const row = await getRow(tableId, id)
    if (!row) return null
    return (row.workspace_id ?? null) === workspaceId ? row : null
  }
  async function mustOwnRow(tableId: string, entity: string, workspaceId: string | null, id: string): Promise<Row> {
    const row = await ownedRow(tableId, workspaceId, id)
    if (!row) throw new DataNotFoundError(entity, id)
    return row
  }

  /** createRow with a fixed id; on 409 returns the existing row instead. */
  async function createOrGet(tableId: string, rowId: string, data: Record<string, unknown>) {
    try {
      return { row: await createRow(tableId, rowId, data), created: true }
    } catch (error) {
      if (!isConflict(error)) throw toDataError(error)
      const existing = await getRow(tableId, rowId)
      if (!existing) throw toDataError(error)
      return { row: existing, created: false }
    }
  }

  // ─── templates (`specs`) ───
  const T = TABLES.templates
  const TEMPLATE_SUMMARY_COLUMNS = [
    "workspace_id",
    "name",
    "spec_version",
    "aspect_ratio",
    "slide_count",
    "image_slot_count",
    "thumbnail_file_id",
    "created_by",
    "archived_at",
  ]
  function toTemplateSummary(row: Row): TemplateSummary {
    return {
      id: row.$id,
      workspaceId: String(row.workspace_id),
      name: String(row.name),
      specVersion: 1,
      aspectRatio: String(row.aspect_ratio),
      slideCount: Number(row.slide_count),
      imageSlotCount: Number(row.image_slot_count),
      thumbnailFileId: strOrNull(row.thumbnail_file_id),
      createdBy: String(row.created_by),
      createdAt: iso(row.$createdAt),
      updatedAt: iso(row.$updatedAt),
      archivedAt: isoOrNull(row.archived_at),
    }
  }
  function toTemplate(row: Row): Template {
    const raw = parseJson(T, row, "spec")
    const parsed = SlideshowSpecSchema.safeParse(raw)
    if (!parsed.success) throw new DataIntegrityError(T, row.$id, "spec does not match the spec schema")
    return { ...toTemplateSummary(row), spec: raw as SlideshowSpec }
  }
  const specColumns = (spec: SlideshowSpec) => ({
    spec: JSON.stringify(spec),
    spec_version: 1,
    aspect_ratio: aspectRatioOf(spec),
    slide_count: spec.slides.length,
    image_slot_count: imageSlotCount(spec),
  })

  const templatesRepo: TemplatesRepository = {
    async list(workspaceId, query) {
      const q = [Query.equal("workspace_id", workspaceId), Query.orderDesc("$updatedAt"), Query.select(TEMPLATE_SUMMARY_COLUMNS)]
      if (!query?.includeArchived) q.push(Query.isNull("archived_at"))
      const page = await pageRows(T, q, query)
      return { items: page.items.map(toTemplateSummary), nextCursor: page.nextCursor }
    },
    async get(workspaceId, id) {
      const row = await ownedRow(T, workspaceId, id)
      return row ? toTemplate(row) : null
    },
    async create(workspaceId, input) {
      const row = await call(() =>
        createRow(T, newId(), {
          workspace_id: workspaceId,
          name: input.name,
          ...specColumns(input.spec),
          thumbnail_file_id: input.thumbnailFileId ?? null,
          created_by: input.createdBy,
          archived_at: null,
        })
      )
      return toTemplate(row)
    },
    async update(workspaceId, id, patch) {
      await mustOwnRow(T, "template", workspaceId, id)
      const data: Record<string, unknown> = {}
      if (patch.name !== undefined) data.name = patch.name
      if (patch.thumbnailFileId !== undefined) data.thumbnail_file_id = patch.thumbnailFileId
      if (patch.spec !== undefined) Object.assign(data, specColumns(patch.spec))
      return toTemplate(await updateRow(T, id, data))
    },
    async archive(workspaceId, id) {
      await mustOwnRow(T, "template", workspaceId, id)
      await updateRow(T, id, { archived_at: nowIso() })
    },
  }

  // ─── renders ───
  const R = TABLES.renders
  const RENDER_SUMMARY_COLUMNS = [
    "workspace_id",
    "template_id",
    "status",
    "source",
    "api_key_id",
    "idempotency_key",
    "title",
    "format",
    "scale",
    "slide_count",
    "width",
    "height",
    "output",
    "warnings",
    "error",
    "job_id",
    "render_hash",
    "created_by",
    "completed_at",
    "deleted_at",
  ]
  function toRenderSummary(row: Row): RenderSummary {
    const output = parseJson(R, row, "output")
    let parsedOutput: Render["output"] = null
    if (output != null) {
      const res = RenderOutputSchema.safeParse(output)
      if (!res.success) throw new DataIntegrityError(R, row.$id, "output does not match RenderOutput")
      parsedOutput = output as Render["output"]
    }
    return {
      id: row.$id,
      workspaceId: String(row.workspace_id),
      templateId: strOrNull(row.template_id),
      status: String(row.status) as RenderStatus,
      source: String(row.source) as RenderSource,
      apiKeyId: strOrNull(row.api_key_id),
      idempotencyKey: strOrNull(row.idempotency_key),
      title: strOrNull(row.title),
      format: String(row.format) as Render["format"],
      scale: Number(row.scale),
      slideCount: Number(row.slide_count),
      width: Number(row.width),
      height: Number(row.height),
      output: parsedOutput,
      warnings: jsonArray<SpecIssue>(R, row, "warnings"),
      error: strOrNull(row.error),
      jobId: strOrNull(row.job_id),
      renderHash: strOrNull(row.render_hash),
      createdBy: String(row.created_by),
      createdAt: iso(row.$createdAt),
      updatedAt: iso(row.$updatedAt),
      completedAt: isoOrNull(row.completed_at),
      deletedAt: isoOrNull(row.deleted_at),
    }
  }
  function toRender(row: Row): Render {
    const spec = parseJson(R, row, "spec")
    if (!spec || typeof spec !== "object" || !Array.isArray((spec as ResolvedSpec).slides)) {
      throw new DataIntegrityError(R, row.$id, "spec is not a resolved spec")
    }
    const slotValues = parseJson(R, row, "slot_values")
    return {
      ...toRenderSummary(row),
      spec: spec as ResolvedSpec,
      slotValues: (slotValues ?? null) as SlotValues | null,
    }
  }

  const rendersRepo: RendersRepository = {
    async create(workspaceId, input) {
      const rowId = input.idempotencyKey ? deterministicId("r", workspaceId, input.idempotencyKey) : newId()
      const data = {
        workspace_id: workspaceId,
        template_id: input.templateId ?? null,
        slot_values: input.slotValues ? JSON.stringify(input.slotValues) : null,
        spec: JSON.stringify(input.spec),
        status: input.status ?? "queued",
        source: input.source,
        api_key_id: input.apiKeyId ?? null,
        idempotency_key: input.idempotencyKey ?? null,
        title: input.title ?? null,
        format: input.format ?? "png",
        scale: input.scale ?? 1,
        slide_count: input.spec.slides.length,
        width: input.spec.canvas.width,
        height: input.spec.canvas.height,
        output: null,
        warnings: "[]",
        error: null,
        job_id: null,
        render_hash: input.renderHash ?? null,
        created_by: input.createdBy,
        completed_at: null,
        deleted_at: null,
        purge_after: null,
      }
      const { row, created } = await createOrGet(R, rowId, data)
      return { value: toRender(row), created }
    },
    async get(workspaceId, id) {
      const row = await ownedRow(R, workspaceId, id)
      return row && !row.deleted_at ? toRender(row) : null
    },
    async list(workspaceId, query) {
      const q = [
        Query.equal("workspace_id", workspaceId),
        Query.isNull("deleted_at"),
        Query.orderDesc("$createdAt"),
        Query.select(RENDER_SUMMARY_COLUMNS),
      ]
      if (query?.status) q.push(Query.equal("status", query.status))
      if (query?.templateId) q.push(Query.equal("template_id", query.templateId))
      const page = await pageRows(R, q, query)
      return { items: page.items.map(toRenderSummary), nextCursor: page.nextCursor }
    },
    async markRendering(workspaceId, id, jobId) {
      await mustOwnRow(R, "render", workspaceId, id)
      const data: Record<string, unknown> = { status: "rendering" }
      if (jobId !== undefined) data.job_id = jobId
      return toRender(await updateRow(R, id, data))
    },
    async markSucceeded(workspaceId, id, output, warnings = []) {
      await mustOwnRow(R, "render", workspaceId, id)
      return toRender(
        await updateRow(R, id, {
          status: "succeeded",
          output: JSON.stringify(output),
          warnings: JSON.stringify(warnings),
          error: null,
          completed_at: nowIso(),
        })
      )
    },
    async markFailed(workspaceId, id, error) {
      await mustOwnRow(R, "render", workspaceId, id)
      return toRender(await updateRow(R, id, { status: "failed", error, completed_at: nowIso() }))
    },
    async softDelete(workspaceId, id) {
      await mustOwnRow(R, "render", workspaceId, id)
      await updateRow(R, id, { deleted_at: nowIso(), purge_after: purgeAfter() })
    },
  }

  // ─── collections ───
  const C = TABLES.collections
  function toCollection(row: Row): Collection {
    return {
      id: row.$id,
      workspaceId: String(row.workspace_id),
      name: String(row.name),
      mediaKind: (row.media_kind === "video" ? "video" : "image") as MediaKind,
      pinned: row.pinned === true,
      itemCount: numOrNull(row.item_count) ?? 0,
      coverMediaId: strOrNull(row.cover_media_id),
      createdBy: String(row.created_by),
      createdAt: iso(row.$createdAt),
      updatedAt: iso(row.$updatedAt),
      deletedAt: isoOrNull(row.deleted_at),
      purgeAfter: isoOrNull(row.purge_after),
    }
  }
  const nameConflict = (name: string) =>
    new DataConflictError("collection", `A collection named "${name}" already exists.`)

  const collectionsRepo: CollectionsRepository = {
    async list(workspaceId, query) {
      const q = [Query.equal("workspace_id", workspaceId), Query.orderDesc("pinned"), Query.orderDesc("$updatedAt")]
      if (!query?.includeDeleted) q.push(Query.isNull("deleted_at"))
      const page = await pageRows(C, q, query)
      return { items: page.items.map(toCollection), nextCursor: page.nextCursor }
    },
    async get(workspaceId, id) {
      const row = await ownedRow(C, workspaceId, id)
      return row ? toCollection(row) : null
    },
    async getByName(workspaceId, name) {
      const { rows } = await listRows(C, [Query.equal("workspace_id", workspaceId), Query.equal("name", name), Query.limit(1)])
      return rows[0] ? toCollection(rows[0]) : null
    },
    async create(workspaceId, input) {
      try {
        const row = await createRow(C, newId(), {
          workspace_id: workspaceId,
          name: input.name,
          media_kind: input.mediaKind ?? "image",
          pinned: false,
          item_count: 0,
          cover_media_id: null,
          created_by: input.createdBy,
          deleted_at: null,
          purge_after: null,
        })
        return toCollection(row)
      } catch (error) {
        if (isConflict(error)) throw nameConflict(input.name)
        throw toDataError(error)
      }
    },
    async rename(workspaceId, id, name) {
      await mustOwnRow(C, "collection", workspaceId, id)
      try {
        return toCollection(await tables.updateRow({ databaseId, tableId: C, rowId: id, data: { name } }) as Row)
      } catch (error) {
        if (isConflict(error)) throw nameConflict(name)
        throw toDataError(error)
      }
    },
    async setPinned(workspaceId, id, pinned) {
      await mustOwnRow(C, "collection", workspaceId, id)
      return toCollection(await updateRow(C, id, { pinned }))
    },
    async setCover(workspaceId, id, mediaId) {
      await mustOwnRow(C, "collection", workspaceId, id)
      return toCollection(await updateRow(C, id, { cover_media_id: mediaId }))
    },
    async softDelete(workspaceId, id) {
      await mustOwnRow(C, "collection", workspaceId, id)
      await updateRow(C, id, { deleted_at: nowIso(), purge_after: purgeAfter() })
    },
    async restore(workspaceId, id) {
      await mustOwnRow(C, "collection", workspaceId, id)
      return toCollection(await updateRow(C, id, { deleted_at: null, purge_after: null }))
    },
  }

  // ─── media ───
  const M = TABLES.media
  function toMedia(row: Row): Media {
    return {
      id: row.$id,
      workspaceId: String(row.workspace_id),
      collectionId: strOrNull(row.collection_id),
      kind: (row.kind === "video" ? "video" : "image") as MediaKind,
      bucketId: "media",
      fileId: String(row.file_id),
      mimeType: String(row.mime_type),
      sizeBytes: Number(row.size_bytes),
      width: numOrNull(row.width),
      height: numOrNull(row.height),
      sha256: String(row.sha256),
      name: strOrNull(row.name),
      caption: strOrNull(row.caption),
      source: String(row.source) as MediaSource,
      sourceUrl: strOrNull(row.source_url),
      attribution: strOrNull(row.attribution),
      position: numOrNull(row.position),
      createdBy: String(row.created_by),
      createdAt: iso(row.$createdAt),
      deletedAt: isoOrNull(row.deleted_at),
      purgeAfter: isoOrNull(row.purge_after),
    }
  }
  const collectionEq = (collectionId: string | null) =>
    collectionId === null ? Query.isNull("collection_id") : Query.equal("collection_id", collectionId)
  const liveInCollectionQueries = (workspaceId: string, collectionId: string) => [
    Query.equal("workspace_id", workspaceId),
    Query.equal("collection_id", collectionId),
    Query.isNull("deleted_at"),
  ]
  async function refreshCount(workspaceId: string, collectionId: string | null) {
    if (!collectionId) return
    const c = await ownedRow(C, workspaceId, collectionId)
    if (!c) return
    const count = await countRows(M, liveInCollectionQueries(workspaceId, collectionId))
    await updateRow(C, collectionId, { item_count: count })
  }
  async function nextPosition(workspaceId: string, collectionId: string): Promise<number> {
    const { rows } = await listRows(M, [
      ...liveInCollectionQueries(workspaceId, collectionId),
      Query.isNotNull("position"),
      Query.orderDesc("position"),
      Query.select(["position"]),
      Query.limit(1),
    ])
    const top = numOrNull(rows[0]?.position)
    return top === null ? 0 : top + 1
  }

  const mediaRepo: MediaRepository = {
    async create(workspaceId, input) {
      const collectionId = input.collectionId ?? null
      if (collectionId) await mustOwnRow(C, "collection", workspaceId, collectionId)
      const { rows: dups } = await listRows(M, [
        Query.equal("workspace_id", workspaceId),
        collectionEq(collectionId),
        Query.equal("sha256", input.sha256),
        Query.isNull("deleted_at"),
        Query.orderAsc("$createdAt"),
        Query.limit(1),
      ])
      if (dups[0]) return { value: toMedia(dups[0]), created: false }
      const position = input.position ?? (collectionId ? await nextPosition(workspaceId, collectionId) : null)
      const row = await call(() =>
        createRow(M, newId(), {
          workspace_id: workspaceId,
          collection_id: collectionId,
          kind: input.kind,
          bucket_id: "media",
          file_id: input.fileId,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          width: input.width ?? null,
          height: input.height ?? null,
          sha256: input.sha256,
          name: input.name ?? null,
          caption: input.caption ?? null,
          source: input.source,
          source_url: input.sourceUrl ?? null,
          attribution: input.attribution ?? null,
          position,
          created_by: input.createdBy,
          deleted_at: null,
          purge_after: null,
        })
      )
      await refreshCount(workspaceId, collectionId)
      return { value: toMedia(row), created: true }
    },
    async get(workspaceId, id) {
      const row = await ownedRow(M, workspaceId, id)
      return row && !row.deleted_at ? toMedia(row) : null
    },
    async getMany(workspaceId, idList) {
      const wanted = [...new Set(idList.filter((id) => ID_RE.test(id)))]
      const byId = new Map<string, Media>()
      for (let i = 0; i < wanted.length; i += MAX_PAGE_SIZE) {
        const chunk = wanted.slice(i, i + MAX_PAGE_SIZE)
        const { rows } = await listRows(M, [
          Query.equal("$id", chunk),
          Query.equal("workspace_id", workspaceId),
          Query.isNull("deleted_at"),
          Query.limit(chunk.length),
        ])
        for (const row of rows) byId.set(row.$id, toMedia(row))
      }
      return idList.map((id) => byId.get(id)).filter((m): m is Media => !!m)
    },
    async list(workspaceId, query) {
      const q = [Query.equal("workspace_id", workspaceId), Query.isNull("deleted_at")]
      if (query?.kind) q.push(Query.equal("kind", query.kind))
      if (query?.collectionId) {
        q.push(Query.equal("collection_id", query.collectionId), Query.orderAsc("position"), Query.orderAsc("$createdAt"))
      } else {
        if (query?.collectionId === null) q.push(Query.isNull("collection_id"))
        q.push(Query.orderDesc("$createdAt"))
      }
      const page = await pageRows(M, q, query)
      return { items: page.items.map(toMedia), nextCursor: page.nextCursor }
    },
    async listIdsInCollection(workspaceId, collectionId) {
      const rows = await allRows(M, [
        ...liveInCollectionQueries(workspaceId, collectionId),
        Query.orderAsc("position"),
        Query.orderAsc("$createdAt"),
        Query.select(["position"]),
      ])
      return rows.map((r) => r.$id)
    },
    async findBySha256(workspaceId, sha256) {
      const rows = await allRows(M, [
        Query.equal("workspace_id", workspaceId),
        Query.equal("sha256", sha256),
        Query.isNull("deleted_at"),
      ])
      return rows.map(toMedia)
    },
    async countByFileId(workspaceId, fileId) {
      return countRows(M, [Query.equal("workspace_id", workspaceId), Query.equal("file_id", fileId), Query.isNull("deleted_at")])
    },
    async move(workspaceId, id, collectionId, position) {
      const row = await mustOwnRow(M, "media", workspaceId, id)
      if (collectionId) await mustOwnRow(C, "collection", workspaceId, collectionId)
      const from = strOrNull(row.collection_id)
      const nextPos =
        position ?? (collectionId ? await countRows(M, liveInCollectionQueries(workspaceId, collectionId)) : null)
      const updated = await updateRow(M, id, { collection_id: collectionId, position: nextPos })
      await refreshCount(workspaceId, from)
      if (collectionId !== from) await refreshCount(workspaceId, collectionId)
      return toMedia(updated)
    },
    async softDelete(workspaceId, id) {
      const row = await mustOwnRow(M, "media", workspaceId, id)
      await updateRow(M, id, { deleted_at: nowIso(), purge_after: purgeAfter() })
      await refreshCount(workspaceId, strOrNull(row.collection_id))
    },
  }

  // ─── posts ───
  const P = TABLES.posts
  function toPost(row: Row): Post {
    return {
      id: row.$id,
      workspaceId: String(row.workspace_id),
      renderId: String(row.render_id),
      provider: String(row.provider),
      accountId: String(row.account_id),
      status: String(row.status) as PostStatus,
      publishAt: isoOrNull(row.publish_at),
      publishedAt: isoOrNull(row.published_at),
      caption: typeof row.caption === "string" ? row.caption : "",
      platformOptions: jsonObject<Record<string, unknown>>(P, row, "platform_options", {}),
      providerPostId: strOrNull(row.provider_post_id),
      externalPostId: strOrNull(row.external_post_id),
      permalink: strOrNull(row.permalink),
      error: strOrNull(row.error),
      intentKey: String(row.intent_key),
      createdBy: String(row.created_by),
      createdAt: iso(row.$createdAt),
      updatedAt: iso(row.$updatedAt),
    }
  }
  function postPatchColumns(patch: PostPatch): Record<string, unknown> {
    const data: Record<string, unknown> = {}
    if (patch.status !== undefined) data.status = patch.status
    if (patch.publishAt !== undefined) data.publish_at = patch.publishAt
    if (patch.publishedAt !== undefined) data.published_at = patch.publishedAt
    if (patch.caption !== undefined) data.caption = patch.caption
    if (patch.platformOptions !== undefined) data.platform_options = JSON.stringify(patch.platformOptions)
    if (patch.providerPostId !== undefined) data.provider_post_id = patch.providerPostId
    if (patch.externalPostId !== undefined) data.external_post_id = patch.externalPostId
    if (patch.permalink !== undefined) data.permalink = patch.permalink
    if (patch.error !== undefined) data.error = patch.error
    return data
  }
  const effectiveAt = (p: Post) => p.publishedAt ?? p.publishAt

  const postsRepo: PostsRepository = {
    async upsertIntent(workspaceId, input) {
      const { row, created } = await createOrGet(P, deterministicId("p", workspaceId, input.intentKey), {
        workspace_id: workspaceId,
        render_id: input.renderId,
        provider: input.provider,
        account_id: input.accountId,
        status: input.status ?? (input.publishAt ? "scheduled" : "draft"),
        publish_at: input.publishAt ?? null,
        published_at: null,
        caption: input.caption,
        platform_options: JSON.stringify(input.platformOptions ?? {}),
        provider_post_id: null,
        external_post_id: null,
        permalink: null,
        error: null,
        intent_key: input.intentKey,
        created_by: input.createdBy,
      })
      return { value: toPost(row), created }
    },
    async get(workspaceId, id) {
      const row = await ownedRow(P, workspaceId, id)
      return row ? toPost(row) : null
    },
    async listRange(workspaceId, { from, to }) {
      const [scheduled, published] = await Promise.all([
        allRows(P, [Query.equal("workspace_id", workspaceId), Query.greaterThanEqual("publish_at", from), Query.lessThan("publish_at", to)]),
        allRows(P, [Query.equal("workspace_id", workspaceId), Query.greaterThanEqual("published_at", from), Query.lessThan("published_at", to)]),
      ])
      const byId = new Map<string, Post>()
      for (const row of [...scheduled, ...published]) byId.set(row.$id, toPost(row))
      return [...byId.values()]
        .filter((p) => {
          const at = effectiveAt(p)
          return !!at && at >= from && at < to
        })
        .sort((a, b) => (effectiveAt(a)! < effectiveAt(b)! ? -1 : 1))
    },
    async listByRender(workspaceId, renderId) {
      const rows = await allRows(P, [
        Query.equal("workspace_id", workspaceId),
        Query.equal("render_id", renderId),
        Query.orderDesc("$createdAt"),
      ])
      return rows.map(toPost)
    },
    async update(workspaceId, id, patch) {
      await mustOwnRow(P, "post", workspaceId, id)
      return toPost(await updateRow(P, id, postPatchColumns(patch)))
    },
    async cancel(workspaceId, id) {
      await mustOwnRow(P, "post", workspaceId, id)
      return toPost(await updateRow(P, id, { status: "canceled" }))
    },
    async listDue(before, limit) {
      const { rows } = await listRows(P, [
        Query.equal("status", "scheduled"),
        Query.isNotNull("publish_at"),
        Query.lessThanEqual("publish_at", before),
        Query.orderAsc("publish_at"),
        Query.limit(clampLimit(limit)),
      ])
      return rows.map(toPost)
    },
  }

  // ─── settings ───
  const S = TABLES.settings
  const settingsRowId = (workspaceId: string) => "w" + sha256Hex(workspaceId).slice(0, 35)
  function toSettings(workspaceId: string, row: Row | null): WorkspaceSettings {
    if (!row) return structuredClone({ workspaceId, ...DEFAULT_WORKSPACE_SETTINGS })
    return {
      workspaceId,
      timezone: strOrNull(row.timezone) ?? DEFAULT_WORKSPACE_SETTINGS.timezone,
      disabledAccountIds: jsonArray<string>(S, row, "disabled_account_ids"),
      mcpDisabledTools: jsonArray<string>(S, row, "mcp_disabled_tools"),
      reminders: jsonObject(S, row, "reminders", structuredClone(DEFAULT_WORKSPACE_SETTINGS.reminders)),
      renderDefaults: jsonObject<Record<string, unknown>>(S, row, "render_defaults", {}),
      updatedAt: iso(row.$updatedAt),
    }
  }
  const settingsRepo: SettingsRepository = {
    async get(workspaceId) {
      return toSettings(workspaceId, await getRow(S, settingsRowId(workspaceId)))
    },
    async patch(workspaceId, patch) {
      const current = await settingsRepo.get(workspaceId)
      const next = { ...current, ...structuredClone(patch) }
      const row = await call(
        () =>
          tables.upsertRow({
            databaseId,
            tableId: S,
            rowId: settingsRowId(workspaceId),
            data: {
              workspace_id: workspaceId,
              timezone: next.timezone,
              disabled_account_ids: JSON.stringify(next.disabledAccountIds),
              mcp_disabled_tools: JSON.stringify(next.mcpDisabledTools),
              reminders: JSON.stringify(next.reminders),
              render_defaults: JSON.stringify(next.renderDefaults),
            },
          }) as Promise<Row>
      )
      return toSettings(workspaceId, row)
    },
  }

  // ─── notifications ───
  const N = TABLES.notifications
  function toNotification(row: Row): Notification {
    return {
      id: row.$id,
      workspaceId: String(row.workspace_id),
      event: String(row.event) as NotificationEvent,
      postId: strOrNull(row.post_id),
      renderId: strOrNull(row.render_id),
      title: String(row.title),
      body: strOrNull(row.body),
      deliverAt: iso(row.deliver_at),
      channel: "in_app",
      status: String(row.status) as NotificationStatus,
      readAt: isoOrNull(row.read_at),
      dedupeKey: String(row.dedupe_key),
      createdAt: iso(row.$createdAt),
    }
  }
  async function bulkUpdateCount(tableId: string, queries: string[], data: Record<string, unknown>): Promise<number> {
    // Bulk updateRows is capped per call; loop until nothing matches.
    let total = 0
    for (let i = 0; i < 100; i++) {
      const rows = await allRows(tableId, [...queries, Query.select(["status"])], MAX_PAGE_SIZE)
      if (rows.length === 0) return total
      const res = await call(() =>
        tables.updateRows({ databaseId, tableId, data, queries: [Query.equal("$id", rows.map((r) => r.$id))] })
      )
      total += res.rows?.length ?? rows.length
      if (rows.length < MAX_PAGE_SIZE) return total
    }
    return total
  }

  const notificationsRepo: NotificationsRepository = {
    async schedule(workspaceId, input) {
      const { row, created } = await createOrGet(N, deterministicId("n", workspaceId, input.dedupeKey), {
        workspace_id: workspaceId,
        event: input.event,
        post_id: input.postId ?? null,
        render_id: input.renderId ?? null,
        title: input.title,
        body: input.body ?? null,
        deliver_at: input.deliverAt,
        channel: "in_app",
        status: "pending",
        read_at: null,
        dedupe_key: input.dedupeKey,
      })
      return { value: toNotification(row), created }
    },
    async get(workspaceId, id) {
      const row = await ownedRow(N, workspaceId, id)
      return row ? toNotification(row) : null
    },
    async list(workspaceId, query) {
      const page = await pageRows(
        N,
        [
          Query.equal("workspace_id", workspaceId),
          Query.equal("status", query?.status ? [query.status] : ["delivered", "read"]),
          Query.orderDesc("deliver_at"),
        ],
        query
      )
      return { items: page.items.map(toNotification), nextCursor: page.nextCursor }
    },
    async unreadCount(workspaceId) {
      return countRows(N, [Query.equal("workspace_id", workspaceId), Query.equal("status", "delivered")])
    },
    async markRead(workspaceId, id) {
      await mustOwnRow(N, "notification", workspaceId, id)
      return toNotification(await updateRow(N, id, { status: "read", read_at: nowIso() }))
    },
    async markAllRead(workspaceId) {
      return bulkUpdateCount(N, [Query.equal("workspace_id", workspaceId), Query.equal("status", "delivered")], {
        status: "read",
        read_at: nowIso(),
      })
    },
    async markDelivered(workspaceId, id) {
      const row = await mustOwnRow(N, "notification", workspaceId, id)
      if (row.status !== "pending") return toNotification(row)
      return toNotification(await updateRow(N, id, { status: "delivered" }))
    },
    async cancelForPost(workspaceId, postId) {
      return bulkUpdateCount(
        N,
        [Query.equal("workspace_id", workspaceId), Query.equal("post_id", postId), Query.equal("status", "pending")],
        { status: "canceled" }
      )
    },
    async listDue(before, limit) {
      const { rows } = await listRows(N, [
        Query.equal("status", "pending"),
        Query.lessThanEqual("deliver_at", before),
        Query.orderAsc("deliver_at"),
        Query.limit(clampLimit(limit)),
      ])
      return rows.map(toNotification)
    },
  }

  // ─── API keys ───
  const K = TABLES.apiKeys
  function toApiKey(row: Row): ApiKey {
    const scopes = Array.isArray(row.scopes) ? (row.scopes as unknown[]) : []
    return {
      id: row.$id,
      workspaceId: String(row.workspace_id),
      name: String(row.name),
      prefix: String(row.prefix),
      keyHash: String(row.key_hash),
      scopes: scopes.filter((s): s is ApiKeyScope => (API_KEY_SCOPES as readonly unknown[]).includes(s)),
      createdBy: String(row.created_by),
      createdAt: iso(row.$createdAt),
      lastUsedAt: isoOrNull(row.last_used_at),
      expiresAt: isoOrNull(row.expires_at),
      revokedAt: isoOrNull(row.revoked_at),
    }
  }
  const lastTouched = new Map<string, number>()
  const apiKeysRepo: ApiKeysRepository = {
    async create(workspaceId, input) {
      const { plaintext, prefix, keyHash } = generateApiKey()
      const row = await call(() =>
        createRow(K, newId(), {
          workspace_id: workspaceId,
          name: input.name,
          prefix,
          key_hash: keyHash,
          scopes: [...input.scopes],
          created_by: input.createdBy,
          last_used_at: null,
          expires_at: input.expiresAt ?? null,
          revoked_at: null,
        })
      )
      return { apiKey: toApiKey(row), plaintext }
    },
    async list(workspaceId) {
      const rows = await allRows(K, [Query.equal("workspace_id", workspaceId), Query.orderDesc("$createdAt")])
      return rows.map(toApiKey)
    },
    async revoke(workspaceId, id) {
      const row = await mustOwnRow(K, "api key", workspaceId, id)
      if (!row.revoked_at) await updateRow(K, id, { revoked_at: nowIso() })
    },
    async resolve(plaintext, at = nowIso()) {
      const { rows } = await listRows(K, [Query.equal("key_hash", hashApiKey(plaintext)), Query.limit(1)])
      const key = rows[0] ? toApiKey(rows[0]) : null
      if (!key || key.revokedAt || (key.expiresAt && key.expiresAt <= at)) return null
      return key
    },
    async touch(workspaceId, id, at) {
      const atMs = new Date(at).getTime()
      const prev = lastTouched.get(id)
      if (prev !== undefined && atMs - prev < 60_000) return
      await mustOwnRow(K, "api key", workspaceId, id)
      await updateRow(K, id, { last_used_at: at })
      lastTouched.set(id, atMs)
    },
  }

  // ─── leases ───
  const L = TABLES.leases
  function toLease(row: Row): JobLease {
    return {
      id: row.$id,
      jobId: String(row.job_id),
      attempt: Number(row.attempt),
      workerId: String(row.worker_id),
      expiresAt: iso(row.expires_at),
      createdAt: iso(row.$createdAt),
    }
  }
  const leasesRepo: JobLeasesRepository = {
    async acquire(jobId, attempt, workerId, expiresAt) {
      try {
        await createRow(L, leaseRowId(jobId, attempt), { job_id: jobId, attempt, worker_id: workerId, expires_at: expiresAt })
        return true
      } catch (error) {
        if (isConflict(error)) return false
        throw toDataError(error)
      }
    },
    async get(jobId, attempt) {
      const row = await getRow(L, leaseRowId(jobId, attempt))
      return row ? toLease(row) : null
    },
    async release(jobId, attempt) {
      try {
        await tables.deleteRow({ databaseId, tableId: L, rowId: leaseRowId(jobId, attempt) })
      } catch (error) {
        if (isNotFound(error)) return
        throw toDataError(error)
      }
    },
    async purgeOlderThan(before) {
      let total = 0
      for (let i = 0; i < 100; i++) {
        const res = await call(() =>
          tables.deleteRows({ databaseId, tableId: L, queries: [Query.lessThan("$createdAt", before), Query.limit(MAX_PAGE_SIZE)] })
        )
        const n = res.rows?.length ?? res.total ?? 0
        total += n
        if (n < MAX_PAGE_SIZE) break
      }
      return total
    },
  }

  // ─── jobs ───
  const J = TABLES.jobs
  function toJob(row: Row): Job {
    const type = String(row.type) as JobType
    const schema = JobPayloadSchemas[type]
    if (!schema) throw new DataIntegrityError(J, row.$id, `unknown job type ${type}`)
    const payload = schema.safeParse(parseJson(J, row, "payload"))
    if (!payload.success) throw new DataIntegrityError(J, row.$id, "payload does not match its job type")
    return {
      id: row.$id,
      workspaceId: strOrNull(row.workspace_id),
      type,
      status: String(row.status) as Job["status"],
      payload: payload.data,
      result: parseJson(J, row, "result"),
      error: strOrNull(row.error),
      attempt: Number(row.attempt),
      maxAttempts: Number(row.max_attempts),
      runAt: iso(row.run_at),
      leaseExpiresAt: isoOrNull(row.lease_expires_at),
      workerId: strOrNull(row.worker_id),
      completedAt: isoOrNull(row.completed_at),
      createdAt: iso(row.$createdAt),
      updatedAt: iso(row.$updatedAt),
    } as Job
  }
  async function leasedJob(jobId: string, workerId: string): Promise<Row> {
    const row = await getRow(J, jobId)
    if (!row) throw new DataNotFoundError("job", jobId)
    if (row.status !== "running" || row.worker_id !== workerId) {
      throw new DataConflictError("job", `Job ${jobId} is not leased by ${workerId}.`)
    }
    return row
  }

  const jobsRepo: JobsRepository = {
    async enqueue(input) {
      const id = input.dedupeKey ? deterministicJobId(input.workspaceId, input.dedupeKey) : newId()
      const schema = JobPayloadSchemas[input.type]
      const payload = schema.parse(input.payload)
      const { row, created } = await createOrGet(J, id, {
        workspace_id: input.workspaceId,
        type: input.type,
        status: "queued",
        payload: JSON.stringify(payload),
        result: null,
        error: null,
        attempt: 0,
        max_attempts: input.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
        run_at: input.runAt ?? nowIso(),
        lease_expires_at: null,
        worker_id: null,
        completed_at: null,
      })
      return { value: toJob(row) as Job<typeof input.type>, created }
    },
    async get(workspaceId, id) {
      const row = await ownedRow(J, workspaceId, id)
      return row ? toJob(row) : null
    },
    async listForWorkspace(workspaceId, query) {
      const page = await pageRows(J, [Query.equal("workspace_id", workspaceId), Query.orderDesc("$createdAt")], query)
      return { items: page.items.map(toJob), nextCursor: page.nextCursor }
    },
    async claim(workerId, opts) {
      const at = opts.now ?? nowIso()
      const window = Math.min(Math.max(opts.limit * 3, 10), MAX_PAGE_SIZE)
      const typeQ = opts.types?.length ? [Query.equal("type", [...opts.types])] : []
      const [queued, stale] = await Promise.all([
        listRows(J, [Query.equal("status", "queued"), Query.lessThanEqual("run_at", at), ...typeQ, Query.orderAsc("run_at"), Query.limit(window)]),
        listRows(J, [
          Query.equal("status", "running"),
          Query.isNotNull("lease_expires_at"),
          Query.lessThan("lease_expires_at", at),
          ...typeQ,
          Query.orderAsc("run_at"),
          Query.limit(window),
        ]),
      ])
      const candidates = [...queued.rows, ...stale.rows].sort((a, b) => (iso(a.run_at) < iso(b.run_at) ? -1 : 1))
      const claimed: Job[] = []
      for (const row of candidates) {
        if (claimed.length >= opts.limit) break
        const attempt = Number(row.attempt) + 1
        const expires = new Date(new Date(at).getTime() + opts.leaseMs).toISOString()
        if (!(await leasesRepo.acquire(row.$id, attempt, workerId, expires))) continue
        if (row.status === "running" && Number(row.attempt) >= Number(row.max_attempts)) {
          // The worker holding the last allowed attempt died before fail(): stop the crash loop.
          await updateRow(J, row.$id, {
            status: "dead",
            error: JOB_LEASE_EXHAUSTED_ERROR,
            worker_id: null,
            lease_expires_at: null,
            completed_at: at,
          })
          continue
        }
        const updated = await updateRow(J, row.$id, {
          status: "running",
          attempt,
          worker_id: workerId,
          lease_expires_at: expires,
        })
        claimed.push(toJob(updated))
      }
      return claimed
    },
    async renew(jobId, workerId, leaseMs, at = nowIso()) {
      const row = await getRow(J, jobId)
      if (!row || row.status !== "running" || row.worker_id !== workerId) return false
      await updateRow(J, jobId, { lease_expires_at: new Date(new Date(at).getTime() + leaseMs).toISOString() })
      return true
    },
    async complete(jobId, workerId, result) {
      await leasedJob(jobId, workerId)
      return toJob(
        await updateRow(J, jobId, {
          status: "succeeded",
          result: result === undefined ? null : JSON.stringify(result),
          error: null,
          lease_expires_at: null,
          completed_at: nowIso(),
        })
      )
    },
    async fail(jobId, workerId, error, failOptions) {
      const row = await leasedJob(jobId, workerId)
      const at = nowIso()
      const attempt = Number(row.attempt)
      const data: Record<string, unknown> = { error, lease_expires_at: null }
      if (failOptions?.permanent || attempt >= Number(row.max_attempts)) {
        data.status = "dead"
        data.completed_at = at
      } else {
        data.status = "queued"
        data.worker_id = null
        data.run_at =
          failOptions?.retryAt ?? new Date(now().getTime() + Math.min(2 ** attempt * 1000, 15 * 60_000)).toISOString()
      }
      return toJob(await updateRow(J, jobId, data))
    },
  }

  // ─── blobs ───
  const bucketOf = (bucket: BucketId) => bucketIds[bucket]
  async function storedFile(bucket: BucketId, fileId: string) {
    if (!ID_RE.test(fileId)) return null
    try {
      return await storage.getFile({ bucketId: bucketOf(bucket), fileId })
    } catch (error) {
      if (isNotFound(error)) return null
      throw toDataError(error)
    }
  }
  const blobsRepo: BlobStorage = {
    async put(workspaceId, bucket, fileId, bytes, mime) {
      if (!ID_RE.test(fileId)) throw new Error(`Invalid file id "${fileId}".`)
      const existing = await storedFile(bucket, fileId)
      if (existing && !ownsFile(workspaceId, existing.name)) {
        throw new DataConflictError("file", `File ${bucket}/${fileId} belongs to another workspace.`)
      }
      if (existing) await call(() => storage.deleteFile({ bucketId: bucketOf(bucket), fileId }))
      const name = storedFileName(workspaceId, fileId, mime)
      const file = InputFile.fromBuffer(new Uint8Array(bytes), name)
      await call(() => storage.createFile({ bucketId: bucketOf(bucket), fileId, file: file as never, permissions: [] }))
      return { bucket, fileId, workspaceId, mime, sizeBytes: bytes.byteLength }
    },
    async head(workspaceId, bucket, fileId) {
      const file = await storedFile(bucket, fileId)
      if (!file || !ownsFile(workspaceId, file.name)) return null
      return { bucket, fileId, workspaceId, mime: file.mimeType, sizeBytes: Number(file.sizeOriginal) }
    },
    async get(workspaceId, bucket, fileId) {
      const head = await blobsRepo.head(workspaceId, bucket, fileId)
      if (!head) return null
      const buffer = await call(() => storage.getFileView({ bucketId: bucketOf(bucket), fileId }))
      return { ...head, bytes: new Uint8Array(buffer) }
    },
    async signedUrl(workspaceId, bucket, fileId, { expiresInSeconds, download, filename }) {
      const head = await blobsRepo.head(workspaceId, bucket, fileId)
      if (!head) throw new DataNotFoundError("file", `${bucket}/${fileId}`)
      return signedFileUrl(
        { workspaceId, bucket, fileId, expiresInSeconds, download, filename },
        { now: now(), baseUrl: options.signedUrls?.baseUrl, secret: options.signedUrls?.secret }
      )
    },
    async delete(workspaceId, bucket, fileId) {
      const file = await storedFile(bucket, fileId)
      if (!file || !ownsFile(workspaceId, file.name)) return
      try {
        await storage.deleteFile({ bucketId: bucketOf(bucket), fileId })
      } catch (error) {
        if (!isNotFound(error)) throw toDataError(error)
      }
    },
  }

  return {
    backend: "appwrite",
    templates: templatesRepo,
    renders: rendersRepo,
    collections: collectionsRepo,
    media: mediaRepo,
    posts: postsRepo,
    settings: settingsRepo,
    notifications: notificationsRepo,
    apiKeys: apiKeysRepo,
    jobs: jobsRepo,
    leases: leasesRepo,
    blobs: blobsRepo,
  }
}
