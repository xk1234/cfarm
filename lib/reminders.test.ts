import { beforeEach, describe, expect, it, vi } from "vitest"

const { enqueueJob, getReminderSettings } = vi.hoisted(() => ({
  enqueueJob: vi.fn(),
  getReminderSettings: vi.fn(),
}))

vi.mock("@/lib/queue", () => ({ enqueueJob }))
vi.mock("@/lib/reminder-settings", () => ({ getReminderSettings }))

import { enqueueReminder } from "@/lib/reminders"

describe("enqueueReminder", () => {
  beforeEach(() => {
    enqueueJob.mockReset()
    getReminderSettings.mockResolvedValue({
      channel: "telegram",
      events: {
        generated: true,
        ready_to_post: true,
        scheduled_to_post: true,
      },
    })
  })

  it("does not create queue work when reminders are off", async () => {
    getReminderSettings.mockResolvedValue({
      channel: "none",
      events: {
        generated: true,
        ready_to_post: true,
        scheduled_to_post: true,
      },
    })
    await expect(
      enqueueReminder({
        event: "generated",
        sourceType: "slideshow",
        sourceId: "slide-1",
        text: "Generated",
      })
    ).resolves.toBeNull()
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it("creates a stable event-specific notification job", async () => {
    enqueueJob.mockResolvedValue({ id: "job-1", status: "enqueued" })

    await enqueueReminder({
      event: "ready_to_post",
      sourceType: "slideshow",
      sourceId: "slide-1",
      scheduledFor: "2026-07-19T02:00:00.000Z",
      availableAt: new Date("2026-07-19T02:00:00.000Z"),
      dedupeSuffix: "2026-07-19T02:00:00.000Z",
      text: "Slideshow ready to post",
    })

    expect(enqueueJob).toHaveBeenCalledWith({
      type: "send-notification",
      payload: {
        event: "ready_to_post",
        sourceType: "slideshow",
        sourceId: "slide-1",
        scheduledFor: "2026-07-19T02:00:00.000Z",
        requiresPostConfirmation: false,
        text: "Slideshow ready to post",
      },
      availableAt: new Date("2026-07-19T02:00:00.000Z"),
      dedupeKey:
        "reminder:ready_to_post:slideshow:slide-1:2026-07-19T02:00:00.000Z",
      maxAttempts: 5,
    })
  })
})
