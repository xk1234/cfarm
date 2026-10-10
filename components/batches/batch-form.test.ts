import { describe, expect, it } from "vitest"

import { getStarterTemplate } from "@/lib/renders/starters"

import {
  buildBatchRequest,
  EMPTY_BATCH_FORM,
  exampleItemsJson,
  parseItemsText,
} from "./batch-form"

describe("batch form", () => {
  it("parses JSON arrays, {items} objects and falls back to CSV", () => {
    expect(parseItemsText('[{"caption":"a"}]')).toEqual({
      ok: true,
      value: { items: [{ caption: "a" }] },
    })
    expect(parseItemsText('{"items":[{"caption":"b"}]}')).toEqual({
      ok: true,
      value: { items: [{ caption: "b" }] },
    })
    expect(parseItemsText("hook,caption\nA,B")).toEqual({
      ok: true,
      value: { csv: "hook,caption\nA,B" },
    })
    expect(parseItemsText("[1, 2]").ok).toBe(false)
    expect(parseItemsText("{oops").ok).toBe(false)
    expect(parseItemsText("  ").ok).toBe(false)
  })

  it("builds the request with picked accounts, or typed ids when SocialBu is not connected", () => {
    const form = {
      ...EMPTY_BATCH_FORM,
      templateId: "starter-photo-pill",
      itemsText: '[{"caption":"x"}]',
      accountIds: ["101"],
      manualAccountIds: "7, 8",
      timezone: "Europe/Paris",
      startDate: "2026-10-12",
      privacyStatus: "SELF_ONLY",
    }
    const connected = buildBatchRequest(form, { connected: true })
    expect(connected).toEqual({
      ok: true,
      request: {
        templateId: "starter-photo-pill",
        items: [{ caption: "x" }],
        schedule: {
          accountIds: ["101"],
          timesOfDay: ["09:00", "13:00", "19:00"],
          mode: "schedule",
          timezone: "Europe/Paris",
          startDate: "2026-10-12",
          maxPerAccountPerDay: 3,
          jitterMinutes: { min: 0, max: 10 },
          privacyStatus: "SELF_ONLY",
        },
      },
    })
    const offline = buildBatchRequest(form, { connected: false })
    expect(offline.ok && offline.request.schedule.accountIds).toEqual([
      "7",
      "8",
    ])
    expect(
      buildBatchRequest({ ...form, templateId: "" }, { connected: true })
    ).toEqual({ ok: false, error: "Choose a template." })
    expect(
      buildBatchRequest({ ...form, accountIds: [] }, { connected: true }).ok
    ).toBe(false)
  })

  it("derives an example item from the template slots", () => {
    const example = JSON.parse(
      exampleItemsJson(
        getStarterTemplate("starter-photo-pill")!.spec,
        "Sunsets"
      )
    )
    expect(example[0].slotValues.slides[0].image).toEqual({
      collection: "Sunsets",
      pick: "random",
    })
    expect(example[0].slotValues).not.toHaveProperty("pillColor")
  })
})
