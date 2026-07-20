import { describe, expect, it } from "vitest"

import {
  automationHookItems,
  selectHook,
  usageForPublishedRuns,
} from "./slideshow-automation.js"

function schema() {
  return {
    hooks: [
      { id: "published", text: "Published hook", enabled: true },
      { id: "fresh", text: "Fresh hook", enabled: true },
      { id: "disabled", text: "Disabled hook", enabled: false },
    ],
    hook_slots: {},
    hook_no_duplicate_slots: false,
    prompt_formatting: { hook_case: "mixed", narrative: "Legacy hook" },
    schedule: { timezone: "UTC" },
    reuse_policy: { hook_exclusion_days: 45 },
  }
}

describe("scheduled worker hook selection", () => {
  it("uses enabled catalog items and excludes only recently published hooks", () => {
    const value = schema()
    expect(automationHookItems(value).map((item) => item.id)).toEqual([
      "published",
      "fresh",
    ])

    const selected = selectHook({
      schema: value,
      wordCollections: [],
      usage: [
        {
          automation_id: "automation-1",
          kind: "hook_published",
          key: "published hook",
          used_at: "2026-07-17T12:00:00.000Z",
        },
      ],
      automationId: "automation-1",
      scheduledFor: "2026-07-18T12:00:00.000Z",
      seed: Buffer.from([0]),
    })

    expect(selected).toMatchObject({ hookId: "fresh", text: "Fresh hook" })
  })

  it("does not treat legacy generation-time usage as publication", () => {
    const value = schema()
    value.hooks = [{ id: "draft", text: "Draft-only hook", enabled: true }]

    const selected = selectHook({
      schema: value,
      wordCollections: [],
      usage: [
        {
          automation_id: "automation-1",
          kind: "hook",
          key: "draft-only hook",
          used_at: "2026-07-18T11:00:00.000Z",
        },
      ],
      automationId: "automation-1",
      scheduledFor: "2026-07-18T12:00:00.000Z",
      seed: Buffer.from([0]),
    })

    expect(selected).toMatchObject({ hookId: "draft", text: "Draft-only hook" })
  })
})

describe("scheduled worker anti-duplication history", () => {
  it("excludes draft usage and keeps usage from published runs", () => {
    const usage = [
      {
        automation_id: "automation-1",
        kind: "image",
        key: "published-image",
        run_id: "published-run",
      },
      {
        automation_id: "automation-1",
        kind: "hook_published",
        key: "published hook",
        run_id: "published-run",
      },
      {
        automation_id: "automation-1",
        kind: "image",
        key: "draft-image",
        run_id: "draft-run",
      },
    ]

    expect(usageForPublishedRuns(usage, "automation-1")).toEqual(
      usage.slice(0, 2)
    )
  })
})
