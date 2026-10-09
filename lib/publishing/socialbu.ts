/**
 * `Publisher` implementation backed by SocialBu (`lib/socialbu-client.ts`).
 *
 * Note: this module and `./publisher` import each other. Only use values from
 * `./publisher` inside functions, never at module top level.
 */
import {
  SocialBuClient,
  type SocialBuAccount,
  type SocialBuClientOptions,
  type SocialBuPost,
  type SocialBuSupportedOptions,
} from "@/lib/socialbu-client"

import {
  PublisherRequestError,
  toSocialBuDateTime,
  type CreatePostInput,
  type CreatedPosts,
  type Publisher,
  type PublisherAccount,
  type PublisherPost,
  type PublisherPostStatus,
  type PublisherStatus,
  type SocialBuPublisherOptions,
  type UploadMediaInput,
  type UploadedMedia,
} from "./publisher"

export class SocialBuPublisher implements Publisher {
  readonly provider = "socialbu" as const
  readonly configured = true
  readonly client: SocialBuClient
  private readonly now: () => Date

  constructor(options: SocialBuPublisherOptions & { now?: () => Date }) {
    const clientOptions: SocialBuClientOptions = {
      token: options.token,
      baseUrl: options.baseUrl,
      fetch: options.fetch,
      maxRetries: options.maxRetries,
      retryBaseMs: options.retryBaseMs,
      sleep: options.sleep,
      uploadPollAttempts: options.uploadPollAttempts,
      uploadPollIntervalMs: options.uploadPollIntervalMs,
    }
    this.client = new SocialBuClient(clientOptions)
    this.now = options.now ?? (() => new Date())
  }

  status(): PublisherStatus {
    return { configured: true, provider: "socialbu" }
  }

  async listAccounts(): Promise<PublisherAccount[]> {
    const accounts = await this.client.listAccounts()
    return accounts.flatMap((account) => {
      const mapped = mapSocialBuAccount(account)
      return mapped ? [mapped] : []
    })
  }

  async getSupportedOptions(accountIds?: readonly string[]): Promise<SocialBuSupportedOptions[]> {
    return this.client.getSupportedOptions(accountIds)
  }

  async uploadMedia(input: UploadMediaInput): Promise<UploadedMedia> {
    if (input.bytes) {
      const { token, upload } = await this.client.uploadBytes({
        name: input.name,
        mime: input.mime,
        bytes: input.bytes,
      })
      return {
        token,
        name: upload.name || input.name,
        mime: upload.mime_type || input.mime,
        sizeBytes: input.bytes.byteLength,
        previewUrl: upload.url ?? null,
      }
    }
    if (!input.url) throw new PublisherRequestError(400, "Media needs bytes or a URL.")
    const result = await this.client.uploadByUrl({ url: input.url, name: input.name })
    return {
      token: result.upload_token,
      name: result.name || input.name,
      mime: result.mime_type || input.mime,
      sizeBytes: typeof result.size === "number" ? result.size : null,
      previewUrl: result.url ?? null,
    }
  }

  async createPost(input: CreatePostInput): Promise<CreatedPosts> {
    const accounts = input.accounts.map((id) => {
      const numeric = Number(id)
      if (!Number.isInteger(numeric) || numeric <= 0) {
        throw new PublisherRequestError(400, `Invalid SocialBu account id "${id}".`)
      }
      return numeric
    })
    if (!accounts.length) throw new PublisherRequestError(400, "Choose at least one account.")
    // SocialBu takes one `options` object per request; network option keys do
    // not overlap in practice, so options for each provider are merged.
    const options = Object.assign({}, ...Object.values(input.platformOptions ?? {}).filter(Boolean)) as Record<
      string,
      unknown
    >
    const result = await this.client.createPost({
      accounts,
      content: input.caption,
      publish_at: toSocialBuDateTime(input.publishAt ?? this.now()),
      ...(input.draft ? { draft: true } : {}),
      existing_attachments: input.media.map((token) => ({ upload_token: token })),
      ...(Object.keys(options).length ? { options } : {}),
      ...(input.postbackUrl ? { postback_url: input.postbackUrl } : {}),
    })
    const posts = (result.posts ?? []).map((post) => mapSocialBuPost(post, this.now()))
    return { posts }
  }

