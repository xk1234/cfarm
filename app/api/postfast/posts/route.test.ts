import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "cfarm-postfast-posts-route-")
  )
  await mkdir(path.join(tempRoot, "data"), { recursive: true })
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("GET /api/postfast/posts", () => {
  it("does not expose local scheduled posts when PostFast is not configured", async () => {
    vi.stubEnv("POSTFAST_API_KEY", "")
    const { upsertPostFastPostRecord } = await import("@/lib/postfast-posts")
    await upsertPostFastPostRecord({
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
    const response = await GET(
      new Request(
        "http://localhost/api/postfast/posts?startDate=2026-07-01T00%3A00%3A00.000Z&endDate=2026-07-31T23%3A59%3A59.999Z"
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.configured).toBe(false)
    expect(payload.posts.posts).toEqual([])
  })

  it("returns only live PostFast posts from actual configured accounts", async () => {
    vi.stubEnv("POSTFAST_API_KEY", "key_123")
    const { upsertPostFastPostRecord } = await import("@/lib/postfast-posts")
    await upsertPostFastPostRecord({
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              id: "postfast-post-1",
              content: "Real scheduled post",
              scheduledAt: "2026-07-03T18:00:00.000Z",
              socialMediaId: "real-tiktok-1",
              status: "SCHEDULED",
            },
          ],
        })
      )
    )

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/postfast/posts?startDate=2026-07-01T00%3A00%3A00.000Z&endDate=2026-07-31T23%3A59%3A59.999Z"
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.configured).toBe(true)
    expect(payload.posts.posts).toEqual([
      expect.objectContaining({
        id: "postfast-post-1",
        content: "Real scheduled post",
        socialMediaId: "real-tiktok-1",
      }),
    ])
    expect(payload.posts.posts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ content: "Local QA post" }),
      ])
    )
  })

  it("enriches remote PostFast posts with local source metadata for calendar grouping", async () => {
    vi.stubEnv("POSTFAST_API_KEY", "key_123")
    const { upsertPostFastPostRecord } = await import("@/lib/postfast-posts")
    await upsertPostFastPostRecord({
      rootDir: path.join(tempRoot, "data"),
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      postfastPostId: "postfast-scheduled-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "scheduled",
      scheduledAt: "2026-07-03T15:00:00.000Z",
      content: "Scheduled slideshow",
      media: [{ key: "image/slide-1.png", type: "IMAGE", sortOrder: 0 }],
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: [
            {
              id: "postfast-scheduled-1",
              content: "Scheduled slideshow",
              socialMediaId: "tiktok-1",
              status: "SCHEDULED",
              scheduledAt: "2026-07-03T15:00:00.000Z",
            },
          ],
        })
      )
    )

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/postfast/posts?startDate=2026-07-01T00%3A00%3A00.000Z&endDate=2026-07-31T23%3A59%3A59.999Z"
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.posts.posts).toEqual([
      expect.objectContaining({
        id: "postfast-scheduled-1",
        sourceId: "slideshow-1",
        sourceType: "slideshow",
        integration: expect.objectContaining({
          id: "tiktok-1",
          providerIdentifier: "tiktok",
        }),
      }),
    ])
  })

  it("does not synthesize dated calendar rows from unscheduled drafts", async () => {
    vi.stubEnv("POSTFAST_API_KEY", "key_123")
    const { upsertPostFastPostRecord } = await import("@/lib/postfast-posts")
    await upsertPostFastPostRecord({
      rootDir: path.join(tempRoot, "data"),
      sourceType: "slideshow",
      sourceId: "slideshow-1:tiktok:draft",
      postfastPostId: "postfast-draft-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "draft",
      content: "Draft slideshow",
      media: [],
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [] }))
    )

    const { GET } = await import("./route")
    const response = await GET(
      new Request(
        "http://localhost/api/postfast/posts?startDate=2000-01-01T00%3A00%3A00.000Z&endDate=2100-01-01T00%3A00%3A00.000Z"
      )
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.posts.posts).toEqual([])
  })
})
