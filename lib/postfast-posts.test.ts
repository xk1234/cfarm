import path from "node:path"

import { Query } from "node-appwrite"
import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { clearTestTables } from "@/lib/test-helpers"
import {
  listPostFastPostRecords,
  upsertPostFastPostRecord,
  updatePostFastPostAnalytics,
} from "@/lib/postfast-posts"

// Appwrite-only: `data/postfast-posts.json` -> the `postfast_posts` table, run
// against cfarm (forced by vitest.setup.ts), cleared between tests.
const rootDir = path.join(process.cwd(), "data")
const TABLE = "postfast_posts"

const clearPosts = () => clearTestTables(TABLE)

beforeEach(clearPosts)
afterAll(clearPosts)

describe("postfast post mapping persistence", () => {
  it("upserts records by local source and stores PostFast ids", async () => {
    const created = await upsertPostFastPostRecord({
      rootDir,
      sourceType: "generated_video",
      sourceId: "export-1",
      postfastPostId: "post-1",
      integrationId: "integration-1",
      provider: "x",
      status: "draft",
      content: "Draft copy",
      media: [{ key: "image/uploaded.png", type: "IMAGE" }],
    })
    const updated = await upsertPostFastPostRecord({
      rootDir,
      sourceType: "generated_video",
      sourceId: "export-1",
      postfastPostId: "post-2",
      integrationId: "integration-1",
      provider: "x",
      status: "scheduled",
      scheduledAt: "2026-07-03T08:00:00.000Z",
      content: "Updated copy",
      media: [],
    })

    const records = await listPostFastPostRecords({ rootDir })

    expect(records).toHaveLength(1)
    expect(updated.id).toBe(created.id)
    expect(records[0]).toMatchObject({
      sourceType: "generated_video",
      sourceId: "export-1",
      postfastPostId: "post-2",
      status: "scheduled",
      scheduledAt: "2026-07-03T08:00:00.000Z",
    })
  })

  it("updates analytics cache for a tracked PostFast post", async () => {
    const record = await upsertPostFastPostRecord({
      rootDir,
      sourceType: "asset",
      sourceId: "asset-1",
      postfastPostId: "post-1",
      integrationId: "integration-1",
      provider: "tiktok",
      status: "published",
      content: "Posted",
      media: [],
    })

    const updated = await updatePostFastPostAnalytics({
      rootDir,
      id: record.id,
      analytics: [
        {
          label: "Views",
          data: [{ date: "2026-07-02", total: "100" }],
          percentageChange: 10,
        },
      ],
    })

    expect(updated?.analytics?.[0]?.label).toBe("Views")
    expect(updated?.lastAnalyticsSyncedAt).toBeTruthy()
    expect(record.publishedAt).toBeTruthy()
    expect(Number.isFinite(Date.parse(record.publishedAt ?? ""))).toBe(true)
  })

  it("tracks scheduled slideshow posts as first-class PostFast sources", async () => {
    await upsertPostFastPostRecord({
      rootDir,
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      postfastPostId: "post-slideshow-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "scheduled",
      scheduledAt: "2026-07-03T15:00:00.000Z",
      content: "Scheduled slideshow",
      media: [{ key: "image/slide-1.jpg", type: "IMAGE" }],
    })

    const records = await listPostFastPostRecords({
      rootDir,
      sourceType: "slideshow",
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      status: "scheduled",
    })
  })
})