  async getPost(id: string): Promise<PublisherPost> {
    const post = await this.client.getPost(id)
    const body = (post as { post?: SocialBuPost }).post ?? post
    return mapSocialBuPost(body, this.now())
  }

  async deletePost(id: string): Promise<void> {
    await this.client.deletePost(id)
  }

  async reschedulePost(id: string, publishAt: string): Promise<PublisherPost> {
    await this.client.updatePost(id, { publish_at: toSocialBuDateTime(publishAt) })
    return this.getPost(id)
  }
}

// ─────────────────────────────── mapping ───────────────────────────────

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/** `tiktok.profile` → `tiktok`; `twitter.*` → `x`. */
export function socialBuProvider(type: string | undefined): string {
  const base = (type ?? "").trim().toLowerCase().split(/[.:_\s]/)[0] || "unknown"
  if (base === "twitter") return "x"
  if (base === "google") return "google-business-profile"
  return base
}

export function mapSocialBuAccount(account: SocialBuAccount): PublisherAccount | null {
  const id = str(account.id)
  if (!id) return null
  const extra = { ...(record(account.extra_data) ?? {}) }
  if (account.type) extra.accountType = account.type
  return {
    id,
    provider: socialBuProvider(account.type),
    name: str(account.name) ?? `Account ${id}`,
    active: account.active !== false,
    avatarUrl: str(account.image) ?? str((account as Record<string, unknown>).avatar),
    extra,
  }
}

/** SocialBu returns `Y-m-d H:i:s` (UTC) or ISO strings. */
export function fromSocialBuDateTime(value: unknown): string | null {
  const raw = str(value)
  if (!raw) return null
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(raw) ? `${raw.replace(" ", "T")}Z` : raw
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function postError(post: SocialBuPost): string | null {
  const direct = str(post.error)
  if (direct) return direct
  const errorRecord = record(post.error)
  if (errorRecord) return str(errorRecord.message) ?? "SocialBu could not publish the post."
  const result = record(post.result)
  if (result) {
    const resultError = str(result.error) ?? str(record(result.error)?.message) ?? str(result.error_message)
    if (resultError) return resultError
    if (result.success === false) return str(result.message) ?? "SocialBu could not publish the post."
  }
  return null
}

function postPermalink(post: SocialBuPost): string | null {
  const result = record(post.result)
  const candidates = [post.permalink, result?.permalink, result?.url, result?.link, post.url]
  for (const candidate of candidates) {
    const value = str(candidate)
    if (value && /^https?:\/\//i.test(value)) return value
  }
  return null
}

export function mapSocialBuPost(post: SocialBuPost, now: Date = new Date()): PublisherPost {
  const id = str(post.id) ?? ""
  const accountId = str(post.account_id) ?? str(post.account?.id) ?? ""
  const publishAt = fromSocialBuDateTime(post.publish_at)
  const publishedAt = fromSocialBuDateTime(post.published_at)
  const error = postError(post)
  const rawStatus = str(post.status)?.toLowerCase() ?? ""

  let status: PublisherPostStatus
  if (post.draft === true || rawStatus === "draft") status = "draft"
  else if (error || rawStatus === "failed" || rawStatus === "error") status = "failed"
  else if (post.published === true || post._published === true || publishedAt || rawStatus === "published") {
    status = "published"
  } else if (publishAt && Date.parse(publishAt) > now.getTime()) status = "scheduled"
  else if (rawStatus === "scheduled" || rawStatus === "pending" || publishAt) status = "publishing"
  else status = "unknown"

  return {
    id,
    accountId,
    status,
    publishAt,
    publishedAt: status === "published" ? (publishedAt ?? publishAt) : publishedAt,
    permalink: postPermalink(post),
    error: status === "failed" ? (error ?? "SocialBu could not publish the post.") : null,
  }
}
