/**
 * Repository contracts (docs/refactor/03-appwrite-data-layer.md §6).
 *
 * Every workspace-scoped method takes `workspaceId` explicitly; the data layer
 * never reads the session. A row owned by another workspace behaves exactly
 * like a missing row (`null` from getters, `DataNotFoundError` from mutators).
 *
 * System methods used only by the worker (`jobs.claim`, `posts.listDue`, …)
 * are cross-workspace and say so in their name or doc.
 */
import type {
  ApiKey,
  Batch,
  BatchPatch,
  BatchQuery,
  BatchSummary,
  BlobContent,
  BucketId,
  Collection,
  CollectionQuery,
  IsoDateTime,
  Job,
  JobLease,
  JobType,
  Media,
  MediaQuery,
  NewApiKey,
  NewBatch,
  NewCollection,
  NewJob,
  NewMedia,
  NewNotification,
  NewPost,
  NewRender,
  NewTemplate,
  Notification,
  NotificationQuery,
  Page,
  PageQuery,
  Post,
  PostPatch,
  Render,
  RenderOutput,
  RenderQuery,
  RenderSummary,
  StoredBlob,
  Template,
  TemplatePatch,
  TemplateQuery,
  TemplateSummary,
  WorkspaceId,
  WorkspaceSettings,
  WorkspaceSettingsPatch,
} from "./types"
import type { SpecIssue } from "@/lib/render/spec"

