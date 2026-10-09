/**
 * Typed browser client for every route the workspace UI calls.
 *
 * The UI never builds request URLs itself: integration with the API builders
 * (`/api/v1/*`, `/api/publishing/*`, `/api/notifications`, `/api/settings/*`,
 * `/api/files/*`) only needs this file adjusted when a route shape changes.
 *
 * Payload types come from the frozen contracts in `lib/render/spec.ts`,
 * `lib/data/types.ts` and `lib/publishing/publisher.ts`.
 */
import type {
  ApiKey,
  ApiKeyScope,
  Collection,
  Media,
  Notification,
  Page,
  Post,
  PostStatus,
  ReminderSettings,
  RenderSource,
  RenderStatus,
} from "@/lib/data/types"
import type {
  PublisherAccount,
  PublisherStatus,
} from "@/lib/publishing/publisher"
import type {
  OutputFormat,
  RenderRequest,
  ResolvedSpec,
  SlideshowSpec,
  SlotValues,
  SpecIssue,
} from "@/lib/render/spec"
import type { FontFaceInfo } from "@/lib/render/engine"

// ─────────────────────────────── routes ───────────────────────────────

export const apiRoutes = {
  specValidate: "/api/v1/specs/validate",
  specSchema: "/api/v1/schema/slideshow-spec",
  fonts: "/api/v1/fonts",
  templates: "/api/v1/templates",
  template: (id: string) => `/api/v1/templates/${encodeURIComponent(id)}`,
  renders: "/api/v1/renders",
  render: (id: string) => `/api/v1/renders/${encodeURIComponent(id)}`,
  renderPreview: "/api/v1/renders/preview",
  collections: "/api/collections",
  media: "/api/media",
  mediaUpload: "/api/media/upload",
  file: (fileId: string) => `/api/files/${encodeURIComponent(fileId)}`,
  filePreview: (fileId: string, width: number) =>
    `/api/files/${encodeURIComponent(fileId)}/preview?w=${width}`,
  fontFile: (file: string) => `/api/fonts/${encodeURIComponent(file)}`,
  imageProxy: (url: string) => `/api/image-proxy?url=${encodeURIComponent(url)}`,
  stockSearch: (source: StockSource, limit: number) =>
    `/api/${source}/search?limit=${limit}`,
  publishingStatus: "/api/publishing/status",
  publishingAccounts: "/api/publishing/accounts",
  publishingPosts: "/api/publishing/posts",
  publishingPost: (id: string) =>
    `/api/publishing/posts/${encodeURIComponent(id)}`,
  notifications: "/api/notifications",
  notification: (id: string) => `/api/notifications/${encodeURIComponent(id)}`,
  notificationsReadAll: "/api/notifications/read-all",
  apiKeys: "/api/settings/api-keys",
  apiKey: (id: string) => `/api/settings/api-keys/${encodeURIComponent(id)}`,
  reminders: "/api/settings/reminders",
  mcpSettings: "/api/settings/mcp",
  // Collections management screens (kept from the strip; move to
  // `collections`/`media` above when the Appwrite routes replace them).
  imageCollections: "/api/image-collections",
  imageCollectionsImport: "/api/image-collections/import",
  imageCollectionsDeletePreview: "/api/image-collections/delete-preview",
  collectionAssetUpload: "/api/assets/upload",
  mediaLibrary: "/api/media-library",
} as const

// ─────────────────────────────── errors ───────────────────────────────

/** A failed API call. `issues` carries spec/slot problems from a 422. */
export class ApiClientError extends Error {
  readonly status: number
  readonly issues: SpecIssue[]
  readonly warnings: SpecIssue[]
  readonly body: unknown
  constructor(
    status: number,
    message: string,
    body?: unknown,
    issues: SpecIssue[] = [],
    warnings: SpecIssue[] = []
  ) {
    super(message)
    this.name = "ApiClientError"
    this.status = status
    this.body = body
    this.issues = issues
    this.warnings = warnings
  }
}

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>

