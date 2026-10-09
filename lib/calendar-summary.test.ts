import { describe, expect, it } from "vitest"

import { createMemoryRepositories } from "@/lib/data"
import type { ResolvedSpec } from "@/lib/render/spec"

import { calendarAlertSummaryFor } from "./calendar-summary"

const WS = "user_1"
const spec: ResolvedSpec = {
  version: 1,
  canvas: { width: 1080, height: 1350, background: "#000000" },
  fonts: [],
  slides: [{ id: "s1", background: "#000000", layers: [] }],
}

describe("calendarAlertSummaryFor", () => {
  it("counts draft and failed posts plus recent failed renders", async () => {
    const repos = createMemoryRepositories({ now: () => new Date("2026-10-09T08:00:00.000Z") })
    const base = { renderId: "r1", provider: "tiktok", caption: "", createdBy: WS, publishAt: "2026-10-10T09:00:00.000Z" }
    await repos.posts.upsertIntent(WS, { ...base, accountId: "1", intentKey: "a", status: "draft" })
    const { value: failed } = await repos.posts.upsertIntent(WS, { ...base, accountId: "2", intentKey: "b" })
    await repos.posts.update(WS, failed.id, { status: "failed", error: "boom" })
    await repos.posts.upsertIntent(WS, { ...base, accountId: "3", intentKey: "c" })
    const { value: render } = await repos.renders.create(WS, { spec, source: "ui", createdBy: WS })
    await repos.renders.markFailed(WS, render.id, "font missing")

    const summary = await calendarAlertSummaryFor(WS, { repos, now: new Date("2026-10-09T08:00:00.000Z") })
    expect(summary).toEqual({ needsAction: 1, failed: 2 })
    expect(await calendarAlertSummaryFor("user_2", { repos })).toEqual({ needsAction: 0, failed: 0 })
  })
})
