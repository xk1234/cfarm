import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { listPostFastPostRecords, upsertPostFastPostRecord, updatePostFastPostAnalytics } from "@/lib/postfast-posts"

let rootDir: string

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-postfast-"))
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

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
      analytics: [{ label: "Views", data: [{ date: "2026-07-02", total: "100" }], percentageChange: 10 }],
    })

    expect(updated?.analytics?.[0]?.label).toBe("Views")
    expect(updated?.lastAnalyticsSyncedAt).toBeTruthy()
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

    const records = await listPostFastPostRecords({ rootDir, sourceType: "slideshow" })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      status: "scheduled",
    })
  })
})