let fetchImpl: FetchImpl = (input, init) => fetch(input, init)

/** Tests inject a mocked HTTP layer here. */
export function setApiFetchForTesting(next: FetchImpl | null) {
  fetchImpl = next ?? ((input, init) => fetch(input, init))
}

function isIssueList(value: unknown): value is SpecIssue[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as SpecIssue).code === "string" &&
        typeof (item as SpecIssue).message === "string"
    )
  )
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>
    if (typeof record.error === "string" && record.error.trim()) return record.error
    if (record.error && typeof record.error === "object") {
      const message = (record.error as Record<string, unknown>).message
      if (typeof message === "string" && message.trim()) return message
    }
    if (typeof record.message === "string" && record.message.trim()) return record.message
    if (isIssueList(record.errors) && record.errors.length > 0) {
      return record.errors[0].message
    }
  }
  if (typeof body === "string" && body.trim() && body.length < 300) return body
  if (status === 401) return "Your session expired. Sign in again."
  if (status === 404) return "Not found."
  return `Request failed with status ${status}.`
}

export async function requestJson<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, headers, ...rest } = init
  const response = await fetchImpl(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...rest,
    headers: {
      accept: "application/json",
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const text = await response.text().catch(() => "")
  let body: unknown = undefined
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  if (!response.ok) {
    const record = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
    throw new ApiClientError(
      response.status,
      errorMessage(body, response.status),
      body,
      isIssueList(record.errors) ? record.errors : [],
      isIssueList(record.warnings) ? record.warnings : []
    )
  }
  return body as T
}

// ─────────────────────────────── spec + fonts ───────────────────────────────

export type SpecValidateResponse = {
  ok: boolean
  errors: SpecIssue[]
  warnings: SpecIssue[]
  resolvedSpec?: ResolvedSpec
}

export function validateSpecRemote(input: {
  spec: unknown
  slotValues?: SlotValues
}): Promise<SpecValidateResponse> {
  return requestJson<SpecValidateResponse>(apiRoutes.specValidate, {
    method: "POST",
    json: input,
  }).catch((error) => {
    if (error instanceof ApiClientError && error.status === 422) {
      return { ok: false, errors: error.issues, warnings: error.warnings }
    }
    throw error
  })
}

export async function listFontsRemote(): Promise<FontFaceInfo[]> {
  const body = await requestJson<{ fonts?: FontFaceInfo[] } | FontFaceInfo[]>(apiRoutes.fonts)
  return Array.isArray(body) ? body : (body.fonts ?? [])
}

// ─────────────────────────────── templates ───────────────────────────────

export type TemplateView = {
  id: string
  name: string
  description?: string | null
  /** Bundled starter template (not stored in the workspace). */
  starter?: boolean
  spec: SlideshowSpec
  aspectRatio?: string
  slideCount?: number
  imageSlotCount?: number
  thumbnailUrl?: string | null
}

type TemplateListBody =
  | { items?: TemplateView[]; templates?: TemplateView[] }
  | TemplateView[]

export async function listTemplates(): Promise<TemplateView[]> {
  const body = await requestJson<TemplateListBody>(apiRoutes.templates)
  const items = Array.isArray(body) ? body : (body.items ?? body.templates ?? [])
  return items.filter((item) => item && typeof item === "object" && item.spec)
}

// ─────────────────────────────── renders ───────────────────────────────

export type RenderSlideView = {
  /** 0-based slide index. */
  index: number
  /** Resolved slide id. */
  id: string
  url: string
  width: number
  height: number
  bytes?: number
  mime?: string
  sha256?: string
}

export type RenderView = {
  id: string
  status: RenderStatus
  title?: string | null
  templateId?: string | null
  source?: RenderSource
  format?: OutputFormat
  slideCount?: number
  width?: number
  height?: number
  renderHash?: string | null
  slides: RenderSlideView[]
  zipUrl?: string | null
  resolvedSpec?: ResolvedSpec
  slotValues?: SlotValues | null
  warnings: SpecIssue[]
  error?: string | null
  createdAt: string
  completedAt?: string | null
}

export type RenderListItem = {
  id: string
  status: RenderStatus
  title?: string | null
  slideCount?: number
  width?: number
  height?: number
  format?: OutputFormat
  coverUrl?: string | null
  createdAt: string
  completedAt?: string | null
}

export type CreateRenderResponse = RenderView & { jobId?: string | null }

/** `POST /api/v1/renders`: 201 when complete, 202 with a queued/rendering status. */
export function createRender(request: RenderRequest): Promise<CreateRenderResponse> {
  return requestJson<CreateRenderResponse>(apiRoutes.renders, {
    method: "POST",
    json: request,
  })
}

export async function getRender(id: string): Promise<RenderView> {
  const body = await requestJson<RenderView | { render: RenderView }>(apiRoutes.render(id))
  const render = "render" in body && body.render ? body.render : (body as RenderView)
  return normalizeRender(render)
}

export async function listRenders(
  query: { cursor?: string | null; limit?: number; status?: RenderStatus } = {}
): Promise<Page<RenderListItem>> {
  const params = new URLSearchParams()
  if (query.cursor) params.set("cursor", query.cursor)
  if (query.limit) params.set("limit", String(query.limit))
  if (query.status) params.set("status", query.status)
  const qs = params.toString()
  const body = await requestJson<
    Page<RenderListItem> | { renders?: RenderListItem[]; nextCursor?: string | null }
  >(`${apiRoutes.renders}${qs ? `?${qs}` : ""}`)
  if ("items" in body) return { items: body.items ?? [], nextCursor: body.nextCursor ?? null }
  return { items: body.renders ?? [], nextCursor: body.nextCursor ?? null }
}

function normalizeRender(render: RenderView): RenderView {
  return {
    ...render,
    slides: [...(render.slides ?? [])].sort((a, b) => a.index - b.index),
    warnings: render.warnings ?? [],
  }
}

/** Single-slide server preview (PNG). Not persisted. */
export async function previewSlideRemote(input: {
  spec?: unknown
  templateId?: string
  slotValues?: SlotValues
  slide: number
  scale?: number
}): Promise<Blob> {
  const response = await fetchImpl(apiRoutes.renderPreview, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", accept: "image/png" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => "")
    let body: unknown = text
    try {
      body = JSON.parse(text)
    } catch {
      // keep text
    }
    throw new ApiClientError(response.status, errorMessage(body, response.status), body)
  }
  return response.blob()
}

export function isRenderSettled(status: RenderStatus): boolean {
  return status === "succeeded" || status === "failed"
}

// ─────────────────────────────── collections + media ───────────────────────────────

export type MediaView = Media & {
  /** Full-size, ownership-checked URL. */
  url?: string
  /** Picker thumbnail URL. */
  thumbnailUrl?: string
}

export function mediaUrl(media: Pick<MediaView, "id" | "fileId" | "url">): string {
  return media.url ?? apiRoutes.file(media.fileId || media.id)
}

export function mediaThumbnailUrl(
  media: Pick<MediaView, "id" | "fileId" | "thumbnailUrl" | "url">,
  width = 480
): string {
  return media.thumbnailUrl ?? apiRoutes.filePreview(media.fileId || media.id, width)
}

/** Ownership-checked bytes for a `{media}` image source (browser preview loader). */
export function mediaSourceUrl(mediaId: string): string {
  return apiRoutes.file(mediaId)
}

export async function listCollections(): Promise<Collection[]> {
  const body = await requestJson<Page<Collection> | { collections?: Collection[] } | Collection[]>(
    apiRoutes.collections
  )
  if (Array.isArray(body)) return body
  if ("items" in body) return body.items ?? []
  return body.collections ?? []
}

export async function listMedia(
  query: { collectionId?: string | null; cursor?: string | null; limit?: number } = {}
): Promise<Page<MediaView>> {
  const params = new URLSearchParams()
  if (query.collectionId === null) params.set("collectionId", "null")
  else if (query.collectionId) params.set("collectionId", query.collectionId)
  if (query.cursor) params.set("cursor", query.cursor)
  if (query.limit) params.set("limit", String(query.limit))
  const qs = params.toString()
  const body = await requestJson<Page<MediaView> | { media?: MediaView[]; nextCursor?: string | null }>(
    `${apiRoutes.media}${qs ? `?${qs}` : ""}`
  )
  if ("items" in body) return { items: body.items ?? [], nextCursor: body.nextCursor ?? null }
  return { items: body.media ?? [], nextCursor: body.nextCursor ?? null }
}

/** Media ids of a collection in display order (for seeded random previews). */
export async function listCollectionMediaIds(collectionId: string): Promise<string[]> {
  const ids: string[] = []
  let cursor: string | null = null
  for (let page = 0; page < 10; page++) {
    const result: Page<MediaView> = await listMedia({ collectionId, cursor, limit: 100 })
    ids.push(...result.items.filter((m) => m.kind === "image").map((m) => m.id))
    if (!result.nextCursor) break
    cursor = result.nextCursor
  }
  return ids
}

export async function uploadMedia(
  file: File,
  options: { collectionId?: string | null } = {}
): Promise<MediaView> {
  const form = new FormData()
  form.set("file", file)
  if (options.collectionId) form.set("collectionId", options.collectionId)
  const body = await requestJson<MediaView | { media: MediaView }>(apiRoutes.mediaUpload, {
    method: "POST",
    body: form,
  })
  return "media" in body && body.media ? body.media : (body as MediaView)
}

export type StockSource = "pexels" | "pinterest"

export type StockImage = {
  id: string
  imageUrl: string
  thumbnailUrl: string
  title: string
  attribution: string | null
}

type StockSearchBody = {
  results?: Array<{
    id?: string
    imageUrl?: string
    url?: string
    thumbnailUrl?: string
    thumbnail?: string
    title?: string
    description?: string
    author?: string
    photographer?: string
  }>
}

export async function searchStockImages(
  source: StockSource,
  query: string,
  limit = 24
): Promise<StockImage[]> {
  const body = await requestJson<StockSearchBody>(apiRoutes.stockSearch(source, limit), {
    method: "POST",
    json: [{ query, apiKey: "", trim: true }],
  })
  return (body.results ?? [])
    .map((result, index) => {
      const imageUrl = result.imageUrl ?? result.url ?? ""
      return {
        id: result.id ?? `${source}-${index}`,
        imageUrl,
        thumbnailUrl: result.thumbnailUrl ?? result.thumbnail ?? imageUrl,
        title: result.title ?? result.description ?? "",
        attribution: result.author ?? result.photographer ?? null,
      }
    })
    .filter((image) => image.imageUrl.startsWith("https://"))
}

// ─────────────────────────────── publishing ───────────────────────────────

export const NOT_CONNECTED_STATUS: PublisherStatus = {
  configured: false,
  message: "SocialBu not connected",
}

export async function getPublisherStatus(): Promise<PublisherStatus> {
  try {
    const body = await requestJson<PublisherStatus | { status: PublisherStatus }>(
      apiRoutes.publishingStatus
    )
    return "status" in body ? body.status : body
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 404 || error.status === 503)) {
      return NOT_CONNECTED_STATUS
    }
    throw error
  }
}

