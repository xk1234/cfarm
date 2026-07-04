export type PostizFetch = (url: string | URL | Request, init?: RequestInit) => Promise<Response>

export type PostizRequestOptions = {
  apiKey?: string
  baseUrl?: string
  fetcher?: PostizFetch
  method?: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  headers?: Record<string, string>
}

export type PostizMedia = {
  id: string
  path: string
}

export type PostizCreatePostType = "draft" | "schedule" | "now"

export type PostizCreatePostInput = {
  type?: PostizCreatePostType
  date?: string
  integrationId: string
  provider: string
  content: string
  media?: PostizMedia[]
  settings?: Record<string, unknown>
  shortLink?: boolean
  tags?: string[]
}

export type PostizCreatePostPayload = {
  type: PostizCreatePostType
  date?: string
  shortLink: boolean
  tags: string[]
  posts: {
    integration: { id: string }
    value: { content: string; image: PostizMedia[] }[]
    settings: Record<string, unknown>
  }[]
}

export class PostizConfigError extends Error {
  code = "missing_api_key"
  status = 503
  retryable = false

  constructor(message = "POSTIZ_API_KEY is not configured") {
    super(message)
    this.name = "PostizConfigError"
  }
}

export class PostizApiError extends Error {
  status: number
  code: string
  retryable: boolean
  details: unknown

  constructor(input: { status: number; code: string; message: string; retryable?: boolean; details?: unknown }) {
    super(input.message)
    this.name = "PostizApiError"
    this.status = input.status
    this.code = input.code
    this.retryable = input.retryable ?? false
    this.details = input.details
  }
}

const defaultPostizBaseUrl = "https://api.postiz.com/public/v1"

export async function postizRequest<T = unknown>(path: string, options: PostizRequestOptions = {}): Promise<T> {
  const apiKey = clean(options.apiKey ?? process.env.POSTIZ_API_KEY)
  if (!apiKey) {
    throw new PostizConfigError()
  }

  const fetcher = options.fetcher ?? fetch
  const url = buildPostizUrl(path, options)
  const body = options.body
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData
  const headers: Record<string, string> = {
    Authorization: apiKey,
    ...options.headers,
  }

  if (body !== undefined && !isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetcher(url, {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  })

  if (!response.ok) {
    throw await normalizePostizError(response)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return await response.json() as T
}

export function createPostizPostPayload(input: PostizCreatePostInput): PostizCreatePostPayload {
  const type = input.type ?? "draft"
  return {
    type,
    date: type === "schedule" ? clean(input.date) || undefined : undefined,
    shortLink: input.shortLink ?? false,
    tags: input.tags ?? [],
    posts: [
      {
        integration: { id: input.integrationId },
        value: [
          {
            content: input.content,
            image: input.media ?? [],
          },
        ],
        settings: input.settings ?? { __type: input.provider },
      },
    ],
  }
}

export function buildPostizUrl(path: string, options: Pick<PostizRequestOptions, "baseUrl" | "query"> = {}) {
  const baseUrl = clean(options.baseUrl ?? process.env.POSTIZ_BASE_URL) || defaultPostizBaseUrl
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`)

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

async function normalizePostizError(response: Response) {
  const details = await parseResponseBody(response)
  const message = errorMessage(details) || response.statusText || "Postiz request failed"
  return new PostizApiError({
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
  if (details && typeof details === "object") {
    const record = details as Record<string, unknown>
    return clean(record.message) || clean(record.error)
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
      return status >= 500 ? "postiz_unavailable" : "postiz_error"
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
