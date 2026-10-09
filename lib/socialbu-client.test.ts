import { describe, expect, it, vi } from "vitest"

import { PublisherRequestError } from "@/lib/publishing/publisher"
import { createSocialBuMock, MOCK_BASE_URL } from "@/lib/publishing/testing"
import {
  isRetryableSocialBuError,
  SocialBuClient,
  socialBuErrorMessage,
} from "@/lib/socialbu-client"

function client(mock = createSocialBuMock(), extra: Partial<ConstructorParameters<typeof SocialBuClient>[0]> = {}) {
  const sleep = vi.fn(async () => undefined)
  return {
    mock,
    sleep,
    client: new SocialBuClient({
      token: "test-token",
      baseUrl: MOCK_BASE_URL,
      fetch: mock.fetch,
      sleep,
      uploadPollIntervalMs: 0,
      ...extra,
    }),
  }
}

describe("SocialBu client", () => {
  it("sends the bearer token and lists accounts", async () => {
    const { client: api, mock } = client()
    const accounts = await api.listAccounts()
    expect(accounts.map((account) => account.id)).toEqual([101, 202, 303])
    expect(mock.calls[0]).toMatchObject({ method: "GET", path: "/accounts" })
    expect(mock.calls[0]!.headers.authorization).toBe("Bearer test-token")
  })

  it("retries 429 and 5xx with backoff, honouring Retry-After", async () => {
    const { client: api, mock, sleep } = client()
    mock.fail({ method: "GET", path: "/accounts", status: 429, headers: { "retry-after": "2" } })
    mock.fail({ method: "GET", path: "/accounts", status: 503 })
    const accounts = await api.listAccounts()
    expect(accounts).toHaveLength(3)
    expect(mock.callsTo("GET", "/accounts")).toHaveLength(3)
    expect(sleep).toHaveBeenNthCalledWith(1, 2000)
    expect(sleep).toHaveBeenNthCalledWith(2, 1000)
  })

  it("gives up after maxRetries with a user-facing message", async () => {
    const { client: api, mock } = client(undefined, { maxRetries: 1 })
    mock.fail({ method: "GET", path: "/accounts", status: 429, times: 5 })
    const error = await api.listAccounts().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PublisherRequestError)
    expect((error as PublisherRequestError).status).toBe(429)
    expect((error as Error).message).toBe("SocialBu rate limit reached. Try again in a minute.")
    expect(mock.callsTo("GET", "/accounts")).toHaveLength(2)
    expect(isRetryableSocialBuError(error)).toBe(true)
  })

  it("never retries creating a post on a 5xx (it may have been created)", async () => {
    const { client: api, mock } = client()
    mock.fail({ method: "POST", path: "/posts", status: 500 })
    await expect(
      api.createPost({ accounts: [101], publish_at: "2026-10-09 10:00:00", content: "x" })
    ).rejects.toMatchObject({ status: 500, message: "SocialBu is unavailable right now. Try again shortly." })
    expect(mock.callsTo("POST", "/posts")).toHaveLength(1)
  })

  it("retries creating a post on 429 (the request was rejected)", async () => {
    const { client: api, mock } = client()
    mock.fail({ method: "POST", path: "/posts", status: 429 })
    const result = await api.createPost({ accounts: [101], publish_at: "2026-10-09 10:00:00", content: "x" })
    expect(result.posts).toHaveLength(1)
    expect(mock.callsTo("POST", "/posts")).toHaveLength(2)
  })

  it("maps validation, auth and network errors to readable messages", async () => {
    expect(
      socialBuErrorMessage(422, {
        message: "The given data was invalid.",
        errors: { "options.privacy_status": ["The privacy status field is required."] },
      })
    ).toBe("SocialBu rejected the request: The privacy status field is required.")
    expect(socialBuErrorMessage(401, null)).toMatch(/rejected the API token/)
    expect(socialBuErrorMessage(400, { message: "File too large" })).toBe(
      "SocialBu rejected the request: File too large"
    )

    const { client: unauthorized } = client(undefined, { token: "wrong" })
    await expect(unauthorized.listAccounts()).rejects.toMatchObject({ status: 401 })

    const offline = new SocialBuClient({
      token: "test-token",
      fetch: async () => {
        throw new TypeError("fetch failed")
      },
      sleep: async () => undefined,
      maxRetries: 1,
    })
    await expect(offline.listAccounts()).rejects.toMatchObject({
      status: 0,
      message: "Could not reach SocialBu. Check the network and try again.",
    })
  })

  it("uploads bytes through the signed-URL flow and polls until the token is ready", async () => {
    const mock = createSocialBuMock({ pendingUploadPolls: 2 })
    const { client: api } = client(mock)
    const bytes = new Uint8Array([137, 80, 78, 71])
    const { token, upload } = await api.uploadBytes({ name: "slide-01.png", mime: "image/png", bytes })

    expect(token).toBe(`token-${upload.key}`)
    expect(mock.callsTo("POST", "/upload_media")[0]!.body).toEqual({ name: "slide-01.png", mime_type: "image/png" })
    const put = mock.calls.find((call) => call.method === "PUT")!
    expect(put.headers).toMatchObject({
      "content-type": "image/png",
      "content-length": "4",
      "x-amz-acl": "private",
    })
    expect(put.headers.authorization).toBeUndefined()
    expect(mock.callsTo("GET", "/upload_media/status")).toHaveLength(3)
  })

  it("fails the upload when SocialBu never confirms it", async () => {
    const mock = createSocialBuMock({ pendingUploadPolls: 100 })
    const { client: api } = client(mock, { uploadPollAttempts: 3 })
    await expect(
      api.uploadBytes({ name: "a.png", mime: "image/png", bytes: new Uint8Array([1]) })
    ).rejects.toMatchObject({ status: 504 })
  })
})