export async function listPublisherAccounts(): Promise<PublisherAccount[]> {
  const body = await requestJson<{ accounts?: PublisherAccount[] } | PublisherAccount[]>(
    apiRoutes.publishingAccounts
  )
  return Array.isArray(body) ? body : (body.accounts ?? [])
}

export type PublishRenderInput = {
  renderId: string
  /** SocialBu account ids. */
  accountIds: string[]
  caption: string
  /** ISO 8601; omitted/null = publish now. */
  publishAt?: string | null
  platformOptions?: Record<string, Record<string, unknown>>
  /** Client idempotency key for this submission. */
  intentKey: string
}

export async function publishRender(input: PublishRenderInput): Promise<Post[]> {
  const body = await requestJson<{ posts?: Post[] } | Post[]>(apiRoutes.publishingPosts, {
    method: "POST",
    json: input,
  })
  return Array.isArray(body) ? body : (body.posts ?? [])
}

export type PostView = Post & {
  renderTitle?: string | null
  coverUrl?: string | null
  accountName?: string | null
}

export async function listPosts(
  query: { from?: string; to?: string; renderId?: string; status?: PostStatus } = {}
): Promise<PostView[]> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value)
  const qs = params.toString()
  const body = await requestJson<{ posts?: PostView[]; items?: PostView[] } | PostView[]>(
    `${apiRoutes.publishingPosts}${qs ? `?${qs}` : ""}`
  )
  return Array.isArray(body) ? body : (body.posts ?? body.items ?? [])
}

