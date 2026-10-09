import { beforeEach, describe, expect, it } from "vitest"

import { resetMemoryRepositories } from "@/lib/data"

import { GET, PUT } from "./route"

beforeEach(() => {
  resetMemoryRepositories()
})

function put(body: unknown) {
  return PUT(
    new Request("http://localhost/api/settings/reminders", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    undefined
  )
}

describe("/api/settings/reminders", () => {
  it("reads defaults with event metadata", async () => {
    const response = await GET(new Request("http://localhost/api/settings/reminders"), undefined)
    const payload = (await response.json()) as { settings: { channel: string }; eventMetadata: Record<string, unknown> }
    expect(payload.settings.channel).toBe("in_app")
    expect(Object.keys(payload.eventMetadata)).toEqual([
      "render_finished",
      "post_upcoming",
      "post_published",
      "publish_failed",
    ])
  })

  it("switches notifications off and accepts the legacy per-event body", async () => {
    expect(await (await put({ channel: "none" })).json()).toMatchObject({ settings: { channel: "none" } })
    const legacy = await put({
      notificationDefaultsApplied: true,
      events: { post_upcoming: { channel: "in_app", offsetsHours: [3] } },
    })
    expect(await legacy.json()).toMatchObject({ settings: { channel: "in_app", leadMinutes: [180] } })
    expect((await put({ channel: "telegram" })).status).toBe(400)
  })
})
