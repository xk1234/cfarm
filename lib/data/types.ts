/**
 * Domain types for the Appwrite data layer (docs/refactor/03-appwrite-data-layer.md §3).
 *
 * Single-user: `workspaceId` is the Clerk user id. Times are ISO 8601 strings.
 * JSON columns are typed here and validated with the zod schemas below when
 * an adapter reads them back.
 */
import { z } from "zod"

import type {
  OutputFormat,
  ResolvedSpec,
  SlideshowSpec,
  SlotValues,
  SpecIssue,
} from "@/lib/render/spec"

/** Clerk user id (single-user workspaces). */
export type WorkspaceId = string
/** ISO 8601 timestamp. */
export type IsoDateTime = string

export type PageQuery = { cursor?: string | null; limit?: number }
export type Page<T> = { items: T[]; nextCursor: string | null }

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

// ─────────────────────────────── templates (`specs` table) ───────────────────────────────

export type Template = {
  id: string
  workspaceId: WorkspaceId
  name: string
  spec: SlideshowSpec
  specVersion: 1
  /** Denormalised for filtering: `9:16`, `4:5`, `1:1`, or `WxH`. */
  aspectRatio: string
  /** Slide entries before repeat expansion. */
  slideCount: number
  imageSlotCount: number
  thumbnailFileId: string | null
  createdBy: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  archivedAt: IsoDateTime | null
}
export type TemplateSummary = Omit<Template, "spec">
export type NewTemplate = {
  name: string
  spec: SlideshowSpec
  createdBy: string
  thumbnailFileId?: string | null
}
export type TemplatePatch = Partial<Pick<Template, "name" | "spec" | "thumbnailFileId">>
export type TemplateQuery = PageQuery & { includeArchived?: boolean }

// ─────────────────────────────── renders ───────────────────────────────

export const RENDER_STATUSES = ["queued", "rendering", "succeeded", "failed"] as const
export type RenderStatus = (typeof RENDER_STATUSES)[number]
export const RENDER_SOURCES = ["ui", "api", "mcp", "schedule"] as const
export type RenderSource = (typeof RENDER_SOURCES)[number]

export type RenderOutputSlide = {
  /** 0-based slide index. */
  index: number
  /** ResolvedSlide id. */
  slideId: string
  /** File in the `renders` bucket: `<renderId>-<NN>`. */
  fileId: string
  mime: string
  sizeBytes: number
  width: number
  height: number
  sha256?: string
}
export type RenderOutput = {
  slides: RenderOutputSlide[]
  coverFileId: string | null
  /** ZIP in the `renders` bucket when requested. */
  zipFileId?: string | null
}
export const RenderOutputSchema: z.ZodType<RenderOutput> = z.object({
  slides: z.array(
    z.object({
      index: z.number().int().min(0),
      slideId: z.string(),
      fileId: z.string(),
      mime: z.string(),
      sizeBytes: z.number().int().min(0),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      sha256: z.string().optional(),
    })
  ),
  coverFileId: z.string().nullable(),
  zipFileId: z.string().nullable().optional(),
})

export type Render = {
  id: string
  workspaceId: WorkspaceId
  templateId: string | null
  slotValues: SlotValues | null
  /** Frozen ResolvedSpec; re-rendering never re-resolves the template. */
  spec: ResolvedSpec
  status: RenderStatus
  source: RenderSource
  apiKeyId: string | null
  idempotencyKey: string | null
  title: string | null
  format: OutputFormat
  /** 0.5..2 */
  scale: number
  slideCount: number
  width: number
  height: number
  output: RenderOutput | null
  warnings: SpecIssue[]
  error: string | null
  jobId: string | null
  renderHash: string | null
  createdBy: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  completedAt: IsoDateTime | null
  deletedAt: IsoDateTime | null
}
export type RenderSummary = Omit<Render, "spec" | "slotValues">
export type NewRender = {
  templateId?: string | null
  slotValues?: SlotValues | null
  spec: ResolvedSpec
  source: RenderSource
  apiKeyId?: string | null
  idempotencyKey?: string | null
  title?: string | null
  format?: OutputFormat
  scale?: number
  renderHash?: string | null
  createdBy: string
  /** Default "queued". */
  status?: Extract<RenderStatus, "queued" | "rendering">
}
export type RenderQuery = PageQuery & { status?: RenderStatus; templateId?: string }

// ─────────────────────────────── collections + media ───────────────────────────────