export function cancelPost(id: string): Promise<unknown> {
  return requestJson(apiRoutes.publishingPost(id), { method: "DELETE" })
}

// ─────────────────────────────── notifications ───────────────────────────────

export async function listNotifications(): Promise<{
  items: Notification[]
  unread: number
}> {
  const body = await requestJson<
    { items?: Notification[]; notifications?: Notification[]; unread?: number } | Notification[]
  >(apiRoutes.notifications)
  const items = Array.isArray(body) ? body : (body.items ?? body.notifications ?? [])
  const unread =
    !Array.isArray(body) && typeof body.unread === "number"
      ? body.unread
      : items.filter((n) => n.status !== "read" && n.status !== "canceled").length
  return { items, unread }
}

export function markNotificationRead(id: string): Promise<unknown> {
  return requestJson(apiRoutes.notification(id), {
    method: "PATCH",
    json: { status: "read" },
  })
}

export function markAllNotificationsRead(): Promise<unknown> {
  return requestJson(apiRoutes.notificationsReadAll, { method: "POST" })
}

// ─────────────────────────────── settings ───────────────────────────────

/** API key metadata; the hash never leaves the server. */
export type ApiKeyView = Omit<ApiKey, "keyHash" | "workspaceId">

export async function listApiKeys(): Promise<ApiKeyView[]> {
  const body = await requestJson<{ keys?: ApiKeyView[]; items?: ApiKeyView[] } | ApiKeyView[]>(
    apiRoutes.apiKeys
  )
  return Array.isArray(body) ? body : (body.keys ?? body.items ?? [])
}

/** The plaintext `secret` is returned exactly once. */
export function createApiKey(input: {
  name: string
  scopes: ApiKeyScope[]
}): Promise<{ key: ApiKeyView; secret: string }> {
  return requestJson(apiRoutes.apiKeys, { method: "POST", json: input })
}

export function revokeApiKey(id: string): Promise<unknown> {
  return requestJson(apiRoutes.apiKey(id), { method: "DELETE" })
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  const body = await requestJson<{ reminders?: ReminderSettings } | ReminderSettings>(
    apiRoutes.reminders
  )
  if ("reminders" in body && body.reminders) return body.reminders
  const direct = body as ReminderSettings
  return {
    enabled: typeof direct.enabled === "boolean" ? direct.enabled : true,
    leadMinutes: Array.isArray(direct.leadMinutes) ? direct.leadMinutes : [60],
  }
}

export async function saveReminderSettings(reminders: ReminderSettings): Promise<ReminderSettings> {
  const body = await requestJson<{ reminders?: ReminderSettings } | ReminderSettings>(
    apiRoutes.reminders,
    { method: "PUT", json: { reminders } }
  )
  return "reminders" in body && body.reminders ? body.reminders : reminders
}
