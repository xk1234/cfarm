import { describe, expect, it } from "vitest"

import {
  canonicalRowFields,
  outputMediaRowFields,
} from "@/lib/consolidated-records"
import type { StoreRoute } from "@/lib/appwrite-stores"

describe("consolidated record projections", () => {
  it("keeps permanent asset file metadata in the domain record, not duplicate columns", () => {
    const route: StoreRoute = {
      table: "permanent_assets",
      sourceKey: "uploaded_asset",
      public: false,
    }
    const record = {
      id: "asset-1",
      name: "Asset",
      bytes: 123,
      width: 640,
      height: 480,
      durationMs: 1200,
      tags: ["demo"],
      parentId: "collection-1",
    }

    const fields = canonicalRowFields(route, record, record)

    expect(fields).not.toHaveProperty("bytes")
    expect(fields).not.toHaveProperty("width")
    expect(fields).not.toHaveProperty("height")
    expect(fields).not.toHaveProperty("duration_ms")
    expect(fields).not.toHaveProperty("tags")
    expect(fields).not.toHaveProperty("parent_id")
    expect(JSON.parse(String(fields.data))).toMatchObject(record)
  })

  it("stores output media as a lean ordered reference", () => {
    const fields = outputMediaRowFields("output-row", "owner-1", {
      kind: "image",
      role: "slide",
      position: 2,
      url: "/api/local-assets/slideshows/example.png",
    })

    expect(fields).toMatchObject({
      output_id: "output-row",
      owner_id: "owner-1",
      kind: "image",
      role: "slide",
      position: 2,
    })
    expect(fields).not.toHaveProperty("permanent_asset_id")
    expect(fields).not.toHaveProperty("mime_type")
    expect(fields).not.toHaveProperty("data")
  })

  it("omits unused generic columns from dedicated ledger and snapshot tables", () => {
    for (const table of [
      "usage_ledger",
      "postfast_metric_snapshots",
      "account_follower_snapshots",
    ]) {
      const fields = canonicalRowFields(
        { table, sourceKey: table, public: false },
        { id: "row-1", name: "Unused", status: "Unused" },
        { id: "row-1" }
      )
      expect(fields).not.toHaveProperty("name")
      expect(fields).not.toHaveProperty("status")
    }
  })
})
