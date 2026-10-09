/**
 * Test support: an in-process SocialBu HTTP mock implementing the endpoints in
 * docs/refactor/socialbu-openapi.yaml that LumenClip calls. Pass `mock.fetch`
 * as the publisher's `fetch` (or stub the global fetch with it).
 */
import type { SocialBuAccount, SocialBuPost } from "@/lib/socialbu-client"

export type RecordedCall = {
  method: string
  url: string
  path: string
  headers: Record<string, string>
  body: unknown
}

export type InjectedFailure = {
  method?: string
  /** Path prefix relative to the API base, e.g. `/posts`. */
  path: string
  status: number
  body?: unknown
  headers?: Record<string, string>
  /** How many requests fail (default 1). */
  times?: number
}

export type SocialBuMockOptions = {
  baseUrl?: string
  accounts?: SocialBuAccount[]
  /** Status polls that report "still uploading" before success. */
  pendingUploadPolls?: number
}

export type SocialBuMock = {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
  calls: RecordedCall[]
  posts: Map<string, SocialBuPost>
  fail: (failure: InjectedFailure) => void
  callsTo: (method: string, path: string) => RecordedCall[]
}

export const MOCK_BASE_URL = "https://socialbu.test/api/v1"
const STORAGE_ORIGIN = "https://storage.socialbu.test"

export const DEFAULT_MOCK_ACCOUNTS: SocialBuAccount[] = [
  {
    id: 101,
    type: "tiktok.profile",
    name: "TikTok Creator",
    active: true,
    image: "https://cdn.socialbu.test/tt.png",
    extra_data: { creator_info: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] } },
  },
  { id: 202, type: "instagram.api", name: "Insta Brand", active: true, image: null },
  { id: 303, type: "facebook.page", name: "Old Page", active: false },
]

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

export function createSocialBuMock(options: SocialBuMockOptions = {}): SocialBuMock {
  const baseUrl = (options.baseUrl ?? MOCK_BASE_URL).replace(/\/+$/, "")
  const accounts = options.accounts ?? DEFAULT_MOCK_ACCOUNTS
  const calls: RecordedCall[] = []
  const failures: InjectedFailure[] = []
  const posts = new Map<string, SocialBuPost>()
  const uploads = new Map<string, { polls: number; uploaded: boolean }>()
  let uploadSeq = 0
  let postSeq = 9000

  async function handle(input: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase()
    const url = new URL(input)
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((value, key) => (headers[key] = value))
    let body: unknown = undefined
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    } else if (init.body) {
      body = init.body
    }

    if (url.origin === STORAGE_ORIGIN) {
      calls.push({ method, url: input, path: url.pathname, headers, body })
      const failure = takeFailure(method, url.pathname)
      if (failure) return json(failure.status, failure.body ?? "", failure.headers)
      const key = url.pathname.split("/").pop() ?? ""
      const upload = uploads.get(key)
      if (method !== "PUT" || !upload) return json(404, { message: "no such upload" })
      upload.uploaded = true
      return new Response(null, { status: 200 })
    }

    const path = url.href.startsWith(baseUrl) ? url.pathname.slice(new URL(baseUrl).pathname.length) : url.pathname
    calls.push({ method, url: input, path, headers, body })
    const failure = takeFailure(method, path)
    if (failure) return json(failure.status, failure.body ?? { message: "injected" }, failure.headers)
    if (headers.authorization !== "Bearer test-token") return json(401, { message: "Unauthenticated." })

    if (method === "GET" && path === "/accounts") {
      return json(200, { items: accounts, currentPage: 1, lastPage: 1, nextPage: null, total: accounts.length })
    }
    if (method === "POST" && path === "/upload_media") {
      const record = body as { name?: string; mime_type?: string }
      if (!record?.name || !record.mime_type) {
        return json(422, { message: "The given data was invalid.", errors: { name: ["The name field is required."] } })
      }
      const key = `key-${++uploadSeq}`
      uploads.set(key, { polls: 0, uploaded: false })
      return json(200, {
        name: record.name,
        mime_type: record.mime_type,
        signed_url: `${STORAGE_ORIGIN}/put/${key}`,
        key,
        secure_key: `secure-${key}`,
        url: `https://cdn.socialbu.test/${key}`,
      })
    }
    if (method === "GET" && path === "/upload_media/status") {
      const key = url.searchParams.get("key") ?? ""
      const upload = uploads.get(key)
      if (!upload) return json(404, { message: "Not found" })
      upload.polls++
      if (!upload.uploaded || upload.polls <= (options.pendingUploadPolls ?? 0)) {
        return json(200, { success: false, message: "Uploading", upload_token: null })
      }
      return json(200, { success: true, message: "Uploaded", upload_token: `token-${key}` })
    }
    if (method === "POST" && path === "/upload_media_by_url") {
      const record = body as { url?: string; name?: string }
      if (!record?.url) return json(422, { message: "The url field is required." })
      const key = `key-${++uploadSeq}`
      return json(200, {
        success: true,
        name: record.name ?? "file.png",
        mime_type: "image/png",
        size: 1234,
        key,
        upload_token: `token-${key}`,
        url: `https://cdn.socialbu.test/${key}`,
      })
    }
    if (method === "POST" && path === "/posts") {
      const record = body as {
        accounts?: number[]
        publish_at?: string
        content?: string
        draft?: boolean
        existing_attachments?: Array<{ upload_token: string }>
        options?: Record<string, unknown>
      }
      if (!record?.accounts?.length || !record.publish_at) {
        return json(422, { message: "The given data was invalid.", errors: { accounts: ["Select an account."] } })
      }
      const created = record.accounts.map((accountId) => {
        const post: SocialBuPost = {
          id: ++postSeq,
          account_id: accountId,
          content: record.content,
          publish_at: record.publish_at,
          draft: record.draft ?? false,
          published: false,
          attachments: record.existing_attachments,
          options: record.options,
        }
        posts.set(String(post.id), post)
        return post
      })
      return json(200, { success: true, posts: created })
    }
    const postMatch = /^\/posts\/(\d+)$/.exec(path)
    if (postMatch) {
      const post = posts.get(postMatch[1]!)
      if (!post) return json(404, { message: "Not found" })
      if (method === "GET") return json(200, post)
      if (method === "DELETE") {
        posts.delete(postMatch[1]!)
        return new Response(null, { status: 200 })
      }
      if (method === "PATCH") {
        Object.assign(post, body as object)
        return json(200, { success: true, post })
      }
    }
    return json(404, { message: `No mock for ${method} ${path}` })
  }

  function takeFailure(method: string, path: string): InjectedFailure | null {
    const index = failures.findIndex(
      (failure) => (!failure.method || failure.method === method) && path.startsWith(failure.path)
    )
    if (index < 0) return null
    const failure = failures[index]!
    const remaining = (failure.times ?? 1) - 1
    if (remaining <= 0) failures.splice(index, 1)
    else failures[index] = { ...failure, times: remaining }
    return failure
  }

  return {
    fetch: handle,
    calls,
    posts,
    fail: (failure) => failures.push(failure),
    callsTo: (method, path) => calls.filter((call) => call.method === method && call.path === path),
  }
}
