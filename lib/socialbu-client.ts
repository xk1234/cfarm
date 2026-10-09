/**
 * Typed SocialBu REST client (docs/refactor/socialbu-openapi.yaml).
 *
 * Only the endpoints LumenClip uses are modelled: accounts, supported post
 * options, media upload (signed URL and by URL), and posts. The HTTP layer is
 * an injectable `fetch` so tests run against a mocked SocialBu. Requests are
 * retried with exponential backoff on 429 and 5xx; creating a post is only
 * retried on 429 because a 5xx may already have created it.
 */
import {
  PublisherRequestError,
  SOCIALBU_BASE_URL,
  type FetchLike,
} from "@/lib/publishing/publisher"

// ─────────────────────────────── wire types ───────────────────────────────

/** `GET /accounts` item. SocialBu does not publish a schema; fields are read defensively. */
export type SocialBuAccount = {
  id: number | string
  /** e.g. `tiktok.profile`, `instagram.api`, `facebook.page`. */
  type?: string
  name?: string
  active?: boolean
  image?: string | null
  extra_data?: Record<string, unknown> | null
  [key: string]: unknown
}

export type SocialBuPage<T> = {
  items: T[]
  currentPage?: number
  lastPage?: number
  nextPage?: number | null
  total?: number
}

export type SocialBuOptionDefinition = {
  label?: string
  type?: "string" | "boolean" | "dropdown" | "json" | string
  storage?: string
  required?: boolean
  default?: unknown
  max_length?: number
  options?: Array<{ value: string; label?: string }>
}

export type SocialBuSupportedOptions = {
  account_id: number
  account_type: string
  account_name?: string
  options: Record<string, SocialBuOptionDefinition>
}

export type SocialBuSignedUpload = {
  name?: string
  mime_type?: string
  signed_url: string
  key: string
  secure_key?: string
  url?: string
}

export type SocialBuUploadStatus = {
  success: boolean
  message?: string
  upload_token?: string | null
}

export type SocialBuUploadByUrlResult = {
  success?: boolean
  message?: string
  name?: string
  mime_type?: string
  size?: number
  key?: string
  upload_token: string
  url?: string
}

export type SocialBuCreatePostBody = {
  accounts: number[]
  /** `Y-m-d H:i:s`, UTC. */
  publish_at: string
  content?: string
  draft?: boolean
  existing_attachments?: Array<{ upload_token: string }>
  options?: Record<string, unknown>
  postback_url?: string
  team_id?: number
}

/** A SocialBu post object (`additionalProperties: true` in the spec). */
export type SocialBuPost = {
  id: number | string
  account_id?: number | string
  account?: { id?: number | string } | null
  content?: string
  publish_at?: string | null
  published_at?: string | null
  published?: boolean
  _published?: boolean
  draft?: boolean
  permalink?: string | null
  url?: string | null
  error?: unknown
  result?: unknown
  status?: string
  [key: string]: unknown
}

export type SocialBuCreatePostResponse = {
  success?: boolean
  message?: string
  posts?: SocialBuPost[]
}

export type SocialBuUpdatePostBody = {
  publish_at?: string
  content?: string
  draft?: boolean
  publish_now?: boolean
}

// ─────────────────────────────── errors ───────────────────────────────

/** User-facing message for a SocialBu HTTP failure. */
export function socialBuErrorMessage(status: number, body: unknown): string {
  const detail = socialBuErrorDetail(body)
  if (status === 401 || status === 403) {
    return "SocialBu rejected the API token. Check SOCIALBU_API_TOKEN and reconnect SocialBu."
  }
  if (status === 404) return detail ? `SocialBu could not find that item: ${detail}` : "SocialBu could not find that item."
  if (status === 413) return "The media is too large for SocialBu."
  if (status === 422 || status === 400) {
    return detail ? `SocialBu rejected the request: ${detail}` : "SocialBu rejected the request."
  }
  if (status === 429) return "SocialBu rate limit reached. Try again in a minute."
  if (status >= 500) return "SocialBu is unavailable right now. Try again shortly."
  if (status === 0) return "Could not reach SocialBu. Check the network and try again."
  return detail ? `SocialBu request failed (${status}): ${detail}` : `SocialBu request failed (${status}).`
}

