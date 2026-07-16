import path from "node:path"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { clearTestTables } from "@/lib/test-helpers"
import { listPostFastPostRecords } from "@/lib/postfast-posts"
import type { PostFastSocialIntegration } from "@/lib/postfast-client"
import {
  publishAutomationRun,
  publishPost,
  statusForType,
  type PublishRequest,
} from "@/lib/publishing"

// Appwrite-only: `data/postfast-posts.json` -> `postfast_posts`, run against
// cfarm (forced by vitest.setup.ts), cleared between tests.
function tempRoot() {
  return path.join(process.cwd(), "data")
}

const clearPosts = () => clearTestTables("postfast_posts")

beforeEach(clearPosts)
afterAll(clearPosts)

const okRequest: PublishRequest = async () => ({ postIds: ["pf-123"] }) as never
const failRequest: PublishRequest = async () => {
  throw new Error("PostFast 500")
}

describe("statusForType", () => {
  it("maps type -> post status", () => {
    expect(statusForType("now")).toBe("published")
    expect(statusForType("schedule")).toBe("scheduled")
    expect(statusForType("draft")).toBe("draft")
  })
})

describe("publishPost", () => {
  it("records a published post on success", async () => {
    const rootDir = tempRoot()
    const res = await publishPost({
      type: "now",
      integrationId: "int-1",
      provider: "tiktok",
      content: "hello",
      sourceType: "automation",
      sourceId: "run-1",
      rootDir,
      request: okRequest,
    })
    expect(res.ok).toBe(true)
    expect(res.record.status).toBe("published")
    expect(res.record.postfastPostId).toBe("pf-123")
    const stored = await listPostFastPostRecords({ rootDir })
    expect(stored).toHaveLength(1)
    expect(stored[0].status).toBe("published")
  })

  it("records a failed post (never throws) on error", async () => {
    const rootDir = tempRoot()
    const res = await publishPost({
      type: "now",
      integrationId: "int-1",
      provider: "tiktok",
      content: "hello",
      sourceType: "automation",
      sourceId: "run-2",
      rootDir,
      request: failRequest,
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain("PostFast 500")
    expect(res.record.status).toBe("failed")
  })
})

describe("publishAutomationRun", () => {
  const integrations: PostFastSocialIntegration[] = [
    { provider: "tiktok", integration_id: "int-1", name: "TT" },
    { provider: "instagram", integration_id: "int-2", name: "IG" },
    {
      provider: "youtube",
      integration_id: "int-3",
      name: "YT",
      disabled: true,
    },
  ]

  it("publishes each active integration and skips disabled ones", async () => {
    const rootDir = tempRoot()
    const res = await publishAutomationRun({
      runId: "run-3",
      scheduledFor: "2026-07-16T03:00:00.000Z",
      integrations,
      content: "caption #tag",
      postfastRootDir: rootDir,
      request: okRequest,
      now: new Date("2026-07-15T03:00:00.000Z"),
    })
    expect(res.published).toBe(2)
    expect(res.failed).toBe(0)
    const stored = await listPostFastPostRecords({ rootDir })
    expect(stored).toHaveLength(2)
    expect(stored.every((r) => r.sourceId === "run-3")).toBe(true)
  })

  it("counts failures without throwing", async () => {
    const rootDir = tempRoot()
    const res = await publishAutomationRun({
      runId: "run-4",
      scheduledFor: "2026-07-16T03:00:00.000Z",
      integrations,
      content: "caption",
      postfastRootDir: rootDir,
      request: failRequest,
      now: new Date("2026-07-15T03:00:00.000Z"),
    })
    expect(res.published).toBe(0)
    expect(res.failed).toBe(2)
  })

  it("publishes automation slides with their uploaded media keys", async () => {
    const requests: unknown[] = []
    const media = [
      { key: "slides/run-5/slide-1.png", type: "IMAGE" as const, sortOrder: 0 },
      { key: "slides/run-5/slide-2.png", type: "IMAGE" as const, sortOrder: 1 },
    ]
    const result = await publishAutomationRun({
      runId: "run-5",
      scheduledFor: "2026-07-16T03:00:00.000Z",
      integrations: [integrations[0]],
      content: "caption with slides",
      media,
      postfastRootDir: tempRoot(),
      request: async (_path, options) => {
        requests.push(options.body)
        return { postIds: ["pf-with-media"] } as never
      },
      now: new Date("2026-07-15T03:00:00.000Z"),
    })

    expect(result.published).toBe(1)
    expect(requests[0]).toMatchObject({
      posts: [
        {
          mediaItems: [
            { key: media[0].key, type: "IMAGE", sortOrder: 0 },
            { key: media[1].key, type: "IMAGE", sortOrder: 1 },
          ],
        },
      ],
    })
    expect(result.records[0].media).toEqual(media)
  })

  it("publishes immediately when a queued job is recovered after its slot", async () => {
    const requests: unknown[] = []
    const rootDir = tempRoot()
    const res = await publishAutomationRun({
      runId: "run-late",
      scheduledFor: "2026-07-16T03:00:00.000Z",
      integrations: [integrations[0]],
      content: "late caption",
      postfastRootDir: rootDir,
      now: new Date("2026-07-16T04:00:00.000Z"),
      request: async (_path, options) => {
        requests.push(options.body)
        return { postIds: ["pf-late"] } as never
      },
    })

    expect(res.published).toBe(1)
    expect(requests[0]).toMatchObject({
      status: "SCHEDULED",
      posts: [{ status: "SCHEDULED" }],
    })
    expect(requests[0]).not.toMatchObject({
      posts: [{ scheduledAt: "2026-07-16T03:00:00.000Z" }],
    })
  })
})
