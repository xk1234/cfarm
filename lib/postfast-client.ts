import { clean, isRecord } from "@/lib/guards"
import { fetchWithTimeout } from "@/lib/http"

export type PostFastFetch = (
  url: string | URL | Request,
  init?: RequestInit
) => Promise<Response>

export type PostFastRequestOptions = {
  apiKey?: string
  baseUrl?: string
  fetcher?: PostFastFetch
  method?: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  headers?: Record<string, string>
  retry?: Partial<PostFastRetryOptions>
}

type PostFastRetryOptions = {
  maxAttempts: number
  baseDelayMs: number
  minRequestGapMs: number
}

export type PostFastMediaType = "IMAGE" | "VIDEO"

export type PostFastMedia = {
  key: string
  type: PostFastMediaType
  sortOrder?: number
}

export type PostFastSocialProvider =
  | "tiktok"
  | "tiktok-creative"
  | "tiktok-seller"
  | "youtube"
  | "instagram"
  | "facebook"
  | "x"
  | "twitter"
  | "linkedin"
  | "threads"
  | "pinterest"
  | "bluesky"
  | "telegram"
  | "google"
  | "google-business-profile"

export type PostFastSocialIntegration = {
  provider: PostFastSocialProvider
  integration_id: string
  name: string
  profile?: string
  picture?: string
  disabled?: boolean
}

export type PostFastCreatePostType = "draft" | "schedule" | "now"

export type PostFastCreatePostInput = {
  type?: PostFastCreatePostType
  date?: string
  integrationId: string
  provider: string
  content: string
  media?: PostFastMedia[]
  controls?: Record<string, unknown>
}

export type PostFastCreatePostPayload = {
  status: "DRAFT" | "SCHEDULED"
  posts: {
    content: string
    mediaItems?: {
      key: string
      type: PostFastMediaType
      sortOrder: number
    }[]
    scheduledAt?: string
    socialMediaId: string
    status: "DRAFT" | "SCHEDULED"
  }[]
  controls?: Record<string, unknown>
}

export class PostFastConfigError extends Error {
  code = "missing_api_key"
  status = 503
  retryable = false

  constructor(message = "POSTFAST_API_KEY is not configured") {
    super(message)
    this.name = "PostFastConfigError"
  }
}

export class PostFastApiError extends Error {
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
    this.name = "PostFastApiError"
    this.status = input.status
    this.code = input.code
    this.retryable = input.retryable ?? false
    this.details = input.details
  }
}

const defaultPostFastBaseUrl = "https://api.postfa.st"
const defaultPostFastRetry: PostFastRetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  minRequestGapMs: 350,
}
let postFastRequestQueue = Promise.resolve()
let lastPostFastRequestAt = 0

export async function postfastRequest<T = unknown>(
  path: string,
  options: PostFastRequestOptions = {}
): Promise<T> {
  const apiKey = clean(options.apiKey ?? process.env.POSTFAST_API_KEY)
  if (!apiKey) {
    throw new PostFastConfigError()
  }

  const fetcher = options.fetcher ?? fetch
  const url = buildPostFastUrl(path, options)
  const body = options.body
  const headers: Record<string, string> = {
    "pf-api-key": apiKey,
    ...options.headers,
  }

  if (body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  const retry = normalizeRetryOptions(options.retry)
  return enqueuePostFastRequest(async () => {
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      await waitForPostFastGap(retry.minRequestGapMs)
      const response = await fetchWithTimeout(
        url,
        {
          method: options.method ?? (body === undefined ? "GET" : "POST"),
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        },
        { fetchImpl: fetcher, timeoutMs: 30_000 }
      )
      lastPostFastRequestAt = Date.now()

      if (response.ok) {
        if (response.status === 204) {
          return undefined as T
        }
        return (await response.json()) as T
      }

      const error = await normalizePostFastError(response)
      if (!error.retryable || attempt === retry.maxAttempts) {
        throw error
      }
      await delay(retryDelayMs(response, attempt, retry.baseDelayMs))
    }

    throw new Error("PostFast request exhausted its retry attempts")
  })
}

function enqueuePostFastRequest<T>(request: () => Promise<T>) {
  const queued = postFastRequestQueue.catch(() => undefined).then(request)
  postFastRequestQueue = queued.then(
    () => undefined,
    () => undefined
  )
  return queued
}

