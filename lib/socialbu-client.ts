import { clean, isRecord } from "@/lib/guards"
import { fetchWithTimeout } from "@/lib/http"
import type { SocialPlatformKey } from "@/lib/social/provider-contract"

export type SocialBuFetch = (
  url: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export type SocialBuRequestOptions = {
  apiToken?: string
  baseUrl?: string
  fetcher?: SocialBuFetch
  method?: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  headers?: Record<string, string>
  retry?: Partial<SocialBuRetryOptions>
}

type SocialBuRetryOptions = {
  maxAttempts: number
  baseDelayMs: number
  minRequestGapMs: number
}

export type SocialBuSocialProvider = SocialPlatformKey

/** Neutral connected-account shape, identical to the seam used for PostFast. */
export type SocialBuSocialIntegration = {
  provider: SocialBuSocialProvider
  integration_id: string
  name: string
  profile?: string
  picture?: string
  disabled?: boolean
}

export type SocialBuUploadedAttachment = {
  upload_token: string
}

export type SocialBuCreatePostType = "draft" | "schedule" | "now"

export type SocialBuCreatePostInput = {
  type?: SocialBuCreatePostType
  date?: string
  /** SocialBu account ids. Accepts numeric ids or numeric strings. */
  accountIds: Array<string | number>
  content: string
  attachments?: SocialBuUploadedAttachment[]
  options?: Record<string, unknown>
  postbackUrl?: string
  now?: Date
}

export type SocialBuCreatePostPayload = {
  accounts: number[]
  publish_at: string
  content: string
  draft?: boolean
  existing_attachments?: SocialBuUploadedAttachment[]
  options?: Record<string, unknown>
  postback_url?: string
}

export class SocialBuConfigError extends Error {
  code = "missing_api_token"
  status = 503
  retryable = false

  constructor(message = "SOCIALBU_API_TOKEN is not configured") {
    super(message)
    this.name = "SocialBuConfigError"
  }
}

export class SocialBuApiError extends Error {
  status: number
  code: string
  retryable: boolean
  details: unknown

  constructor(input: {
    status: number
    code: string
    message: string
    retryable?: boolean
    details?: unknown
  }) {
    super(input.message)
    this.name = "SocialBuApiError"
    this.status = input.status
    this.code = input.code
    this.retryable = input.retryable ?? false
    this.details = input.details
  }
}

const defaultSocialBuBaseUrl = "https://socialbu.com/api/v1"
const defaultSocialBuRetry: SocialBuRetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  minRequestGapMs: 350,
}
let socialBuRequestQueue = Promise.resolve()
let lastSocialBuRequestAt = 0

