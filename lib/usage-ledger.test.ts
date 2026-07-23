import path from "node:path"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { clearTestTables } from "@/lib/test-helpers"
import {
  appendUsageRecords,
  deleteUsageRecords,
  listUsageRecords,
  recentUsageRecords,
  recentUsageKeys,
  usageRecordsForPublishedRuns,
  usageKeyForHookCombination,
} from "@/lib/usage-ledger"

// Appwrite-only: the store maps `data/usage-ledger.json` -> the `usage_ledger`
// table, so tests use the real data root and run against the cfarm DB
// (forced by vitest.setup.ts). Rows are cleared between tests for isolation.
const rootDir = path.join(process.cwd(), "data")
const TABLE = "usage_ledger"

const clearUsageLedger = () => clearTestTables(TABLE)

beforeEach(clearUsageLedger)
afterAll(clearUsageLedger)

describe("usage ledger", () => {
  it("removes usage for deleted runs without touching other runs", async () => {
    await appendUsageRecords({
      rootDir,
      records: [
        {
          automation_id: "automation-a",
          kind: "image",
          key: "image-a",
          run_id: "run-deleted",
          used_at: "2026-07-07T10:00:00.000Z",
        },
        {
          automation_id: "automation-a",
          kind: "image",
          key: "image-b",
          run_id: "run-kept",
          used_at: "2026-07-07T10:00:00.000Z",
        },
      ],
    })

    await deleteUsageRecords({ rootDir, runIds: ["run-deleted"] })

    await expect(
      recentUsageKeys("image", "automation-a", { rootDir, allTime: true })
    ).resolves.toEqual(new Set(["image-b"]))
  })

  it("tracks recent usage keys by automation and kind while pruning old records", async () => {
    await appendUsageRecords({
      rootDir,
      now: new Date("2026-07-07T10:00:00.000Z"),
      pruneOlderThanDays: 14,
      records: [
        {
          automation_id: "automation-a",
          kind: "image",
          key: "image-a",
          run_id: "run-new",
          used_at: "2026-07-07T10:00:00.000Z",
        },
        {
          automation_id: "automation-a",
          kind: "image",
          key: "image-old",
          run_id: "run-old",
          used_at: "2026-06-01T10:00:00.000Z",
        },
        {
          automation_id: "automation-b",
          kind: "image",
          key: "image-b",
          run_id: "run-other",
          used_at: "2026-07-07T10:00:00.000Z",
        },
      ],
    })

    await appendUsageRecords({
      rootDir,
      now: new Date("2026-07-07T10:01:00.000Z"),
      pruneOlderThanDays: 14,
      records: [],
    })

    await expect(
      recentUsageKeys("image", "automation-a", {
        rootDir,
        withinDays: 14,
        now: new Date("2026-07-07T10:01:00.000Z"),
      })
    ).resolves.toEqual(new Set(["image-a"]))
  })

  it("builds stable hook-combination keys from template substitutions", () => {
    expect(
      usageKeyForHookCombination("hello [[zodiac]] with [[charm]]", {
        charm: "jade ring",
        zodiac: "taurus",
      })
    ).toBe("hello [[zodiac]] with [[charm]]::charm=jade ring|zodiac=taurus")
  })

  it("uses only published runs for cross-generation deduplication", () => {
    const records = [
      {
        automation_id: "automation-a",
        kind: "image" as const,
        key: "published-image",
        run_id: "published-run",
        used_at: "2026-07-07T10:00:00.000Z",
      },
      {
        automation_id: "automation-a",
        kind: "text" as const,
        key: "published text",
        run_id: "published-run",
        used_at: "2026-07-07T10:00:00.000Z",
      },
      {
        automation_id: "automation-a",
        kind: "hook_published" as const,
        key: "published hook",
        run_id: "published-run",
        used_at: "2026-07-07T11:00:00.000Z",
      },
      {
        automation_id: "automation-a",
        kind: "image" as const,
        key: "draft-image",
        run_id: "draft-run",
        used_at: "2026-07-07T12:00:00.000Z",
      },
      {
        automation_id: "automation-a",
        kind: "text" as const,
        key: "draft text",
        run_id: "draft-run",
        used_at: "2026-07-07T12:00:00.000Z",
      },
    ]

    expect(usageRecordsForPublishedRuns(records, "automation-a")).toEqual([
      { ...records[0], used_at: "2026-07-07T11:00:00.000Z" },
      { ...records[1], used_at: "2026-07-07T11:00:00.000Z" },
      records[2],
    ])
  })

  it("persists publication markers used to activate deduplication", async () => {
    await appendUsageRecords({
      rootDir,
      records: [
        {
          automation_id: "automation-a",
          kind: "image",
          key: "published-image",
          run_id: "published-run",
          used_at: "2026-07-07T10:00:00.000Z",
        },
        {
          automation_id: "automation-a",
          kind: "hook_published",
          key: "published hook",
          run_id: "published-run",
          used_at: "2026-07-07T11:00:00.000Z",
        },
        {
          automation_id: "automation-a",
          kind: "image",
          key: "draft-image",
          run_id: "draft-run",
          used_at: "2026-07-07T12:00:00.000Z",
        },
      ],
    })

    const records = await listUsageRecords({ rootDir })
    expect(
      usageRecordsForPublishedRuns(records, "automation-a")
        .filter((record) => record.kind === "image")
        .map((record) => record.key)
    ).toEqual(["published-image"])
  })

  it("keeps published hook history permanently available", async () => {
    await appendUsageRecords({
      rootDir,
      now: new Date("2026-07-07T10:00:00.000Z"),
      pruneOlderThanDays: 14,
      records: [
        {
          automation_id: "automation-a",
          kind: "hook_published",
          key: "an old hook",
          run_id: "run-old",
          used_at: "2025-01-01T00:00:00.000Z",
        },
      ],
    })

    await expect(
      recentUsageKeys("hook_published", "automation-a", {
        rootDir,
        allTime: true,
      })
    ).resolves.toEqual(new Set(["an old hook"]))
  })

  it("dedupes repeated records for the same run kind and key", async () => {
    await appendUsageRecords({
      rootDir,
      now: new Date("2026-07-07T10:00:00.000Z"),
      records: [
        {
          automation_id: "automation-a",
          kind: "image",
          key: "image-a",
          run_id: "run-1",
          used_at: "2026-07-07T10:00:00.000Z",
        },
        {
          automation_id: "automation-a",
          kind: "image",
          key: "image-a",
          run_id: "run-1",
          used_at: "2026-07-07T10:00:00.000Z",
        },
      ],
    })

    const stored = await recentUsageRecords("image", "automation-a", {
      rootDir,
      now: new Date("2026-07-07T10:01:00.000Z"),
    })
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      automation_id: "automation-a",
      kind: "image",
      key: "image-a",
      run_id: "run-1",
    })
  })

  it("filters recent keys by account when an account key is provided", async () => {
    await appendUsageRecords({
      rootDir,
      now: new Date("2026-07-07T10:00:00.000Z"),
      records: [
        {
          automation_id: "automation-a",
          account_key: "tiktok:main",
          kind: "image",
          key: "image-main",
          run_id: "run-main",
          used_at: "2026-07-07T10:00:00.000Z",
        },
        {
          automation_id: "automation-a",
          account_key: "instagram:backup",
          kind: "image",
          key: "image-backup",
          run_id: "run-backup",
          used_at: "2026-07-07T10:00:00.000Z",
        },
      ],
    })

    await expect(
      recentUsageKeys("image", "automation-a", {
        accountKey: "tiktok:main",
        rootDir,
        now: new Date("2026-07-07T10:01:00.000Z"),
      })
    ).resolves.toEqual(new Set(["image-main"]))
  })

  it("stores text usage records for generated output dedupe", async () => {
    await appendUsageRecords({
      rootDir,
      now: new Date("2026-07-07T10:00:00.000Z"),
      records: [
        {
          automation_id: "automation-a",
          account_key: "tiktok:main",
          kind: "text",
          key: "title body cta",
          run_id: "run-text",
          used_at: "2026-07-07T10:00:00.000Z",
        },
      ],
    })

    const stored = await recentUsageRecords("text", "automation-a", {
      accountKey: "tiktok:main",
      rootDir,
      now: new Date("2026-07-07T10:01:00.000Z"),
    })
    expect(stored[0]).toMatchObject({
      automation_id: "automation-a",
      account_key: "tiktok:main",
      kind: "text",
      key: "title body cta",
      run_id: "run-text",
    })
  })

  it("returns recent records with newest timestamps for least-recent fallback decisions", async () => {
    await appendUsageRecords({
      rootDir,
      now: new Date("2026-07-07T10:00:00.000Z"),
      records: [
        {
          automation_id: "automation-a",
          account_key: "tiktok:main",
          kind: "image",
          key: "image-old",
          run_id: "run-old",
          used_at: "2026-07-01T10:00:00.000Z",
        },
        {
          automation_id: "automation-a",
          account_key: "tiktok:main",
          kind: "image",
          key: "image-new",
          run_id: "run-new",
          used_at: "2026-07-07T09:00:00.000Z",
        },
      ],
    })

    await expect(
      recentUsageRecords("image", "automation-a", {
        accountKey: "tiktok:main",
        rootDir,
        now: new Date("2026-07-07T10:00:00.000Z"),
      })
    ).resolves.toMatchObject([
      { key: "image-new", used_at: "2026-07-07T09:00:00.000Z" },
      { key: "image-old", used_at: "2026-07-01T10:00:00.000Z" },
    ])
  })
})
