/**
 * In-memory repositories: the default backend for unit tests and the
 * reference behaviour for the Appwrite adapter. Not for production.
 */
import { canvasSize } from "@/lib/render/spec"
import type { SlideshowSpec } from "@/lib/render/spec"

import {
  deterministicJobId,
  generateApiKey,
  hashApiKey,
  leaseId,
  newId,
} from "./crypto"
import {
  DataConflictError,
  DataNotFoundError,
  type ApiKeysRepository,
  type BlobStorage,
  type ClaimOptions,
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
} from "./repositories"
import {
  DEFAULT_JOB_MAX_ATTEMPTS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_WORKSPACE_SETTINGS,
  MAX_PAGE_SIZE,
  type ApiKey,
  type BlobContent,
  type Collection,
  type Job,
  type JobLease,
  type JobType,
  type Media,
  type Notification,
  type Page,
  type PageQuery,
  type Post,
  type Render,
  type RenderSummary,
  type Template,
  type TemplateSummary,
  type WorkspaceSettings,
} from "./types"

export type MemoryRepositoryOptions = {
  /** Injectable clock for tests. */
  now?: () => Date
}

const clone = <T>(v: T): T => structuredClone(v)

function paginate<T>(items: T[], query: PageQuery | undefined): Page<T> {
  const limit = Math.min(Math.max(query?.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
  const offset = query?.cursor ? Number.parseInt(query.cursor, 10) || 0 : 0
  const slice = items.slice(offset, offset + limit)
  const next = offset + limit < items.length ? String(offset + limit) : null
  return { items: slice.map(clone), nextCursor: next }
}

const newestFirst = <T extends { createdAt: string }>(a: T, b: T) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0

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

export function createMemoryRepositories(options: MemoryRepositoryOptions = {}): Repositories {
  const now = () => (options.now ? options.now() : new Date())
  const iso = () => now().toISOString()

  const templates = new Map<string, Template>()
  const renders = new Map<string, Render>()
  const collections = new Map<string, Collection>()
  const media = new Map<string, Media>()
  const posts = new Map<string, Post>()
  const settings = new Map<string, WorkspaceSettings>()
  const notifications = new Map<string, Notification>()
  const apiKeys = new Map<string, ApiKey>()
  const jobs = new Map<string, Job>()
  const leases = new Map<string, JobLease>()
  const blobs = new Map<string, BlobContent>()

  function owned<T extends { workspaceId: string | null }>(
    map: Map<string, T>,
    workspaceId: string | null,
    id: string
  ): T | null {
    const row = map.get(id)
    return row && row.workspaceId === workspaceId ? row : null
  }
  function mustOwn<T extends { workspaceId: string | null }>(
    map: Map<string, T>,
    entity: string,
    workspaceId: string | null,
    id: string
  ): T {
    const row = owned(map, workspaceId, id)
    if (!row) throw new DataNotFoundError(entity, id)
    return row
  }

  // ─── templates ───
  const templatesRepo: TemplatesRepository = {
    async list(workspaceId, query) {
      const items = [...templates.values()]
        .filter((t) => t.workspaceId === workspaceId && (query?.includeArchived || !t.archivedAt))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .map(({ spec: _spec, ...summary }): TemplateSummary => summary)
      return paginate(items, query)
    },
    async get(workspaceId, id) {
      const t = owned(templates, workspaceId, id)
      return t ? clone(t) : null
    },
    async create(workspaceId, input) {
      const at = iso()
      const t: Template = {
        id: newId(),
        workspaceId,
        name: input.name,
        spec: clone(input.spec),
        specVersion: 1,
        aspectRatio: aspectRatioOf(input.spec),
        slideCount: input.spec.slides.length,
        imageSlotCount: imageSlotCount(input.spec),
        thumbnailFileId: input.thumbnailFileId ?? null,
        createdBy: input.createdBy,
        createdAt: at,
        updatedAt: at,
        archivedAt: null,
      }
      templates.set(t.id, t)
      return clone(t)
    },
    async update(workspaceId, id, patch) {
      const t = mustOwn(templates, "template", workspaceId, id)
      if (patch.name !== undefined) t.name = patch.name
      if (patch.thumbnailFileId !== undefined) t.thumbnailFileId = patch.thumbnailFileId
      if (patch.spec !== undefined) {
        t.spec = clone(patch.spec)
        t.aspectRatio = aspectRatioOf(patch.spec)
        t.slideCount = patch.spec.slides.length
        t.imageSlotCount = imageSlotCount(patch.spec)
      }
      t.updatedAt = iso()
      return clone(t)
    },
    async archive(workspaceId, id) {
      const t = mustOwn(templates, "template", workspaceId, id)
      t.archivedAt = iso()
      t.updatedAt = t.archivedAt
    },
  }

  // ─── renders ───
  const rendersRepo: RendersRepository = {
    async create(workspaceId, input) {
      if (input.idempotencyKey) {
        const existing = [...renders.values()].find(
          (r) => r.workspaceId === workspaceId && r.idempotencyKey === input.idempotencyKey
        )
        if (existing) return { value: clone(existing), created: false }
      }
      const at = iso()
      const r: Render = {
        id: newId(),
        workspaceId,
        templateId: input.templateId ?? null,
        slotValues: input.slotValues ? clone(input.slotValues) : null,
        spec: clone(input.spec),
        status: input.status ?? "queued",
        source: input.source,
        apiKeyId: input.apiKeyId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        title: input.title ?? null,
        format: input.format ?? "png",
        scale: input.scale ?? 1,
        slideCount: input.spec.slides.length,
        width: input.spec.canvas.width,
        height: input.spec.canvas.height,
        output: null,
        warnings: [],
        error: null,
        jobId: null,
        renderHash: input.renderHash ?? null,
        createdBy: input.createdBy,
        createdAt: at,
        updatedAt: at,
        completedAt: null,
        deletedAt: null,
      }
      renders.set(r.id, r)
      return { value: clone(r), created: true }
    },
    async get(workspaceId, id) {
      const r = owned(renders, workspaceId, id)
      return r && !r.deletedAt ? clone(r) : null
    },
    async list(workspaceId, query) {
      const items = [...renders.values()]
        .filter(
          (r) =>
            r.workspaceId === workspaceId &&
            !r.deletedAt &&
            (!query?.status || r.status === query.status) &&
            (!query?.templateId || r.templateId === query.templateId)
        )
        .sort(newestFirst)
        .map(({ spec: _s, slotValues: _v, ...summary }): RenderSummary => summary)
      return paginate(items, query)
    },
    async markRendering(workspaceId, id, jobId) {
      const r = mustOwn(renders, "render", workspaceId, id)
      r.status = "rendering"
      if (jobId !== undefined) r.jobId = jobId
      r.updatedAt = iso()
      return clone(r)
    },
    async markSucceeded(workspaceId, id, output, warnings = []) {
      const r = mustOwn(renders, "render", workspaceId, id)
      r.status = "succeeded"
      r.output = clone(output)
      r.warnings = clone(warnings)
      r.error = null
      r.completedAt = r.updatedAt = iso()
      return clone(r)
    },
    async markFailed(workspaceId, id, error) {
      const r = mustOwn(renders, "render", workspaceId, id)
      r.status = "failed"
      r.error = error
      r.completedAt = r.updatedAt = iso()
      return clone(r)
    },
    async softDelete(workspaceId, id) {
      const r = mustOwn(renders, "render", workspaceId, id)
      r.deletedAt = r.updatedAt = iso()
    },
  }

  // ─── collections ───
  const purgeAfter = () => new Date(now().getTime() + 30 * 24 * 3600 * 1000).toISOString()
  const collectionsRepo: CollectionsRepository = {
    async list(workspaceId, query) {
      const items = [...collections.values()]
        .filter((c) => c.workspaceId === workspaceId && (query?.includeDeleted || !c.deletedAt))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.updatedAt < b.updatedAt ? 1 : -1))
      return paginate(items, query)
    },
    async get(workspaceId, id) {
      const c = owned(collections, workspaceId, id)
      return c ? clone(c) : null
    },
    async getByName(workspaceId, name) {
      const c = [...collections.values()].find((x) => x.workspaceId === workspaceId && x.name === name)
      return c ? clone(c) : null
    },
    async create(workspaceId, input) {
      if ([...collections.values()].some((c) => c.workspaceId === workspaceId && c.name === input.name)) {
        throw new DataConflictError("collection", `A collection named "${input.name}" already exists.`)
      }
      const at = iso()
      const c: Collection = {
        id: newId(),
        workspaceId,
        name: input.name,
        mediaKind: input.mediaKind ?? "image",
        pinned: false,
        itemCount: 0,
        coverMediaId: null,
        createdBy: input.createdBy,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
        purgeAfter: null,
      }
      collections.set(c.id, c)
      return clone(c)
    },
    async rename(workspaceId, id, name) {
      const c = mustOwn(collections, "collection", workspaceId, id)
      if ([...collections.values()].some((x) => x.workspaceId === workspaceId && x.name === name && x.id !== id)) {
        throw new DataConflictError("collection", `A collection named "${name}" already exists.`)
      }
      c.name = name
      c.updatedAt = iso()
      return clone(c)
    },
    async setPinned(workspaceId, id, pinned) {
      const c = mustOwn(collections, "collection", workspaceId, id)
      c.pinned = pinned
      c.updatedAt = iso()
      return clone(c)
    },
    async setCover(workspaceId, id, mediaId) {
      const c = mustOwn(collections, "collection", workspaceId, id)
      c.coverMediaId = mediaId
      c.updatedAt = iso()
      return clone(c)
    },
    async softDelete(workspaceId, id) {
      const c = mustOwn(collections, "collection", workspaceId, id)
      c.deletedAt = c.updatedAt = iso()
      c.purgeAfter = purgeAfter()
    },
    async restore(workspaceId, id) {
      const c = mustOwn(collections, "collection", workspaceId, id)
      c.deletedAt = null
      c.purgeAfter = null
      c.updatedAt = iso()
      return clone(c)
    },
  }

  // ─── media ───
  const liveInCollection = (workspaceId: string, collectionId: string) =>
    [...media.values()]
      .filter((m) => m.workspaceId === workspaceId && m.collectionId === collectionId && !m.deletedAt)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.createdAt < b.createdAt ? -1 : 1))
  const bumpCount = (workspaceId: string, collectionId: string | null) => {
    if (!collectionId) return
    const c = owned(collections, workspaceId, collectionId)
    if (c) {
      c.itemCount = liveInCollection(workspaceId, collectionId).length
      c.updatedAt = iso()
    }
  }
  const mediaRepo: MediaRepository = {
    async create(workspaceId, input) {
      const collectionId = input.collectionId ?? null
      if (collectionId) mustOwn(collections, "collection", workspaceId, collectionId)
      const dup = [...media.values()].find(
        (m) =>
          m.workspaceId === workspaceId && m.collectionId === collectionId && m.sha256 === input.sha256 && !m.deletedAt
      )
      if (dup) return { value: clone(dup), created: false }
      const siblings = collectionId ? liveInCollection(workspaceId, collectionId) : []
      const m: Media = {
        id: newId(),
        workspaceId,
        collectionId,
        kind: input.kind,
        bucketId: "media",
        fileId: input.fileId,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        width: input.width ?? null,
        height: input.height ?? null,
        sha256: input.sha256,
        name: input.name ?? null,
        caption: input.caption ?? null,
        source: input.source,
        sourceUrl: input.sourceUrl ?? null,
        attribution: input.attribution ?? null,
        position:
          input.position ?? (collectionId ? Math.max(-1, ...siblings.map((s) => s.position ?? 0)) + 1 : null),
        createdBy: input.createdBy,
        createdAt: iso(),
        deletedAt: null,
        purgeAfter: null,
      }
      media.set(m.id, m)
      bumpCount(workspaceId, collectionId)
      return { value: clone(m), created: true }
    },
    async get(workspaceId, id) {
      const m = owned(media, workspaceId, id)
      return m && !m.deletedAt ? clone(m) : null
    },
    async getMany(workspaceId, ids) {
      return ids
        .map((id) => owned(media, workspaceId, id))
        .filter((m): m is Media => !!m && !m.deletedAt)
        .map(clone)
    },
    async list(workspaceId, query) {
      if (query?.collectionId) {
        return paginate(
          liveInCollection(workspaceId, query.collectionId).filter((m) => !query.kind || m.kind === query.kind),
          query
        )
      }
      const items = [...media.values()]
        .filter(
          (m) =>
            m.workspaceId === workspaceId &&
            !m.deletedAt &&
            (query?.collectionId === undefined || m.collectionId === query.collectionId) &&
            (!query?.kind || m.kind === query.kind)
        )
        .sort(newestFirst)
      return paginate(items, query)
    },
    async listIdsInCollection(workspaceId, collectionId) {
      return liveInCollection(workspaceId, collectionId).map((m) => m.id)
    },
    async findBySha256(workspaceId, sha256) {
      return [...media.values()]
        .filter((m) => m.workspaceId === workspaceId && m.sha256 === sha256 && !m.deletedAt)
        .map(clone)
    },
    async countByFileId(workspaceId, fileId) {
      return [...media.values()].filter((m) => m.workspaceId === workspaceId && m.fileId === fileId && !m.deletedAt)
        .length
    },
    async move(workspaceId, id, collectionId, position) {
      const m = mustOwn(media, "media", workspaceId, id)
      if (collectionId) mustOwn(collections, "collection", workspaceId, collectionId)
      const from = m.collectionId
      m.collectionId = collectionId
      m.position = position ?? (collectionId ? liveInCollection(workspaceId, collectionId).length : null)
      bumpCount(workspaceId, from)
      bumpCount(workspaceId, collectionId)
      return clone(m)
    },
    async softDelete(workspaceId, id) {
      const m = mustOwn(media, "media", workspaceId, id)
      m.deletedAt = iso()
      m.purgeAfter = purgeAfter()
      bumpCount(workspaceId, m.collectionId)
    },
  }

  // ─── posts ───
  const postsRepo: PostsRepository = {
    async upsertIntent(workspaceId, input) {
      const existing = [...posts.values()].find((p) => p.workspaceId === workspaceId && p.intentKey === input.intentKey)
      if (existing) return { value: clone(existing), created: false }
      const at = iso()
      const p: Post = {
        id: newId(),
        workspaceId,
        renderId: input.renderId,
        provider: input.provider,
        accountId: input.accountId,
        status: input.status ?? (input.publishAt ? "scheduled" : "draft"),
        publishAt: input.publishAt ?? null,
        publishedAt: null,
        caption: input.caption,
        platformOptions: clone(input.platformOptions ?? {}),
        providerPostId: null,
        externalPostId: null,
        permalink: null,
        error: null,
        intentKey: input.intentKey,
        createdBy: input.createdBy,
        createdAt: at,
        updatedAt: at,
      }
      posts.set(p.id, p)
      return { value: clone(p), created: true }
    },
    async get(workspaceId, id) {
      const p = owned(posts, workspaceId, id)
      return p ? clone(p) : null
    },
    async listRange(workspaceId, { from, to }) {
      return [...posts.values()]
        .filter((p) => {
          if (p.workspaceId !== workspaceId) return false
          const at = p.publishedAt ?? p.publishAt
          return !!at && at >= from && at < to
        })
        .sort((a, b) => ((a.publishedAt ?? a.publishAt)! < (b.publishedAt ?? b.publishAt)! ? -1 : 1))
        .map(clone)
    },
    async listByRender(workspaceId, renderId) {
      return [...posts.values()]
        .filter((p) => p.workspaceId === workspaceId && p.renderId === renderId)
        .sort(newestFirst)
        .map(clone)
    },
    async update(workspaceId, id, patch) {
      const p = mustOwn(posts, "post", workspaceId, id)
      Object.assign(p, clone(patch))
      p.updatedAt = iso()
      return clone(p)
    },
    async cancel(workspaceId, id) {
      const p = mustOwn(posts, "post", workspaceId, id)
      p.status = "canceled"
      p.updatedAt = iso()
      return clone(p)
    },
    async listDue(before, limit) {
      return [...posts.values()]
        .filter((p) => p.status === "scheduled" && !!p.publishAt && p.publishAt <= before)
        .sort((a, b) => (a.publishAt! < b.publishAt! ? -1 : 1))
        .slice(0, limit)
        .map(clone)
    },
  }

  // ─── settings ───
  const settingsRepo: SettingsRepository = {
    async get(workspaceId) {
      return clone(settings.get(workspaceId) ?? { workspaceId, ...DEFAULT_WORKSPACE_SETTINGS })
    },
    async patch(workspaceId, patch) {
      const current = settings.get(workspaceId) ?? { workspaceId, ...clone(DEFAULT_WORKSPACE_SETTINGS) }
      const next: WorkspaceSettings = { ...current, ...clone(patch), workspaceId, updatedAt: iso() }
      settings.set(workspaceId, next)
      return clone(next)
    },
  }

  // ─── notifications ───
  const notificationsRepo: NotificationsRepository = {
    async schedule(workspaceId, input) {
      const existing = [...notifications.values()].find(
        (n) => n.workspaceId === workspaceId && n.dedupeKey === input.dedupeKey
      )
      if (existing) return { value: clone(existing), created: false }
      const n: Notification = {
        id: newId(),
        workspaceId,
        event: input.event,
        postId: input.postId ?? null,
        renderId: input.renderId ?? null,
        title: input.title,
        body: input.body ?? null,
        deliverAt: input.deliverAt,
        channel: "in_app",
        status: "pending",
        readAt: null,
        dedupeKey: input.dedupeKey,
        createdAt: iso(),
      }
      notifications.set(n.id, n)
      return { value: clone(n), created: true }
    },
    async get(workspaceId, id) {
      const n = owned(notifications, workspaceId, id)
      return n ? clone(n) : null
    },
    async list(workspaceId, query) {
      const items = [...notifications.values()]
        .filter(
          (n) =>
            n.workspaceId === workspaceId &&
            (query?.status ? n.status === query.status : n.status === "delivered" || n.status === "read")
        )
        .sort((a, b) => (a.deliverAt < b.deliverAt ? 1 : -1))
      return paginate(items, query)
    },
    async unreadCount(workspaceId) {
      return [...notifications.values()].filter((n) => n.workspaceId === workspaceId && n.status === "delivered").length
    },
    async markRead(workspaceId, id) {
      const n = mustOwn(notifications, "notification", workspaceId, id)
      n.status = "read"
      n.readAt = iso()
      return clone(n)
    },
    async markAllRead(workspaceId) {
      let count = 0
      const at = iso()
      for (const n of notifications.values()) {
        if (n.workspaceId === workspaceId && n.status === "delivered") {
          n.status = "read"
          n.readAt = at
          count++
        }
      }
      return count
    },
    async markDelivered(workspaceId, id) {
      const n = mustOwn(notifications, "notification", workspaceId, id)
      if (n.status === "pending") n.status = "delivered"
      return clone(n)
    },
    async cancelForPost(workspaceId, postId) {
      let count = 0
      for (const n of notifications.values()) {
        if (n.workspaceId === workspaceId && n.postId === postId && n.status === "pending") {
          n.status = "canceled"
          count++
        }
      }
      return count
    },
    async listDue(before, limit) {
      return [...notifications.values()]
        .filter((n) => n.status === "pending" && n.deliverAt <= before)
        .sort((a, b) => (a.deliverAt < b.deliverAt ? -1 : 1))
        .slice(0, limit)
        .map(clone)
    },
  }

  // ─── API keys ───
  const apiKeysRepo: ApiKeysRepository = {
    async create(workspaceId, input) {
      const { plaintext, prefix, keyHash } = generateApiKey()
      const key: ApiKey = {
        id: newId(),
        workspaceId,
        name: input.name,
        prefix,
        keyHash,
        scopes: [...input.scopes],
        createdBy: input.createdBy,
        createdAt: iso(),
        lastUsedAt: null,
        expiresAt: input.expiresAt ?? null,
        revokedAt: null,
      }
      apiKeys.set(key.id, key)
      return { apiKey: clone(key), plaintext }
    },
    async list(workspaceId) {
      return [...apiKeys.values()].filter((k) => k.workspaceId === workspaceId).sort(newestFirst).map(clone)
    },
    async revoke(workspaceId, id) {
      const k = mustOwn(apiKeys, "api key", workspaceId, id)
      k.revokedAt ??= iso()
    },
    async resolve(plaintext, at = iso()) {
      const hash = hashApiKey(plaintext)
      const k = [...apiKeys.values()].find((x) => x.keyHash === hash)
      if (!k || k.revokedAt || (k.expiresAt && k.expiresAt <= at)) return null
      return clone(k)
    },
    async touch(workspaceId, id, at) {
      const k = mustOwn(apiKeys, "api key", workspaceId, id)
      k.lastUsedAt = at
    },
  }

  // ─── leases ───
  const leasesRepo: JobLeasesRepository = {
    async acquire(jobId, attempt, workerId, expiresAt) {
      const id = leaseId(jobId, attempt)
      if (leases.has(id)) return false
      leases.set(id, { id, jobId, attempt, workerId, expiresAt, createdAt: iso() })
      return true
    },
    async get(jobId, attempt) {
      const l = leases.get(leaseId(jobId, attempt))
      return l ? clone(l) : null
    },
    async purgeOlderThan(before) {
      let n = 0
      for (const [id, l] of leases) {
        if (l.createdAt < before) {
          leases.delete(id)
          n++
        }
      }
      return n
    },
  }

  // ─── jobs ───
  const ownedJob = (jobId: string, workerId: string): Job => {
    const job = jobs.get(jobId)
    if (!job) throw new DataNotFoundError("job", jobId)
    if (job.status !== "running" || job.workerId !== workerId) {
      throw new DataConflictError("job", `Job ${jobId} is not leased by ${workerId}.`)
    }
    return job
  }
  const jobsRepo: JobsRepository = {
    async enqueue(input) {
      const id = input.dedupeKey ? deterministicJobId(input.workspaceId, input.dedupeKey) : newId()
      const existing = jobs.get(id)
      if (existing) return { value: clone(existing) as typeof existing & Job<typeof input.type>, created: false }
      const at = iso()
      const job: Job<typeof input.type> = {
        id,
        workspaceId: input.workspaceId,
        type: input.type,
        status: "queued",
        payload: clone(input.payload),
        result: null,
        error: null,
        attempt: 0,
        maxAttempts: input.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
        runAt: input.runAt ?? at,
        leaseExpiresAt: null,
        workerId: null,
        completedAt: null,
        createdAt: at,
        updatedAt: at,
      }
      jobs.set(id, job as Job)
      return { value: clone(job), created: true }
    },
    async get(workspaceId, id) {
      const j = owned(jobs, workspaceId, id)
      return j ? clone(j) : null
    },
    async listForWorkspace(workspaceId, query) {
      return paginate([...jobs.values()].filter((j) => j.workspaceId === workspaceId).sort(newestFirst), query)
    },
    async claim(workerId, opts: ClaimOptions) {
      const at = opts.now ?? iso()
      const types = opts.types ? new Set<JobType>(opts.types) : null
      const candidates = [...jobs.values()]
        .filter(
          (j) =>
            (!types || types.has(j.type)) &&
            ((j.status === "queued" && j.runAt <= at) ||
              (j.status === "running" && !!j.leaseExpiresAt && j.leaseExpiresAt < at))
        )
        .sort((a, b) => (a.runAt < b.runAt ? -1 : 1))
      const claimed: Job[] = []
      for (const job of candidates) {
        if (claimed.length >= opts.limit) break
        const expires = new Date(new Date(at).getTime() + opts.leaseMs).toISOString()
        if (!(await leasesRepo.acquire(job.id, job.attempt + 1, workerId, expires))) continue
        job.status = "running"
        job.attempt += 1
        job.workerId = workerId
        job.leaseExpiresAt = expires
        job.updatedAt = at
        claimed.push(clone(job))
      }
      return claimed
    },
    async renew(jobId, workerId, leaseMs, at = iso()) {
      const job = jobs.get(jobId)
      if (!job || job.status !== "running" || job.workerId !== workerId) return false
      job.leaseExpiresAt = new Date(new Date(at).getTime() + leaseMs).toISOString()
      job.updatedAt = at
      return true
    },
    async complete(jobId, workerId, result) {
      const job = ownedJob(jobId, workerId)
      job.status = "succeeded"
      job.result = result === undefined ? null : clone(result)
      job.error = null
      job.leaseExpiresAt = null
      job.completedAt = job.updatedAt = iso()
      return clone(job)
    },
    async fail(jobId, workerId, error, failOptions) {
      const job = ownedJob(jobId, workerId)
      const at = iso()
      job.error = error
      job.leaseExpiresAt = null
      job.updatedAt = at
      if (failOptions?.permanent || job.attempt >= job.maxAttempts) {
        job.status = "dead"
        job.completedAt = at
      } else {
        job.status = "queued"
        job.workerId = null
        job.runAt =
          failOptions?.retryAt ??
          new Date(now().getTime() + Math.min(2 ** job.attempt * 1000, 15 * 60_000)).toISOString()
      }
      return clone(job)
    },
  }

  // ─── blobs ───
  const blobKey = (bucket: string, fileId: string) => `${bucket}/${fileId}`
  const blobsRepo: BlobStorage = {
    async put(workspaceId, bucket, fileId, bytes, mime) {
      const existing = blobs.get(blobKey(bucket, fileId))
      if (existing && existing.workspaceId !== workspaceId) {
        throw new DataConflictError("file", `File ${bucket}/${fileId} belongs to another workspace.`)
      }
      const blob: BlobContent = { bucket, fileId, workspaceId, mime, sizeBytes: bytes.byteLength, bytes: new Uint8Array(bytes) }
      blobs.set(blobKey(bucket, fileId), blob)
      const { bytes: _b, ...stored } = blob
      return stored
    },
    async get(workspaceId, bucket, fileId) {
      const blob = blobs.get(blobKey(bucket, fileId))
      if (!blob || blob.workspaceId !== workspaceId) return null
      return { ...blob, bytes: new Uint8Array(blob.bytes) }
    },
    async head(workspaceId, bucket, fileId) {
      const blob = blobs.get(blobKey(bucket, fileId))
      if (!blob || blob.workspaceId !== workspaceId) return null
      const { bytes: _b, ...stored } = blob
      return stored
    },
    async signedUrl(workspaceId, bucket, fileId, { expiresInSeconds }) {
      const blob = blobs.get(blobKey(bucket, fileId))
      if (!blob || blob.workspaceId !== workspaceId) throw new DataNotFoundError("file", `${bucket}/${fileId}`)
      const exp = Math.floor(now().getTime() / 1000) + expiresInSeconds
      return `memory://${bucket}/${encodeURIComponent(fileId)}?exp=${exp}`
    },
    async delete(workspaceId, bucket, fileId) {
      const blob = blobs.get(blobKey(bucket, fileId))
      if (blob && blob.workspaceId === workspaceId) blobs.delete(blobKey(bucket, fileId))
    },
  }

  return {
    backend: "memory",
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
