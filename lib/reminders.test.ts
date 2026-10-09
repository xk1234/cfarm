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
      events: {
        generated: { channel: "in_app" },
        ready_to_post: { channel: "in_app" },
        scheduled_to_post: { channel: "in_app" },
        respond_to_comments: {
          channel: "in_app",
          offsetsHours: [24, 72],
        },
      },
    })
  })

  it("does not create queue work when reminders are off", async () => {
    getReminderSettings.mockResolvedValue({
      events: {
        generated: { channel: "none" },
        ready_to_post: { channel: "in_app" },
        scheduled_to_post: { channel: "in_app" },
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

  it("keeps comment reminder offsets in distinct dedupe keys", async () => {
    await Promise.all(
      [24, 72].map((offsetHours) =>
        enqueueReminder({
          event: "respond_to_comments",
          sourceType: "automation",
          sourceId: "post-1",
          availableAt: new Date(
            `2026-07-${offsetHours === 24 ? "27" : "29"}T04:00:00.000Z`
          ),
          dedupeSuffix: `${offsetHours}h`,
          text: "Respond to comments",
        })
      )
    )

    expect(enqueueJob.mock.calls.map(([job]) => job.dedupeKey)).toEqual([
      "reminder:respond_to_comments:automation:post-1:24h",
      "reminder:respond_to_comments:automation:post-1:72h",
    ])
  })
})
