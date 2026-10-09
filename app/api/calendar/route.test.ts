import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetMemoryRepositories, type Repositories } from "@/lib/data"

import { GET as getSummary } from "./summary/route"
import { GET } from "./route"

const WS = "vitest-user"
let repos: Repositories

beforeEach(() => {
  repos = resetMemoryRepositories()
  vi.stubEnv("SOCIALBU_API_TOKEN", "")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

async function calendar(query: string) {
  return GET(new Request(`http://localhost/api/calendar${query}`), undefined)
}

describe("/api/calendar", () => {
  it("validates the range", async () => {
    expect((await calendar("?from=nope")).status).toBe(400)
    expect((await calendar("?from=2026-10-10T00:00:00Z&to=2026-10-01T00:00:00Z")).status).toBe(400)
    expect((await calendar("?from=2026-01-01T00:00:00Z&to=2026-12-01T00:00:00Z")).status).toBe(400)
  })

  it("returns posts in the range for this workspace only", async () => {
    for (const [ws, key, publishAt] of [
      [WS, "a", "2026-10-05T09:00:00.000Z"],
      [WS, "b", "2026-12-05T09:00:00.000Z"],
      ["other", "c", "2026-10-06T09:00:00.000Z"],
    ] as const) {
      await repos.posts.upsertIntent(ws, {
        renderId: "render-1",
        provider: "tiktok",
        accountId: "101",
        status: "scheduled",
        publishAt,
        caption: "Hello",
        intentKey: key,
        createdBy: ws,
      })
    }
    const response = await calendar("?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z")
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { items: Array<{ datetime: string; status: string }>; summary: unknown }
    expect(payload.items.map((item) => [item.datetime, item.status])).toEqual([["2026-10-05T09:00:00.000Z", "scheduled"]])
    expect(payload.summary).toEqual({ needsAction: 0, failed: 0, planned: 1 })

    const summary = await getSummary(new Request("http://localhost/api/calendar/summary"), undefined)
    expect(await summary.json()).toMatchObject({ summary: { needsAction: 0, failed: 0 } })
  })
})
