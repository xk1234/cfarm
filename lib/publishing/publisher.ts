/**
 * Publishing contract. SocialBu (https://socialbu.com/api/v1, bearer token in
 * `SOCIALBU_API_TOKEN`) is the only provider; see
 * docs/refactor/socialbu-openapi.yaml. When the token is missing the app uses
 * `NotConfiguredPublisher` and shows "SocialBu not connected".
 */

import { SocialBuPublisher } from "./socialbu"

export const SOCIALBU_BASE_URL = "https://socialbu.com/api/v1"
export const SOCIALBU_TOKEN_ENV = "SOCIALBU_API_TOKEN"
export const PUBLISHER_NOT_CONNECTED_MESSAGE = "SocialBu not connected"

/** SocialBu account type (`tiktok`, `instagram`, `facebook`, …). */
export type SocialProvider = string

export type PublisherAccount = {
  /** SocialBu account id (stringified integer). */
  id: string
  provider: SocialProvider
  name: string
  /** false when SocialBu reports the account as disconnected. */
  active: boolean
  avatarUrl: string | null
  /** Provider-specific extras (e.g. TikTok `creator_info.privacy_level_options`). */
  extra: Record<string, unknown>
}

/** Exactly one of `bytes` (signed-URL upload) or `url` (`/upload_media_by_url`). */
export type UploadMediaInput =
  | { name: string; mime: string; bytes: Uint8Array; url?: never }
  | { name: string; mime: string; url: string; bytes?: never }

export type UploadedMedia = {
  /** SocialBu `upload_token`, passed to `createPost({ media })`. */
  token: string
  name: string
  mime: string
  sizeBytes: number | null
  previewUrl: string | null
}

export type CreatePostInput = {
  /** SocialBu account ids. */
  accounts: string[]
  caption: string
  /** Upload tokens from `uploadMedia`, in slide order (carousel/photo post). */
  media: string[]
  /** ISO 8601; omitted = publish now. */
  publishAt?: string | null
  draft?: boolean
  /** SocialBu `options` per provider, e.g. `{ tiktok: { privacy_status: "PUBLIC_TO_EVERYONE" } }`. */
  platformOptions?: Partial<Record<SocialProvider, Record<string, unknown>>>
  postbackUrl?: string
}

export type PublisherPostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "unknown"

export type PublisherPost = {
  /** SocialBu post id. */
  id: string
  accountId: string
  status: PublisherPostStatus
  publishAt: string | null
  publishedAt: string | null
  permalink: string | null
  error: string | null
}

export type CreatedPosts = { posts: PublisherPost[] }

export type PublisherStatus =
  | { configured: false; message: typeof PUBLISHER_NOT_CONNECTED_MESSAGE }
  | { configured: true; provider: "socialbu" }

export interface Publisher {
  readonly provider: "socialbu"
  readonly configured: boolean
  status(): PublisherStatus
  listAccounts(): Promise<PublisherAccount[]>
  uploadMedia(input: UploadMediaInput): Promise<UploadedMedia>
  /** One SocialBu post per account. */
  createPost(input: CreatePostInput): Promise<CreatedPosts>
  getPost(id: string): Promise<PublisherPost>
  /** Deletes a scheduled/draft post on SocialBu (optional; added by the publishing builder). */
  deletePost?(id: string): Promise<void>
  /** Moves a scheduled post to a new ISO time (optional; added by the publishing builder). */
  reschedulePost?(id: string, publishAt: string): Promise<PublisherPost>
}

export class PublisherNotConfiguredError extends Error {
  readonly code = "publisher.not_configured"
  constructor() {
    super(PUBLISHER_NOT_CONNECTED_MESSAGE)
    this.name = "PublisherNotConfiguredError"
  }
}

/** A SocialBu HTTP error; `status` is the HTTP status (422 = validation). */
export class PublisherRequestError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = "PublisherRequestError"
    this.status = status
    this.body = body
  }
}

export class NotConfiguredPublisher implements Publisher {
  readonly provider = "socialbu" as const
  readonly configured = false
  status(): PublisherStatus {
    return { configured: false, message: PUBLISHER_NOT_CONNECTED_MESSAGE }
  }
  async listAccounts(): Promise<PublisherAccount[]> {
    throw new PublisherNotConfiguredError()
  }
  async uploadMedia(_input: UploadMediaInput): Promise<UploadedMedia> {
    throw new PublisherNotConfiguredError()
  }
  async createPost(_input: CreatePostInput): Promise<CreatedPosts> {
    throw new PublisherNotConfiguredError()
  }
  async getPost(_id: string): Promise<PublisherPost> {
    throw new PublisherNotConfiguredError()
  }
  async deletePost(_id: string): Promise<void> {
    throw new PublisherNotConfiguredError()
  }
  async reschedulePost(_id: string, _publishAt: string): Promise<PublisherPost> {
    throw new PublisherNotConfiguredError()
  }
}

/** Minimal fetch signature so tests can inject a mocked HTTP layer. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type SocialBuPublisherOptions = {
  token: string
  baseUrl?: string
  fetch?: FetchLike
  /** Retries after the first attempt on 429/5xx (default 3). */
  maxRetries?: number
  /** Base backoff in ms (default 500). */
  retryBaseMs?: number
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>
  /** Signed-URL upload status polling. */
  uploadPollAttempts?: number
  uploadPollIntervalMs?: number
}

/** Kept for contract compatibility; no longer thrown. */
export class PublisherNotImplementedError extends Error {
  constructor() {
    super("The SocialBu publisher is not implemented yet")
    this.name = "PublisherNotImplementedError"
  }
}

/** SocialBu-backed publisher (`lib/publishing/socialbu.ts`). */
export function createSocialBuPublisher(options: SocialBuPublisherOptions): Publisher {
  return new SocialBuPublisher(options)
}

/** SocialBu `publish_at` format: `Y-m-d H:i:s` in UTC. */
export function toSocialBuDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso
  if (Number.isNaN(d.getTime())) throw new RangeError(`Invalid date: ${String(iso)}`)
  return d.toISOString().slice(0, 19).replace("T", " ")
}

export function isPublisherConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env[SOCIALBU_TOKEN_ENV]?.trim()
}

/** The configured publisher, or `NotConfiguredPublisher` when the token is missing. */
export function getPublisher(
  env: Record<string, string | undefined> = process.env,
  options: Omit<SocialBuPublisherOptions, "token"> = {}
): Publisher {
  const token = env[SOCIALBU_TOKEN_ENV]?.trim()
  if (!token) return new NotConfiguredPublisher()
  return createSocialBuPublisher({ ...options, token })
}
