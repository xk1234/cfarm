import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getReminderSettings: vi.fn(),
  saveReminderSettings: vi.fn(),
  publicReminderSettings: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock("@/lib/reminder-settings", () => ({
  reminderEvents: [
    "generated",
    "ready_to_post",
    "scheduled_to_post",
    "respond_to_comments",
    "publish_failed",
  ],
  reminderEventMetadata: {},
  getReminderSettings: mocks.getReminderSettings,
  saveReminderSettings: mocks.saveReminderSettings,
  publicReminderSettings: mocks.publicReminderSettings,
}))

import { GET, PUT } from "@/app/api/settings/reminders/route"

const settings = {
  id: "reminders",
  events: {
    generated: { channel: "none" as const },
    ready_to_post: { channel: "none" as const },
    scheduled_to_post: { channel: "none" as const },
    respond_to_comments: {
      channel: "none" as const,
      offsetsHours: [24, 72],
    },
    publish_failed: { channel: "none" as const },
  },
  updatedAt: "2026-07-18T00:00:00.000Z",
}

describe("reminder settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUser.mockResolvedValue({ $id: "user-1" })
    mocks.getReminderSettings.mockResolvedValue(settings)
    mocks.publicReminderSettings.mockImplementation((value) => value)
    mocks.saveReminderSettings.mockResolvedValue(settings)
  })

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it("saves in-app notification routing", async () => {
    const events = {
      ...settings.events,
      ready_to_post: { channel: "in_app" as const },
    }
    const response = await PUT(jsonRequest("PUT", { events }))
    expect(response.status).toBe(200)
    expect(mocks.saveReminderSettings).toHaveBeenCalledWith({ events })
  })

  it("rejects external delivery channels", async () => {
    const response = await PUT(
      jsonRequest("PUT", {
        events: {
          ...settings.events,
          generated: { channel: "telegram" },
        },
      })
    )
    expect(response.status).toBe(400)
    expect(mocks.saveReminderSettings).not.toHaveBeenCalled()
  })
})

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/settings/reminders", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