// Ingest accepts raster images only (lib/files/ingest.ts); renders are still slides.
export const MEDIA_KINDS = ["image"] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]
export const MEDIA_SOURCES = ["upload", "pexels", "pinterest", "url"] as const
export type MediaSource = (typeof MEDIA_SOURCES)[number]

export type Collection = {
  id: string
  workspaceId: WorkspaceId
  /** Unique per workspace. */
  name: string
  mediaKind: MediaKind
  pinned: boolean
  itemCount: number
  coverMediaId: string | null
  createdBy: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
  deletedAt: IsoDateTime | null
  purgeAfter: IsoDateTime | null
}
export type NewCollection = { name: string; mediaKind?: MediaKind; createdBy: string }
export type CollectionQuery = PageQuery & { includeDeleted?: boolean }

export type Media = {
  id: string
  workspaceId: WorkspaceId
  /** null: lives in the uploads library only. */
  collectionId: string | null
  kind: MediaKind
  bucketId: "media"
  fileId: string
  mimeType: string
  sizeBytes: number
  width: number | null
  height: number | null
  sha256: string
  name: string | null
  caption: string | null
  source: MediaSource
  sourceUrl: string | null
  attribution: string | null
  position: number | null
  createdBy: string
  createdAt: IsoDateTime
  deletedAt: IsoDateTime | null
  purgeAfter: IsoDateTime | null
}
export type NewMedia = {
  collectionId?: string | null
  kind: MediaKind
  fileId: string
  mimeType: string
  sizeBytes: number
  width?: number | null
  height?: number | null
  sha256: string
  name?: string | null
  caption?: string | null
  source: MediaSource
  sourceUrl?: string | null
  attribution?: string | null
  /** Default: appended at the end of the collection. */
  position?: number | null
  createdBy: string
}
export type MediaQuery = PageQuery & {
  /** `null` = uploads library only; omitted = everything. */
  collectionId?: string | null
  kind?: MediaKind
}

// ─────────────────────────────── posts (SocialBu) ───────────────────────────────

export const POST_STATUSES = ["draft", "scheduled", "publishing", "published", "failed", "canceled"] as const
export type PostStatus = (typeof POST_STATUSES)[number]

/** One rendered slideshow going to one SocialBu account. */
export type Post = {
  id: string
  workspaceId: WorkspaceId
  renderId: string
  /** `tiktok`, `instagram`, … (SocialBu account type). */
  provider: string
  /** SocialBu account id (stringified integer). */
  accountId: string
  status: PostStatus
  /** Scheduled publish time; null = publish now / draft. */
  publishAt: IsoDateTime | null
  publishedAt: IsoDateTime | null
  caption: string
  /** Per-network SocialBu `options` (e.g. TikTok privacy_status). */
  platformOptions: Record<string, unknown>
  /** SocialBu post id. */
  providerPostId: string | null
  /** Network post id / permalink when known. */
  externalPostId: string | null
  permalink: string | null
  error: string | null
  /** Idempotency: unique per workspace. */
  intentKey: string
  createdBy: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}
export type NewPost = {
  renderId: string
  provider: string
  accountId: string
  status?: Extract<PostStatus, "draft" | "scheduled" | "publishing">
  publishAt?: IsoDateTime | null
  caption: string
  platformOptions?: Record<string, unknown>
  intentKey: string
  createdBy: string
}
export type PostPatch = Partial<
  Pick<
    Post,
    | "status"
    | "publishAt"
    | "publishedAt"
    | "caption"
    | "platformOptions"
    | "providerPostId"
    | "externalPostId"
    | "permalink"
    | "error"
  >
>

// ─────────────────────────────── settings ───────────────────────────────

export type ReminderSettings = {
  enabled: boolean
  /** Minutes before a scheduled post to notify. */
  leadMinutes: number[]
}
export type WorkspaceSettings = {
  workspaceId: WorkspaceId
  timezone: string
  /** SocialBu account ids hidden from the publish dialog. */
  disabledAccountIds: string[]
  mcpDisabledTools: string[]
  reminders: ReminderSettings
  renderDefaults: Record<string, unknown>
  updatedAt: IsoDateTime | null
}
export type WorkspaceSettingsPatch = Partial<Omit<WorkspaceSettings, "workspaceId" | "updatedAt">>
export const DEFAULT_WORKSPACE_SETTINGS: Omit<WorkspaceSettings, "workspaceId"> = {
  timezone: "UTC",
  disabledAccountIds: [],
  mcpDisabledTools: [],
  reminders: { enabled: true, leadMinutes: [60] },
  renderDefaults: {},
  updatedAt: null,
}

