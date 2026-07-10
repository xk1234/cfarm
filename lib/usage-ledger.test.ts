import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  appendUsageRecords,
  recentUsageRecords,
  recentUsageKeys,
  usageKeyForHookCombination,
} from "@/lib/usage-ledger"

let rootDir: string

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-usage-ledger-"))
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe("usage ledger", () => {
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

    const stored = JSON.parse(
      await readFile(path.join(rootDir, "usage-ledger.json"), "utf8")
    )
    expect(stored.usage).toHaveLength(1)
    expect(stored.usage[0]).toMatchObject({
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

    const stored = JSON.parse(
      await readFile(path.join(rootDir, "usage-ledger.json"), "utf8")
    )
    expect(stored.usage[0]).toMatchObject({
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