function socialBuErrorDetail(body: unknown): string {
  if (typeof body === "string") return body.trim().slice(0, 300)
  if (!body || typeof body !== "object") return ""
  const record = body as Record<string, unknown>
  // Laravel validation errors: { message, errors: { field: [msg, ...] } }.
  if (record.errors && typeof record.errors === "object") {
    for (const value of Object.values(record.errors as Record<string, unknown>)) {
      const first = Array.isArray(value) ? value[0] : value
      if (typeof first === "string" && first.trim()) return first.trim().slice(0, 300)
    }
  }
  for (const key of ["message", "error", "detail"]) {
    const value = record[key]
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 300)
  }
  return ""
}

/** Whether a failure is worth retrying later (rate limit, outage, network). */
export function isRetryableSocialBuError(error: unknown): boolean {
  if (error instanceof PublisherRequestError) {
    return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
  }
  return false
}

// ─────────────────────────────── client ───────────────────────────────

export type SocialBuClientOptions = {
  token: string
  baseUrl?: string
  fetch?: FetchLike
  /** Retries after the first attempt (default 3). */
  maxRetries?: number
  /** Base backoff in ms (default 500); doubles each retry, capped at 8 s. */
  retryBaseMs?: number
  /** Per-request timeout (default 30 s). */
  timeoutMs?: number
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>
  /** Upload-status polling (signed URL flow). */
  uploadPollAttempts?: number
  uploadPollIntervalMs?: number
}

type RequestOptions = {
  query?: Record<string, string | number | undefined>
  body?: unknown
  /** Retry 5xx/network failures (default: true for non-POST requests). */
  retryServerErrors?: boolean
}