export async function socialbuRequest<T = unknown>(
  path: string,
  options: SocialBuRequestOptions = {}
): Promise<T> {
  const apiToken = clean(options.apiToken ?? process.env.SOCIALBU_API_TOKEN)
  if (!apiToken) {
    throw new SocialBuConfigError()
  }

  const fetcher = options.fetcher ?? fetch
  const url = buildSocialBuUrl(path, options)
  const body = options.body
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`,
    Accept: "application/json",
    ...options.headers,
  }

  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  const retry = normalizeRetryOptions(options.retry)
  return enqueueSocialBuRequest(async () => {
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      await waitForSocialBuGap(retry.minRequestGapMs)
      const response = await fetchWithTimeout(
        url,
        {
          method: options.method ?? (body === undefined ? "GET" : "POST"),
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        { fetchImpl: fetcher, timeoutMs: 30_000 }
      )
      lastSocialBuRequestAt = Date.now()

      if (response.ok) {
        if (response.status === 204) {
          return undefined as T
        }
        return (await response.json()) as T
      }

      const error = await normalizeSocialBuError(response)
      if (!error.retryable || attempt === retry.maxAttempts) {
        throw error
      }
      await delay(retryDelayMs(response, attempt, retry.baseDelayMs))
    }

    throw new Error("SocialBu request exhausted its retry attempts")
  })
}

function enqueueSocialBuRequest<T>(request: () => Promise<T>) {
  const queued = socialBuRequestQueue.catch(() => undefined).then(request)
  socialBuRequestQueue = queued.then(
    () => undefined,
    () => undefined
  )
  return queued
}

function normalizeRetryOptions(
  value: Partial<SocialBuRetryOptions> | undefined
): SocialBuRetryOptions {
  return {
    maxAttempts: Math.max(
      1,
      Math.min(
        5,
        Math.floor(value?.maxAttempts ?? defaultSocialBuRetry.maxAttempts)
      )
    ),
    baseDelayMs: Math.max(
      0,
      value?.baseDelayMs ?? defaultSocialBuRetry.baseDelayMs
    ),
    minRequestGapMs: Math.max(
      0,
      value?.minRequestGapMs ?? defaultSocialBuRetry.minRequestGapMs
    ),
  }
}

async function waitForSocialBuGap(minRequestGapMs: number) {
  const remaining = minRequestGapMs - (Date.now() - lastSocialBuRequestAt)
  if (remaining > 0) await delay(remaining)
}

function retryDelayMs(response: Response, attempt: number, baseDelayMs: number) {
  const retryAfter = response.headers.get("retry-after")
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
    const date = Date.parse(retryAfter)
    if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  }
  return baseDelayMs * 2 ** (attempt - 1)
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * SocialBu expects `publish_at` in `Y-m-d H:i:s` UTC form (e.g.
 * "2025-04-14 15:30:00"), not an ISO 8601 string.
 */
export function formatSocialBuPublishAt(value: string | number | Date): string {
  const date =
    value instanceof Date
      ? value
      : new Date(typeof value === "number" ? value : Date.parse(value))
  if (Number.isNaN(date.getTime())) {
    throw new Error("A valid publish time is required for SocialBu posts.")
  }
  const pad = (input: number) => String(input).padStart(2, "0")
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
  )
}

export function createSocialBuPostPayload(
  input: SocialBuCreatePostInput
): SocialBuCreatePostPayload {
  const type = input.type ?? "draft"
  const accounts = input.accountIds
    .map((id) => Number(clean(String(id))))
    .filter((id) => Number.isFinite(id))
  if (accounts.length === 0) {
    throw new Error("At least one SocialBu account id is required.")
  }

  const publishAtSource =
    type === "schedule"
      ? clean(input.date) || input.now || Date.now() + 60_000
      : (input.now ?? new Date())

  const attachments = (input.attachments ?? []).filter((item) =>
    clean(item.upload_token)
  )
  const options = compactOptions(input.options ?? {})

  const payload: SocialBuCreatePostPayload = {
    accounts,
    publish_at: formatSocialBuPublishAt(publishAtSource),
    content: input.content,
  }
  if (type === "draft") {
    payload.draft = true
  }
  if (attachments.length > 0) {
    payload.existing_attachments = attachments
  }
  if (Object.keys(options).length > 0) {
    payload.options = options
  }
  const postbackUrl = clean(input.postbackUrl)
  if (postbackUrl) {
    payload.postback_url = postbackUrl
  }
  return payload
}

export function buildSocialBuUrl(
  path: string,
  options: Pick<SocialBuRequestOptions, "baseUrl" | "query"> = {}
) {
  const baseUrl = clean(options.baseUrl) || defaultSocialBuBaseUrl
  const url = new URL(
    `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
  )

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

export function normalizeSocialBuConnectUrl(value: unknown) {
  const record = isRecord(value) ? value : {}
  return clean(record.connect_url) || clean(record.connectUrl) || clean(record.url)
}

/**
 * SocialBu returns accounts as a bare array when empty, and as a paginated
 * `{ items: [...] }` object otherwise. `/posts/supported-options` returns
 * `{ accounts: [...] }`. Accept all shapes.
 */
export function extractSocialBuAccounts(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (isRecord(value)) {
    if (Array.isArray(value.items)) return value.items
    if (Array.isArray(value.accounts)) return value.accounts
    if (Array.isArray(value.data)) return value.data
  }
  return []
}

export function normalizeSocialBuIntegration(
  value: unknown
): SocialBuSocialIntegration | null {
  const record = isRecord(value) ? value : {}
  const provider = normalizeSocialBuProvider(
    clean(record.account_type) ||
      clean(record.type) ||
      clean(record.network) ||
      clean(record.provider) ||
      clean(record.platform)
  )
  const integrationId =
    coerceId(record.account_id) ||
    coerceId(record.id) ||
    coerceId(record.integration_id)
  if (!provider || !integrationId) {
    return null
  }

  const active =
    typeof record.active === "boolean" ? record.active : undefined
  const disabled =
    typeof record.disabled === "boolean"
      ? record.disabled
      : active === undefined
        ? false
        : !active

  return {
    provider,
    integration_id: integrationId,
    name:
      clean(record.account_name) ||
      clean(record.name) ||
      clean(record.username) ||
      socialBuProviderLabel(provider),
    profile:
      clean(record.username) || clean(record.profile) || undefined,
    picture:
      clean(record.picture) || clean(record.image) || clean(record.avatar) || undefined,
    disabled,
  }
}

/**
 * Map a SocialBu network/account_type (often dotted, e.g. "facebook.page",
 * "twitter.profile") to the neutral platform key used across the app.
 */
