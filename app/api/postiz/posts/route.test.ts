import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), "cfarm-postiz-posts-route-"))
  await mkdir(path.join(tempRoot, "data"), { recursive: true })
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("GET /api/postiz/posts", () => {
  it("does not expose local scheduled posts when Postiz is not configured", async () => {
    vi.stubEnv("POSTIZ_API_KEY", "")
    const { upsertPostizPostRecord } = await import("@/lib/postiz-posts")
    await upsertPostizPostRecord({
      rootDir: path.join(tempRoot, "data"),
      sourceType: "automation",
      sourceId: "run-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "scheduled",
      scheduledAt: "2026-07-03T15:00:00.000Z",
      content: "Daily hooks",
      media: [],
    })

    const { GET } = await import("./route")
    const response = await GET(new Request("http://localhost/api/postiz/posts?startDate=2026-07-01T00%3A00%3A00.000Z&endDate=2026-07-31T23%3A59%3A59.999Z"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.configured).toBe(false)
    expect(payload.posts.posts).toEqual([])
  })

  it("returns only live Postiz posts from actual configured accounts", async () => {
    vi.stubEnv("POSTIZ_API_KEY", "key_123")
    const { upsertPostizPostRecord } = await import("@/lib/postiz-posts")
    await upsertPostizPostRecord({
      rootDir: path.join(tempRoot, "data"),
      sourceType: "automation",
      sourceId: "local-run-1",
      integrationId: "local-automation",
      provider: "tiktok",
      status: "scheduled",
      scheduledAt: "2026-07-03T15:00:00.000Z",
      content: "Local QA post",
      media: [],
    })
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      posts: [
        {
          id: "postiz-post-1",
          content: "Real scheduled post",
          publishDate: "2026-07-03T18:00:00.000Z",
          integration: {
            id: "real-tiktok-1",
            providerIdentifier: "tiktok",
            name: "Brand TikTok",
          },
        },
      ],
    })))

    const { GET } = await import("./route")
    const response = await GET(new Request("http://localhost/api/postiz/posts?startDate=2026-07-01T00%3A00%3A00.000Z&endDate=2026-07-31T23%3A59%3A59.999Z"))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.configured).toBe(true)
    expect(payload.posts.posts).toEqual([
      expect.objectContaining({
        id: "postiz-post-1",
        content: "Real scheduled post",
        integration: expect.objectContaining({
          id: "real-tiktok-1",
          providerIdentifier: "tiktok",
        }),
      }),
    ])
    expect(payload.posts.posts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ content: "Local QA post" }),
    ]))
  })
})
