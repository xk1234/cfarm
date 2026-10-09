import { describe, expect, it } from "vitest"

import { createMemoryRepositories } from "@/lib/data"
import {
  applyReminderSettingsInput,
  getReminderSettings,
  ReminderSettingsInputSchema,
  saveReminderSettings,
} from "@/lib/reminder-settings"

describe("reminder settings", () => {
  it("defaults to in-app with a one-hour lead", async () => {
    const repos = createMemoryRepositories()
    expect(await getReminderSettings("u1", repos)).toEqual({
      channel: "in_app",
      leadMinutes: [60],
      notificationDefaultsApplied: true,
      events: {
        render_finished: { channel: "in_app" },
        post_upcoming: { channel: "in_app", offsetsHours: [1] },
        post_published: { channel: "in_app" },
        publish_failed: { channel: "in_app" },
      },
    })
  })

  it("saves channel and lead minutes", async () => {
    const repos = createMemoryRepositories()
    const saved = await saveReminderSettings("u1", { channel: "none", leadMinutes: [15, 15, 1440] }, repos)
    expect(saved).toMatchObject({ channel: "none", leadMinutes: [15, 1440] })
    expect((await repos.settings.get("u1")).reminders).toEqual({ enabled: false, leadMinutes: [15, 1440] })
  })

  it("accepts the per-event form from the settings panel", () => {
    expect(
      applyReminderSettingsInput(
        { enabled: false, leadMinutes: [60] },
        {
          events: {
            render_finished: { channel: "none" },
            post_upcoming: { channel: "in_app", offsetsHours: [2, 24] },
          },
        }
      )
    ).toEqual({ enabled: true, leadMinutes: [120, 1440] })
    expect(
      applyReminderSettingsInput({ enabled: true, leadMinutes: [60] }, { events: { a: { channel: "none" } } })
    ).toEqual({ enabled: false, leadMinutes: [60] })
  })

  it("rejects unknown channels and empty input", () => {
    expect(ReminderSettingsInputSchema.safeParse({ channel: "telegram" }).success).toBe(false)
    expect(ReminderSettingsInputSchema.safeParse({}).success).toBe(false)
    expect(ReminderSettingsInputSchema.safeParse({ leadMinutes: [0] }).success).toBe(false)
  })
})
