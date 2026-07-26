import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enqueueReminder: vi.fn(),
  getReminderSettings: vi.fn(),
}))

vi.mock("@/lib/reminders", () => ({
  enqueueReminder: mocks.enqueueReminder,
}))
vi.mock("@/lib/reminder-settings", () => ({
  getReminderSettings: mocks.getReminderSettings,
}))

import { enqueuePublishedCommentReminders } from "@/lib/publishing"

describe("published comment reminders", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getReminderSettings.mockResolvedValue({
      events: {
        respond_to_comments: {
          channel: "telegram",
          offsetsHours: [24, 72],
        },
      },
    })
    mocks.enqueueReminder.mockResolvedValue({ id: "job" })
  })

  it("enqueues each configured offset from an injected clock", async () => {
    const now = new Date("2026-07-26T04:00:00.000Z")
    await enqueuePublishedCommentReminders({
      sourceType: "automation",
      sourceId: "post-1",
      content: "A useful post\nMore copy",
      releaseUrl: "https://www.tiktok.com/@creator/video/123",
      now,
    })

    expect(mocks.enqueueReminder).toHaveBeenCalledTimes(2)
    expect(mocks.enqueueReminder).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: "respond_to_comments",
        dedupeSuffix: "24h",
        availableAt: new Date("2026-07-27T04:00:00.000Z"),
        text: expect.stringContaining(
          "https://www.tiktok.com/@creator/video/123"
        ),
      })
    )
    expect(mocks.enqueueReminder).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        dedupeSuffix: "72h",
        availableAt: new Date("2026-07-29T04:00:00.000Z"),
      })
    )
  })
})
