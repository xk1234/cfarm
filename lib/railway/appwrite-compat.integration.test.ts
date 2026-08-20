import { randomUUID } from "node:crypto"

import { Query } from "node-appwrite"
import { afterAll, describe, expect, it } from "vitest"

import { RailwayRecordStore } from "@/lib/railway/appwrite-compat"
import { closeRailwayDatabase } from "@/lib/railway/database"

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip

describeWithDatabase("RailwayRecordStore PostgreSQL integration", () => {
  const records = new RailwayRecordStore()
  const suffix = randomUUID()
  const outputId = `compat-output-${suffix}`

  afterAll(async () => {
    await Promise.allSettled([records.deleteRow("", "outputs", outputId)])
    await closeRailwayDatabase()
  })

  it("keeps concurrent field patches and pushes filters into PostgreSQL", async () => {
    await records.createRow("", "outputs", outputId, {
      owner_id: "compat-owner",
      status: "draft",
      left: "initial",
    })

    await expect(
      records.createRow("", "outputs", outputId, { status: "duplicate" })
    ).rejects.toMatchObject({ code: 409 })

    await Promise.all([
      records.updateRow("", "outputs", outputId, { left: "updated" }),
      records.updateRow("", "outputs", outputId, { right: "preserved" }),
    ])

    const page = await records.listRows("", "outputs", [
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

  it("replaces output media transactionally and cascades parent deletion", async () => {
    await records.replaceRows({
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

    const beforeDelete = await records.listRows("", "output_media", [
      Query.equal("output_id", outputId),
    ])
    expect(beforeDelete.total).toBe(1)

    await records.deleteRow("", "outputs", outputId)
    const afterDelete = await records.listRows("", "output_media", [
      Query.equal("output_id", outputId),
    ])
    expect(afterDelete.total).toBe(0)
  })
})