// ─────────────────────────────── notifications (in-app) ───────────────────────────────

export const NOTIFICATION_STATUSES = ["pending", "delivered", "read", "canceled"] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]
export const NOTIFICATION_EVENTS = [
  "post.upcoming",
  "post.published",
  "post.failed",
  "render.succeeded",
  "render.failed",
] as const
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export type Notification = {
  id: string
  workspaceId: WorkspaceId
  event: NotificationEvent
  postId: string | null
  renderId: string | null
  title: string
  body: string | null
  deliverAt: IsoDateTime
  channel: "in_app"
  status: NotificationStatus
  readAt: IsoDateTime | null
  /** Unique per workspace. */
  dedupeKey: string
  createdAt: IsoDateTime
}
export type NewNotification = {
  event: NotificationEvent
  postId?: string | null
  renderId?: string | null
  title: string
  body?: string | null
  deliverAt: IsoDateTime
  dedupeKey: string
}
export type NotificationQuery = PageQuery & { status?: NotificationStatus }

// ─────────────────────────────── API keys ───────────────────────────────

export const API_KEY_SCOPES = [
  "renders:read",
  "renders:write",
  "templates:read",
  "templates:write",
  "media:read",
  "media:write",
  "posts:read",
  "posts:write",
] as const
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export type ApiKey = {
  id: string
  workspaceId: WorkspaceId
  name: string
  /** Shown in the UI, e.g. `lc_4f9a2b`. */
  prefix: string
  /** sha256(plaintext), hex. */
  keyHash: string
  scopes: ApiKeyScope[]
  createdBy: string
  createdAt: IsoDateTime
  lastUsedAt: IsoDateTime | null
  expiresAt: IsoDateTime | null
  revokedAt: IsoDateTime | null
}
export type NewApiKey = {
  name: string
  scopes: ApiKeyScope[]
  createdBy: string
  expiresAt?: IsoDateTime | null
}

// ─────────────────────────────── jobs + leases ───────────────────────────────

export const JOB_TYPES = ["render-slideshow", "publish-post", "notify"] as const
export type JobType = (typeof JOB_TYPES)[number]
export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "dead"] as const
export type JobStatus = (typeof JOB_STATUSES)[number]

export type JobPayloads = {
  /** `quality` is the requested JPEG/WebP quality (0–1); absent means the default. */
  "render-slideshow": { renderId: string; quality?: number }
  "publish-post": { postId: string }
  notify: { notificationId: string }
}
export const JobPayloadSchemas: { [K in JobType]: z.ZodType<JobPayloads[K]> } = {
  "render-slideshow": z.object({ renderId: z.string().min(1), quality: z.number().min(0).max(1).optional() }),
  "publish-post": z.object({ postId: z.string().min(1) }),
  notify: z.object({ notificationId: z.string().min(1) }),
}

export type Job<T extends JobType = JobType> = {
  id: string
  /** null for system jobs. */
  workspaceId: WorkspaceId | null
  type: T
  status: JobStatus
  payload: JobPayloads[T]
  result: unknown
  error: string | null
  /** Current attempt (0 = never claimed). */
  attempt: number
  maxAttempts: number
  runAt: IsoDateTime
  leaseExpiresAt: IsoDateTime | null
  workerId: string | null
  completedAt: IsoDateTime | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}
export type NewJob<T extends JobType = JobType> = {
  workspaceId: WorkspaceId | null
  type: T
  payload: JobPayloads[T]
  /** Default now. */
  runAt?: IsoDateTime
  /** Default 5. */
  maxAttempts?: number
  /** Deterministic id → a second enqueue returns the existing job. */
  dedupeKey?: string
}

/** `<jobId>.<attempt>`: creating it is the atomic claim (409 = another worker won). */
export type JobLease = {
  id: string
  jobId: string
  attempt: number
  workerId: string
  expiresAt: IsoDateTime
  createdAt: IsoDateTime
}

export const DEFAULT_JOB_MAX_ATTEMPTS = 5
/** Error recorded when a job's lease expired on its final allowed attempt. */
export const JOB_LEASE_EXHAUSTED_ERROR = "Lease expired too many times; the worker likely crashed while running this job."

// ─────────────────────────────── blob storage ───────────────────────────────

export const BUCKETS = ["media", "renders"] as const
export type BucketId = (typeof BUCKETS)[number]

export type StoredBlob = {
  bucket: BucketId
  fileId: string
  workspaceId: WorkspaceId
  mime: string
  sizeBytes: number
}
export type BlobContent = StoredBlob & { bytes: Uint8Array }