function normalizeRetryOptions(
  value: Partial<PostFastRetryOptions> | undefined
): PostFastRetryOptions {
  return {
    maxAttempts: Math.max(
      1,
      Math.min(
        5,
        Math.floor(value?.maxAttempts ?? defaultPostFastRetry.maxAttempts)
      )
    ),
    baseDelayMs: Math.max(
      0,
      value?.baseDelayMs ?? defaultPostFastRetry.baseDelayMs
    ),
    minRequestGapMs: Math.max(
      0,
      value?.minRequestGapMs ?? defaultPostFastRetry.minRequestGapMs
    ),
  }
}

async function waitForPostFastGap(minRequestGapMs: number) {
  const remaining = minRequestGapMs - (Date.now() - lastPostFastRequestAt)
  if (remaining > 0) await delay(remaining)
}

function retryDelayMs(
  response: Response,
  attempt: number,
  baseDelayMs: number
) {
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

export function createPostFastPostPayload(
  input: PostFastCreatePostInput
): PostFastCreatePostPayload {
  const type = input.type ?? "draft"
  const mediaItems = (input.media ?? []).map((item, index) => ({
    key: item.key,
    type: item.type,
    sortOrder: item.sortOrder ?? index,
  }))
  const post: PostFastCreatePostPayload["posts"][number] = {
    content: input.content,
    socialMediaId: input.integrationId,
    status: type === "draft" ? "DRAFT" : "SCHEDULED",
    scheduledAt:
      type === "schedule" || type === "now"
        ? clean(input.date) || new Date(Date.now() + 60_000).toISOString()
        : undefined,
    mediaItems: mediaItems.length > 0 ? mediaItems : undefined,
  }
  const controls = compactControls(input.controls ?? {})

  return {
    status: post.status,
    posts: [post],
    controls: Object.keys(controls).length > 0 ? controls : undefined,
  }
}

export function buildPostFastUrl(
  path: string,
  options: Pick<PostFastRequestOptions, "baseUrl" | "query"> = {}
) {
  const baseUrl = clean(options.baseUrl) || defaultPostFastBaseUrl
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

export function normalizePostFastConnectUrl(value: unknown) {
  const record = isRecord(value) ? value : {}
  return clean(record.connectUrl) || clean(record.url)
}

export function normalizePostFastIntegration(
  value: unknown
): PostFastSocialIntegration | null {
  const record = isRecord(value) ? value : {}
  const provider = normalizePostFastProvider(
    clean(record.platform) ||
      clean(record.provider) ||
      clean(record.providerIdentifier) ||
      clean(record.identifier)
  )
  const integrationId = clean(record.id)
  if (!provider || !integrationId) {
    return null
  }

  const disabled =
    clean(record.connectionStatus).toUpperCase() === "DISABLED" ||
    (typeof record.disabled === "boolean" ? record.disabled : false)

  return {
    provider,
    integration_id: integrationId,
    name:
      clean(record.displayName) ||
      clean(record.name) ||
      clean(record.platformUsername) ||
      providerLabel(provider),
    profile:
      clean(record.platformUsername) || clean(record.profile) || undefined,
    picture: clean(record.picture) || undefined,
    disabled,
  }
}

export function normalizePostFastProvider(
  value: string
): PostFastSocialProvider | null {
  switch (value.toLowerCase().replace(/_/g, "-")) {
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
      return "google-business-profile"
    default:
      return null
  }
}

function providerLabel(provider: PostFastSocialProvider) {
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

function compactControls(controls: Record<string, unknown>) {
  const entries: [string, unknown][] = []

  for (const [key, value] of Object.entries(controls)) {
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed) {
        entries.push([key, trimmed])
      }
      continue
    }

    if (typeof value === "number" || typeof value === "boolean") {
      entries.push([key, value])
      continue
    }

    if (Array.isArray(value)) {
      const strings = value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)

      if (strings.length > 0) {
        entries.push([key, strings])
      }
      continue
    }

    if (value === null) {
      entries.push([key, value])
    }
  }

  return Object.fromEntries(entries)
}

async function normalizePostFastError(response: Response) {
  const details = await parseResponseBody(response)
  const message =
    errorMessage(details) || response.statusText || "PostFast request failed"
  return new PostFastApiError({
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
    return Array.isArray(message)
      ? message.map(clean).filter(Boolean).join(", ")
      : clean(message) || clean(details.error)
  }
  return ""
}

function codeForStatus(status: number) {
  switch (status) {
    case 401:
      return "unauthorized"
    case 403:
      return "forbidden"
    case 413:
      return "payload_too_large"
    case 429:
      return "rate_limited"
    default:
      return status >= 500 ? "postfast_unavailable" : "postfast_error"
  }
}