export function normalizeSocialBuProvider(
  value: string
): SocialBuSocialProvider | null {
  const base = value.toLowerCase().replace(/_/g, "-").split(".")[0]?.trim()
  switch (base) {
    case "tiktok":
      return "tiktok"
    case "tiktok-creative":
      return "tiktok-creative"
    case "tiktok-seller":
      return "tiktok-seller"
    case "youtube":
      return "youtube"
    case "instagram":
      return "instagram"
    case "facebook":
      return "facebook"
    case "twitter":
      return "twitter"
    case "x":
      return "x"
    case "linkedin":
      return "linkedin"
    case "threads":
      return "threads"
    case "pinterest":
      return "pinterest"
    case "bluesky":
      return "bluesky"
    case "telegram":
      return "telegram"
    case "google":
      return "google"
    case "google-business-profile":
    case "gmb":
      return "google-business-profile"
    default:
      return null
  }
}

export function socialBuProviderLabel(provider: SocialBuSocialProvider) {
  switch (provider) {
    case "google-business-profile":
      return "Google Business Profile"
    case "google":
      return "Google"
    case "youtube":
      return "YouTube"
    case "tiktok":
      return "TikTok"
    case "tiktok-creative":
      return "TikTok Creative"
    case "tiktok-seller":
      return "TikTok Seller"
    case "instagram":
      return "Instagram"
    case "facebook":
      return "Facebook"
    case "x":
      return "X"
    case "twitter":
      return "Twitter"
    case "linkedin":
      return "LinkedIn"
    case "threads":
      return "Threads"
    case "pinterest":
      return "Pinterest"
    case "bluesky":
      return "Bluesky"
    case "telegram":
      return "Telegram"
  }
}

/** Post ids from a SocialBu create/publish response, tolerant of shape drift. */
export function socialBuPostIds(value: unknown): string[] {
  const record = isRecord(value) ? value : {}
  const candidates: unknown[] = []
  if (Array.isArray(record.posts)) candidates.push(...record.posts)
  if (isRecord(record.post)) candidates.push(record.post)
  if (record.id !== undefined) candidates.push(record)
  if (Array.isArray(record.ids)) {
    return record.ids.map((id) => coerceId(id)).filter(Boolean)
  }

  const ids = candidates
    .map((candidate) =>
      isRecord(candidate) ? coerceId(candidate.id ?? candidate.post_id) : ""
    )
    .filter(Boolean)
  return [...new Set(ids)]
}

export function socialBuReleaseUrl(value: unknown): string | undefined {
  const record = isRecord(value) ? value : {}
  const post = Array.isArray(record.posts)
    ? record.posts[0]
    : isRecord(record.post)
      ? record.post
      : undefined
  const postRecord = isRecord(post) ? post : {}
  const candidate =
    record.releaseUrl ??
    record.release_url ??
    record.url ??
    postRecord.releaseUrl ??
    postRecord.release_url ??
    postRecord.url ??
    postRecord.link
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : undefined
}

/** SocialBu account ids are numeric; accept numbers and numeric strings. */
function coerceId(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return clean(value)
}

function compactOptions(options: Record<string, unknown>) {
  const entries: [string, unknown][] = []
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed) entries.push([key, trimmed])
      continue
    }
    if (typeof value === "number" || typeof value === "boolean") {
      entries.push([key, value])
      continue
    }
    if (Array.isArray(value)) {
      if (value.length > 0) entries.push([key, value])
      continue
    }
    if (isRecord(value) && Object.keys(value).length > 0) {
      entries.push([key, value])
      continue
    }
    if (value === null) {
      entries.push([key, value])
    }
  }
  return Object.fromEntries(entries)
}

async function normalizeSocialBuError(response: Response) {
  const details = await parseResponseBody(response)
  const message =
    errorMessage(details) || response.statusText || "SocialBu request failed"
  return new SocialBuApiError({
    status: response.status,
    code: codeForStatus(response.status),
    message,
    retryable: response.status === 429 || response.status >= 500,
    details,
  })
}

async function parseResponseBody(response: Response) {
  const text = await response.text().catch(() => "")
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function errorMessage(details: unknown) {
  if (typeof details === "string") {
    return details
  }
  if (isRecord(details)) {
    const message = details.message
    if (Array.isArray(message)) {
      return message.map(clean).filter(Boolean).join(", ")
    }
    const flattened = flattenValidationErrors(details.errors)
    return clean(message) || flattened || clean(details.error)
  }
  return ""
}

function flattenValidationErrors(errors: unknown) {
  if (!isRecord(errors)) return ""
  const messages: string[] = []
  for (const value of Object.values(errors)) {
    if (Array.isArray(value)) {
      messages.push(...value.map(clean).filter(Boolean))
    } else {
      const single = clean(value)
      if (single) messages.push(single)
    }
  }
  return messages.join(", ")
}

function codeForStatus(status: number) {
  switch (status) {
    case 401:
      return "unauthorized"
    case 403:
      return "forbidden"
    case 413:
      return "payload_too_large"
    case 422:
      return "invalid_request"
    case 429:
      return "rate_limited"
    default:
      return status >= 500 ? "socialbu_unavailable" : "socialbu_error"
  }
}