export class DataNotFoundError extends Error {
  readonly entity: string
  readonly id: string
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`)
    this.name = "DataNotFoundError"
    this.entity = entity
    this.id = id
  }
}

/** A unique constraint was violated (Appwrite 409). */
export class DataConflictError extends Error {
  readonly entity: string
  constructor(entity: string, message: string) {
    super(message)
    this.name = "DataConflictError"
    this.entity = entity
  }
}

/** The backend refused because of quota/rate limits (Appwrite 429 / plan limits). */
export class DataQuotaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DataQuotaError"
  }
}

/** Result of an idempotent create: `created: false` returns the existing row. */
export type Upserted<T> = { value: T; created: boolean }

export interface TemplatesRepository {
  list(workspaceId: WorkspaceId, query?: TemplateQuery): Promise<Page<TemplateSummary>>
  get(workspaceId: WorkspaceId, id: string): Promise<Template | null>
  create(workspaceId: WorkspaceId, input: NewTemplate): Promise<Template>
  update(workspaceId: WorkspaceId, id: string, patch: TemplatePatch): Promise<Template>
  archive(workspaceId: WorkspaceId, id: string): Promise<void>
}

export interface RendersRepository {
  /** Honours `idempotencyKey` per workspace. */
  create(workspaceId: WorkspaceId, input: NewRender): Promise<Upserted<Render>>
  get(workspaceId: WorkspaceId, id: string): Promise<Render | null>
  /** Newest first; excludes soft-deleted renders. */
  list(workspaceId: WorkspaceId, query?: RenderQuery): Promise<Page<RenderSummary>>
  markRendering(workspaceId: WorkspaceId, id: string, jobId?: string | null): Promise<Render>
  markSucceeded(
    workspaceId: WorkspaceId,
    id: string,
    output: RenderOutput,
    warnings?: SpecIssue[]
  ): Promise<Render>
  markFailed(workspaceId: WorkspaceId, id: string, error: string): Promise<Render>
  softDelete(workspaceId: WorkspaceId, id: string): Promise<void>
  /** Every live render of a batch (summaries, any order). */
  listByBatch(workspaceId: WorkspaceId, batchId: string): Promise<RenderSummary[]>
}

export interface CollectionsRepository {
  list(workspaceId: WorkspaceId, query?: CollectionQuery): Promise<Page<Collection>>
  get(workspaceId: WorkspaceId, id: string): Promise<Collection | null>
  getByName(workspaceId: WorkspaceId, name: string): Promise<Collection | null>
  /** Throws DataConflictError when the name is taken. */
  create(workspaceId: WorkspaceId, input: NewCollection): Promise<Collection>
  rename(workspaceId: WorkspaceId, id: string, name: string): Promise<Collection>
  setPinned(workspaceId: WorkspaceId, id: string, pinned: boolean): Promise<Collection>
  setCover(workspaceId: WorkspaceId, id: string, mediaId: string | null): Promise<Collection>
  /** 30-day trash: sets deletedAt + purgeAfter. */
  softDelete(workspaceId: WorkspaceId, id: string): Promise<void>
  restore(workspaceId: WorkspaceId, id: string): Promise<Collection>
}

export interface MediaRepository {
  /** Dedupes by (collectionId, sha256): an existing row is returned with `created: false`. */
  create(workspaceId: WorkspaceId, input: NewMedia): Promise<Upserted<Media>>
  get(workspaceId: WorkspaceId, id: string): Promise<Media | null>
  /** Missing/foreign ids are omitted; order follows `ids`. */
  getMany(workspaceId: WorkspaceId, ids: readonly string[]): Promise<Media[]>
  /** Collection items by position, otherwise newest first. */
  list(workspaceId: WorkspaceId, query?: MediaQuery): Promise<Page<Media>>
  /** Ordered ids of live media in a collection (backs `{collection, pick}` resolution). */
  listIdsInCollection(workspaceId: WorkspaceId, collectionId: string): Promise<string[]>
  findBySha256(workspaceId: WorkspaceId, sha256: string): Promise<Media[]>
  /** Live rows (any workspace-owned collection) still pointing at a stored file. */
  countByFileId(workspaceId: WorkspaceId, fileId: string): Promise<number>
  move(
    workspaceId: WorkspaceId,
    id: string,
    collectionId: string | null,
    position?: number | null
  ): Promise<Media>
  softDelete(workspaceId: WorkspaceId, id: string): Promise<void>
}

export type PostRangeQuery = { from: IsoDateTime; to: IsoDateTime }

export interface PostsRepository {
  /** Idempotent on `intentKey` per workspace. */
  upsertIntent(workspaceId: WorkspaceId, input: NewPost): Promise<Upserted<Post>>
  get(workspaceId: WorkspaceId, id: string): Promise<Post | null>
  /** Calendar: posts whose publishAt (or publishedAt) falls in [from, to). */
  listRange(workspaceId: WorkspaceId, range: PostRangeQuery): Promise<Post[]>
  listByRender(workspaceId: WorkspaceId, renderId: string): Promise<Post[]>
  /** Every post of a batch (any order). */
  listByBatch(workspaceId: WorkspaceId, batchId: string): Promise<Post[]>
  update(workspaceId: WorkspaceId, id: string, patch: PostPatch): Promise<Post>
  cancel(workspaceId: WorkspaceId, id: string): Promise<Post>
  /** System: scheduled posts due at or before `before`, across workspaces. */
  listDue(before: IsoDateTime, limit: number): Promise<Post[]>
}

export interface BatchesRepository {
  /** Honours `idempotencyKey` per workspace (`created: false` returns the existing batch). */
  create(workspaceId: WorkspaceId, input: NewBatch): Promise<Upserted<Batch>>
  get(workspaceId: WorkspaceId, id: string): Promise<Batch | null>
  /** Newest first. */
  list(workspaceId: WorkspaceId, query?: BatchQuery): Promise<Page<BatchSummary>>
  update(workspaceId: WorkspaceId, id: string, patch: BatchPatch): Promise<Batch>
  /**
   * System: batches still making progress (`queued`/`running`) created after
   * `createdAfter`, least recently updated first.
   */
  listActive(limit: number, options?: { createdAfter?: IsoDateTime }): Promise<BatchSummary[]>
}

export interface SettingsRepository {
  /** Defaults (`DEFAULT_WORKSPACE_SETTINGS`) when the workspace has no row yet. */
  get(workspaceId: WorkspaceId): Promise<WorkspaceSettings>
  patch(workspaceId: WorkspaceId, patch: WorkspaceSettingsPatch): Promise<WorkspaceSettings>
}

export interface NotificationsRepository {
  /** Idempotent on `dedupeKey` per workspace. */
  schedule(workspaceId: WorkspaceId, input: NewNotification): Promise<Upserted<Notification>>
  get(workspaceId: WorkspaceId, id: string): Promise<Notification | null>
  /** Inbox: delivered/read notifications, newest deliverAt first. */
  list(workspaceId: WorkspaceId, query?: NotificationQuery): Promise<Page<Notification>>
  unreadCount(workspaceId: WorkspaceId): Promise<number>
  markRead(workspaceId: WorkspaceId, id: string): Promise<Notification>
  markAllRead(workspaceId: WorkspaceId): Promise<number>
  markDelivered(workspaceId: WorkspaceId, id: string): Promise<Notification>
  /** Cancels pending notifications for a post; returns how many. */
  cancelForPost(workspaceId: WorkspaceId, postId: string): Promise<number>
  /** System: pending notifications with deliverAt ≤ before, across workspaces. */
  listDue(before: IsoDateTime, limit: number): Promise<Notification[]>
}

export interface ApiKeysRepository {
  /** Returns the plaintext once; only its hash is stored. */
  create(workspaceId: WorkspaceId, input: NewApiKey): Promise<{ apiKey: ApiKey; plaintext: string }>
  list(workspaceId: WorkspaceId): Promise<ApiKey[]>
  revoke(workspaceId: WorkspaceId, id: string): Promise<void>
  /** System: resolves a presented key; null when unknown, revoked or expired. */
  resolve(plaintext: string, now?: IsoDateTime): Promise<ApiKey | null>
  /** Records use; implementations may throttle to once per minute. */
  touch(workspaceId: WorkspaceId, id: string, at: IsoDateTime): Promise<void>
}

export type ClaimOptions = {
  limit: number
  leaseMs: number
  now?: IsoDateTime
  types?: readonly JobType[]
}

export interface JobsRepository {
  /** With `dedupeKey`, a second enqueue returns the existing job (`created: false`). */
  enqueue<T extends JobType>(input: NewJob<T>): Promise<Upserted<Job<T>>>
  /** `workspaceId` must match the job's (null for system jobs). */
  get(workspaceId: WorkspaceId | null, id: string): Promise<Job | null>
  listForWorkspace(workspaceId: WorkspaceId, query?: PageQuery): Promise<Page<Job>>
  /**
   * System: claims up to `limit` queued jobs with runAt ≤ now (and running jobs
   * whose lease expired). Each claim creates lease `<jobId>.<attempt+1>`; a
   * lease conflict means another worker won and the job is skipped.
   */
  claim(workerId: string, options: ClaimOptions): Promise<Job[]>
  /** Extends the lease; false when the worker no longer owns the job. */
  renew(jobId: string, workerId: string, leaseMs: number, now?: IsoDateTime): Promise<boolean>
  complete(jobId: string, workerId: string, result?: unknown): Promise<Job>
  /** Requeues with backoff (`retryAt`) or marks `dead` once attempts are exhausted. */
  fail(jobId: string, workerId: string, error: string, options?: { retryAt?: IsoDateTime; permanent?: boolean }): Promise<Job>
  /**
   * Cancels a job that has not started: a `queued` job becomes `dead` with
   * `error`. Returns null (and changes nothing) when the job is missing, owned
   * by another workspace, or no longer queued.
   */
  cancel(workspaceId: WorkspaceId | null, id: string, error: string): Promise<Job | null>
  /**
   * System: `dead` jobs across workspaces, most recently finished first
   * (whether `fail()` or an exhausted lease in `claim()` killed them).
   * `since` keeps only jobs with completedAt ≥ since.
   */
  listDead(options: ListDeadJobsOptions): Promise<Job[]>
}

export type ListDeadJobsOptions = {
  type?: JobType
  since?: IsoDateTime
  limit: number
}

export interface JobLeasesRepository {
  /** Atomic mutex: false when `<jobId>.<attempt>` already exists. */
  acquire(jobId: string, attempt: number, workerId: string, expiresAt: IsoDateTime): Promise<boolean>
  get(jobId: string, attempt: number): Promise<JobLease | null>
  /** Deletes `<jobId>.<attempt>` so it can be acquired again (no-op when absent). */
  release(jobId: string, attempt: number): Promise<void>
  /** Deletes leases created before `before`; returns how many. */
  purgeOlderThan(before: IsoDateTime): Promise<number>
}

export type SignedUrlOptions = { expiresInSeconds: number; download?: boolean; filename?: string }

/**
 * Private buckets `media` and `renders`. Files are tagged with their workspace
 * and are only returned to that workspace.
 */
export interface BlobStorage {
  /** Creates or overwrites `fileId` (render retries overwrite `<renderId>-NN`). */
  put(
    workspaceId: WorkspaceId,
    bucket: BucketId,
    fileId: string,
    bytes: Uint8Array,
    mime: string
  ): Promise<StoredBlob>
  get(workspaceId: WorkspaceId, bucket: BucketId, fileId: string): Promise<BlobContent | null>
  head(workspaceId: WorkspaceId, bucket: BucketId, fileId: string): Promise<StoredBlob | null>
  /** Short-lived URL (e.g. for SocialBu `upload_media_by_url`). */
  signedUrl(
    workspaceId: WorkspaceId,
    bucket: BucketId,
    fileId: string,
    options: SignedUrlOptions
  ): Promise<string>
  /** No-op when the file does not exist. */
  delete(workspaceId: WorkspaceId, bucket: BucketId, fileId: string): Promise<void>
}

export interface Repositories {
  readonly backend: "memory" | "appwrite"
  templates: TemplatesRepository
  renders: RendersRepository
  collections: CollectionsRepository
  media: MediaRepository
  posts: PostsRepository
  batches: BatchesRepository
  settings: SettingsRepository
  notifications: NotificationsRepository
  apiKeys: ApiKeysRepository
  jobs: JobsRepository
  leases: JobLeasesRepository
  blobs: BlobStorage
}
