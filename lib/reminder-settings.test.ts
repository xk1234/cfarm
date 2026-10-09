import { describe, expect, it } from "vitest"

import {
  getReminderSettings,
  normalizeReminderSettings,
  saveReminderSettings,
} from "@/lib/reminder-settings"
import { deleteJsonArrayRecord } from "@/lib/json-store"
import { withSystemOwner } from "@/lib/system-owner-context"
import path from "node:path"

describe("reminder settings", () => {
  it("ignores legacy global-channel and boolean events without losing modern siblings", () => {
    expect(
      normalizeReminderSettings({
        channel: "telegram",
        events: {
          generated: true,
          ready_to_post: { channel: "in_app" },
          scheduled_to_post: false,
          unknown_event: true,
        },
      })
    ).toEqual({
      id: "reminders",
      notificationDefaultsApplied: false,
      events: {
        generated: { channel: "none" },
        ready_to_post: { channel: "in_app" },
        scheduled_to_post: { channel: "none" },
        respond_to_comments: {
          channel: "none",
          offsetsHours: [24, 72],
        },
        publish_failed: { channel: "none" },
      },
      updatedAt: new Date(0).toISOString(),
    })
  })

  it("maps legacy Telegram routing to in-app delivery and drops Telegram fields", () => {
    const settings = normalizeReminderSettings({
      telegramChatId: "123456",
      telegramBotToken: "secret",
      events: { ready_to_post: { channel: "telegram" } },
    })
    expect(settings?.events.ready_to_post).toEqual({ channel: "in_app" })
    expect(settings).not.toHaveProperty("telegramChatId")
    expect(settings).not.toHaveProperty("telegramBotToken")
  })

  it("ignores offsets for events that do not support delays", () => {
    expect(
      normalizeReminderSettings({
        events: {
          generated: { channel: "in_app", offsetsHours: [24] },
          respond_to_comments: {
            channel: "in_app",
            offsetsHours: [72, -1, 24, 72],
          },
        },
      })
    ).toMatchObject({
      events: {
        generated: { channel: "in_app" },
        respond_to_comments: {
          channel: "in_app",
          offsetsHours: [24, 72],
        },
      },
    })
    expect(
      normalizeReminderSettings({
        events: {
          generated: { channel: "in_app", offsetsHours: [24] },
        },
      })?.events.generated
    ).not.toHaveProperty("offsetsHours")
  })

  it("persists one private reminder policy", async () => {
    const ownerId = `reminder-test-${Date.now()}`.slice(0, 36)
    const rootDir = path.join(process.cwd(), "data", "settings")
    await withSystemOwner(ownerId, async () => {
      try {
        await saveReminderSettings({
          events: {
            generated: { channel: "none" },
            ready_to_post: { channel: "in_app" },
            scheduled_to_post: { channel: "none" },
            respond_to_comments: {
              channel: "in_app",
              offsetsHours: [24, 72],
            },
            publish_failed: { channel: "none" },
          },
        })
        await expect(getReminderSettings()).resolves.toMatchObject({
          id: "reminders",
          events: {
            generated: { channel: "none" },
            ready_to_post: { channel: "in_app" },
            scheduled_to_post: { channel: "none" },
          },
        })
      } finally {
        await deleteJsonArrayRecord({
          rootDir,
          fileName: "reminders.json",
          key: "settings",
          id: "reminders",
        })
      }
    })
  })
})
