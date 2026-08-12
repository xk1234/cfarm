import { randomUUID } from "node:crypto"

import { Query } from "node-appwrite"
import { afterAll, describe, expect, it } from "vitest"

import { RailwayTablesCompat } from "@/lib/railway/appwrite-compat"
import { closeRailwayDatabase } from "@/lib/railway/database"

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip

describeWithDatabase("RailwayTablesCompat PostgreSQL integration", () => {
  const tables = new RailwayTablesCompat()
  const suffix = randomUUID()
  const outputId = `compat-output-${suffix}`
  const jobIds = [0, 1, 2, 3, 4].map(
    (index) => `compat-job-${index}-${suffix}`
  )

  afterAll(async () => {
    await Promise.allSettled([
      tables.deleteRow("", "outputs", outputId),
      ...jobIds.map((jobId) => tables.deleteRow("", "jobs", jobId)),
    ])
    await closeRailwayDatabase()
  })

  it("keeps concurrent field patches and pushes filters into PostgreSQL", async () => {
    await tables.createRow("", "outputs", outputId, {
      owner_id: "compat-owner",
      status: "draft",
      left: "initial",
    })

    await expect(
      tables.createRow("", "outputs", outputId, { status: "duplicate" })
    ).rejects.toMatchObject({ code: 409 })

    await Promise.all([
      tables.updateRow("", "outputs", outputId, { left: "updated" }),
      tables.updateRow("", "outputs", outputId, { right: "preserved" }),
    ])

    const page = await tables.listRows("", "outputs", [
      Query.equal("owner_id", "compat-owner"),
      Query.equal("status", "draft"),
      Query.orderDesc("$createdAt"),
      Query.limit(5),
    ])
    expect(page.total).toBeGreaterThanOrEqual(1)
    expect(page.rows.find((row) => row.$id === outputId)).toMatchObject({
      left: "updated",
      right: "preserved",
    })
  })

  it("atomically claims each queued job once", async () => {
    const now = new Date().toISOString()
    await Promise.all(
      jobIds.slice(0, 3).map((jobId, index) =>
        tables.createRow("", "jobs", jobId, {
          status: "queued",
          type: "compat-integration",
          priority: index,
          available_at: now,
          created_at: now,
          attempts: 0,
        })
      )
    )

    const leaseUntil = new Date(Date.now() + 60_000).toISOString()
    const [first, second] = await Promise.all([
      tables.claimJobs({
        workerId: "compat-worker-a",
        limit: 2,
        leaseUntil,
        now,
        includeTypes: ["compat-integration"],
      }),
      tables.claimJobs({
        workerId: "compat-worker-b",
        limit: 2,
        leaseUntil,
        now,
        includeTypes: ["compat-integration"],
      }),
    ])

    const claimedIds = [...first, ...second].map((row) => row.$id)
    expect(claimedIds).toHaveLength(3)
    expect(new Set(claimedIds)).toHaveLength(3)

    await tables.createRow("", "jobs", jobIds[3], {
      status: "queued",
      type: "sync-post-analytics",
      priority: 1,
      available_at: now,
      created_at: now,
      attempts: 0,
    })
    await tables.createRow("", "jobs", jobIds[4], {
      status: "queued",
      type: "compat-allowed",
      priority: 1,
      available_at: now,
      created_at: now,
      attempts: 0,
    })
    const excluded = await tables.claimJobs({
      workerId: "compat-worker-c",
      limit: 2,
      leaseUntil,
      now,
      excludeTypes: ["sync-post-analytics"],
    })
    expect(excluded.map((row) => row.$id)).toContain(jobIds[4])
    expect(excluded.map((row) => row.$id)).not.toContain(jobIds[3])
  })

  it("replaces output media transactionally and cascades parent deletion", async () => {
    await tables.replaceRows({
      tableId: "output_media",
      parentAttribute: "output_id",
      parentValue: outputId,
      rows: [
        {
          rowId: `compat-media-${suffix}`,
          data: { output_id: outputId, url: "https://example.com/slide.png" },
        },
      ],
    })

    const beforeDelete = await tables.listRows("", "output_media", [
      Query.equal("output_id", outputId),
    ])
    expect(beforeDelete.total).toBe(1)

    await tables.deleteRow("", "outputs", outputId)
    const afterDelete = await tables.listRows("", "output_media", [
      Query.equal("output_id", outputId),
    ])
    expect(afterDelete.total).toBe(0)
  })
})
