import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { listPostizPostRecords, upsertPostizPostRecord, updatePostizPostAnalytics } from "@/lib/postiz-posts"

let rootDir: string

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-postiz-"))
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe("postiz post mapping persistence", () => {
  it("upserts records by local source and stores Postiz ids", async () => {
    const created = await upsertPostizPostRecord({
      rootDir,
      sourceType: "generated_video",
      sourceId: "export-1",
      postizPostId: "post-1",
      integrationId: "integration-1",
      provider: "x",
      status: "draft",
      content: "Draft copy",
      media: [{ id: "media-1", path: "https://uploads.postiz.com/image.png" }],
    })
    const updated = await upsertPostizPostRecord({
      rootDir,
      sourceType: "generated_video",
      sourceId: "export-1",
      postizPostId: "post-2",
      integrationId: "integration-1",
      provider: "x",
      status: "scheduled",
      scheduledAt: "2026-07-03T08:00:00.000Z",
      content: "Updated copy",
      media: [],
    })

    const records = await listPostizPostRecords({ rootDir })

    expect(records).toHaveLength(1)
    expect(updated.id).toBe(created.id)
    expect(records[0]).toMatchObject({
      sourceType: "generated_video",
      sourceId: "export-1",
      postizPostId: "post-2",
      status: "scheduled",
      scheduledAt: "2026-07-03T08:00:00.000Z",
    })
  })

  it("updates analytics cache for a tracked Postiz post", async () => {
    const record = await upsertPostizPostRecord({
      rootDir,
      sourceType: "asset",
      sourceId: "asset-1",
      postizPostId: "post-1",
      integrationId: "integration-1",
      provider: "tiktok",
      status: "published",
      content: "Posted",
      media: [],
    })

    const updated = await updatePostizPostAnalytics({
      rootDir,
      id: record.id,
      analytics: [{ label: "Views", data: [{ date: "2026-07-02", total: "100" }], percentageChange: 10 }],
    })

    expect(updated?.analytics?.[0]?.label).toBe("Views")
    expect(updated?.lastAnalyticsSyncedAt).toBeTruthy()
  })

  it("tracks scheduled slideshow posts as first-class Postiz sources", async () => {
    await upsertPostizPostRecord({
      rootDir,
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      postizPostId: "post-slideshow-1",
      integrationId: "tiktok-1",
      provider: "tiktok",
      status: "scheduled",
      scheduledAt: "2026-07-03T15:00:00.000Z",
      content: "Scheduled slideshow",
      media: [{ id: "media-1", path: "https://uploads.postiz.com/slide-1.jpg" }],
    })

    const records = await listPostizPostRecords({ rootDir, sourceType: "slideshow" })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      sourceType: "slideshow",
      sourceId: "slideshow-1",
      status: "scheduled",
    })
  })
})