const MAX_BACKOFF_MS = 8_000

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class SocialBuClient {
  private readonly token: string
  private readonly baseUrl: string
  private readonly fetchImpl: FetchLike
  private readonly maxRetries: number
  private readonly retryBaseMs: number
  private readonly timeoutMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly uploadPollAttempts: number
  private readonly uploadPollIntervalMs: number

  constructor(options: SocialBuClientOptions) {
    if (!options.token.trim()) throw new Error("SocialBu token is required")
    this.token = options.token.trim()
    this.baseUrl = (options.baseUrl ?? SOCIALBU_BASE_URL).replace(/\/+$/, "")
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init))
    this.maxRetries = Math.max(0, options.maxRetries ?? 3)
    this.retryBaseMs = Math.max(0, options.retryBaseMs ?? 500)
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.sleep = options.sleep ?? defaultSleep
    this.uploadPollAttempts = Math.max(1, options.uploadPollAttempts ?? 10)
    this.uploadPollIntervalMs = Math.max(0, options.uploadPollIntervalMs ?? 1_000)
  }

  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value))
    }
    const retryServerErrors = options.retryServerErrors ?? method.toUpperCase() !== "POST"
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.token}`,
    }
    if (options.body !== undefined) headers["Content-Type"] = "application/json"

    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await this.fetchImpl(url.toString(), {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: AbortSignal.timeout(this.timeoutMs),
        })
      } catch (error) {
        if (retryServerErrors && attempt < this.maxRetries) {
          await this.sleep(this.backoff(attempt))
          continue
        }
        throw new PublisherRequestError(0, socialBuErrorMessage(0, null), {
          cause: error instanceof Error ? error.message : String(error),
        })
      }

      const body = await readBody(response)
      if (response.ok) return body as T

      const retryable = response.status === 429 || (retryServerErrors && response.status >= 500)
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(this.backoff(attempt, response.headers.get("retry-after")))
        continue
      }
      throw new PublisherRequestError(response.status, socialBuErrorMessage(response.status, body), body)
    }
  }

  private backoff(attempt: number, retryAfter?: string | null): number {
    const seconds = retryAfter ? Number(retryAfter) : Number.NaN
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS * 4)
    return Math.min(this.retryBaseMs * 2 ** attempt, MAX_BACKOFF_MS)
  }

  /** All accounts (follows `nextPage`, at most 20 pages). */
  async listAccounts(): Promise<SocialBuAccount[]> {
    const accounts: SocialBuAccount[] = []
    let page: number | null = 1
    for (let i = 0; page && i < 20; i++) {
      const result: SocialBuPage<SocialBuAccount> | SocialBuAccount[] = await this.request("GET", "/accounts", {
        query: { page },
      })
      if (Array.isArray(result)) return result
      accounts.push(...(Array.isArray(result.items) ? result.items : []))
      page = typeof result.nextPage === "number" && result.nextPage > page ? result.nextPage : null
    }
    return accounts
  }

  async getSupportedOptions(accountIds?: readonly string[]): Promise<SocialBuSupportedOptions[]> {
    const result = await this.request<{ success?: boolean; accounts?: SocialBuSupportedOptions[] }>(
      "GET",
      "/posts/supported-options",
      { query: { account_ids: accountIds?.length ? accountIds.join(",") : undefined } }
    )
    return Array.isArray(result.accounts) ? result.accounts : []
  }

  /** Step 1 of the signed-URL upload. */
  async initiateUpload(input: { name: string; mime_type: string }): Promise<SocialBuSignedUpload> {
    const result = await this.request<SocialBuSignedUpload>("POST", "/upload_media", {
      body: input,
      retryServerErrors: true,
    })
    if (!result?.signed_url || !result.key) {
      throw new PublisherRequestError(502, "SocialBu did not return an upload URL.", result)
    }
    return result
  }

  /** Step 2: PUT the bytes to the pre-signed storage URL (no bearer token). */
  async putSignedUpload(signedUrl: string, bytes: Uint8Array, mime: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await this.fetchImpl(signedUrl, {
          method: "PUT",
          headers: {
            "Content-Type": mime,
            "Content-Length": String(bytes.byteLength),
            "x-amz-acl": "private",
          },
          body: bytes as unknown as BodyInit,
          signal: AbortSignal.timeout(this.timeoutMs * 2),
        })
      } catch (error) {
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoff(attempt))
          continue
        }
        throw new PublisherRequestError(0, socialBuErrorMessage(0, null), {
          cause: error instanceof Error ? error.message : String(error),
        })
      }
      if (response.ok) return
      if ((response.status === 429 || response.status >= 500) && attempt < this.maxRetries) {
        await this.sleep(this.backoff(attempt, response.headers.get("retry-after")))
        continue
      }
      const body = await readBody(response)
      throw new PublisherRequestError(
        response.status,
        `SocialBu storage rejected the upload (${response.status}).`,
        body
      )
    }
  }

  /** Step 3: check the upload; `upload_token` is set once `success` is true. */
  async uploadStatus(key: string): Promise<SocialBuUploadStatus> {
    return this.request<SocialBuUploadStatus>("GET", "/upload_media/status", { query: { key } })
  }

  /** Signed-URL flow end to end; resolves the `upload_token`. */
  async uploadBytes(input: { name: string; mime: string; bytes: Uint8Array }): Promise<{
    token: string
    upload: SocialBuSignedUpload
  }> {
    const upload = await this.initiateUpload({ name: input.name, mime_type: input.mime })
    await this.putSignedUpload(upload.signed_url, input.bytes, input.mime)
    for (let attempt = 0; attempt < this.uploadPollAttempts; attempt++) {
      const status = await this.uploadStatus(upload.key)
      if (status.success && status.upload_token) return { token: status.upload_token, upload }
      if (attempt < this.uploadPollAttempts - 1) await this.sleep(this.uploadPollIntervalMs)
    }
    throw new PublisherRequestError(504, "SocialBu did not confirm the media upload in time. Try again.", {
      key: upload.key,
    })
  }

  /** Single-step upload from an HTTP(S) or data URL. */
  async uploadByUrl(input: { url: string; name?: string }): Promise<SocialBuUploadByUrlResult> {
    const result = await this.request<SocialBuUploadByUrlResult>("POST", "/upload_media_by_url", {
      body: input,
      retryServerErrors: true,
    })
    if (!result?.upload_token) {
      throw new PublisherRequestError(502, socialBuErrorMessage(400, result), result)
    }
    return result
  }

  async createPost(body: SocialBuCreatePostBody): Promise<SocialBuCreatePostResponse> {
    const result = await this.request<SocialBuCreatePostResponse>("POST", "/posts", {
      body,
      retryServerErrors: false,
    })
    if (result?.success === false) {
      throw new PublisherRequestError(422, socialBuErrorMessage(422, result), result)
    }
    return result
  }

  async getPost(id: string): Promise<SocialBuPost> {
    return this.request<SocialBuPost>("GET", `/posts/${encodeURIComponent(id)}`)
  }

  async updatePost(id: string, body: SocialBuUpdatePostBody): Promise<SocialBuPost | Record<string, unknown>> {
    return this.request("PATCH", `/posts/${encodeURIComponent(id)}`, { body })
  }

  async deletePost(id: string): Promise<void> {
    await this.request("DELETE", `/posts/${encodeURIComponent(id)}`)
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "")
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
