import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
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

const okRequest: PublishRequest = async () =>
  ({ postIds: ["pf-123"] }) as never
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
    { provider: "youtube", integration_id: "int-3", name: "YT", disabled: true },
  ]

  it("publishes each active integration and skips disabled ones", async () => {
    const rootDir = tempRoot()
    const res = await publishAutomationRun({
      runId: "run-3",
      integrations,
      content: "caption #tag",
      postfastRootDir: rootDir,
      request: okRequest,
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
      integrations,
      content: "caption",
      postfastRootDir: rootDir,
      request: failRequest,
    })
    expect(res.published).toBe(0)
    expect(res.failed).toBe(2)
  })
})
