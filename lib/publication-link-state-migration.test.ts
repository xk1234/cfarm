import { describe, expect, it } from "vitest"

import {
  migratePublicationLinkState,
  type LegacyPostFastPostRecord,
} from "@/lib/publication-link-state-migration"
import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"

describe("publication link-state migration", () => {
  it("applies every backfill rule and is idempotent", () => {
    const records = [
      publication("manual", {
        externallyManaged: true,
        postfastPostId: "remote-manual",
        status: "published",
      }),
      publication("postfast", {
        postfastPostId: "remote-postfast",
        status: "published",
      }),
      publication("unknown", { status: "draft" }),
    ]
    const snapshots = [
      snapshot("manual", "tiktok_studio"),
      snapshot("postfast", "postfast"),
      snapshot("postfast", "tiktok_studio"),
    ]

    const first = migratePublicationLinkState(records, snapshots)
    const second = migratePublicationLinkState(first.records, snapshots)

    expect(first.changed).toBe(3)
    expect(first.records).toEqual([
      expect.objectContaining({
        id: "manual",
        linkState: "manually_linked",
        statsSources: ["tiktok_studio"],
      }),
      expect.objectContaining({
        id: "postfast",
        linkState: "postfast_published",
        statsSources: ["postfast", "tiktok_studio"],
      }),
      expect.objectContaining({
        id: "unknown",
        linkState: "unlinked",
        statsSources: [],
      }),
    ])
    expect(first.records[0]).not.toHaveProperty("externallyManaged")
    expect(second.changed).toBe(0)
    expect(second.records).toEqual(first.records)
  })
})

function publication(
  id: string,
  overrides: Partial<LegacyPostFastPostRecord>
): LegacyPostFastPostRecord {
  return {
    id,
    sourceType: "external",
    sourceId: `source-${id}`,
    integrationId: "tiktok-1",
    provider: "tiktok",
    status: "draft",
    content: id,
    media: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  }
}

function snapshot(
  postId: string,
  source: "postfast" | "tiktok_studio"
): PostFastMetricSnapshot {
  return {
    id: `${postId}-${source}`,
    postId,
    integrationId: "tiktok-1",
    provider: "tiktok",
    capturedAt: "2026-07-02T00:00:00.000Z",
    metrics: {},
    latestMetric: {},
    rawMetrics: {},
    observedKeys: [],
    source,
  }
}
