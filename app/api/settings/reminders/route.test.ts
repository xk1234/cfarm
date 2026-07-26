import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getReminderSettings: vi.fn(),
  configureTelegramWebhook: vi.fn(),
  saveReminderSettings: vi.fn(),
  sendTelegramReminder: vi.fn(),
  telegramReminderConfiguration: vi.fn(),
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
    "generation_failed",
  ],
  reminderEventMetadata: {},
  configureTelegramWebhook: mocks.configureTelegramWebhook,
  getReminderSettings: mocks.getReminderSettings,
  saveReminderSettings: mocks.saveReminderSettings,
  sendTelegramReminder: mocks.sendTelegramReminder,
  telegramReminderConfiguration: mocks.telegramReminderConfiguration,
  publicReminderSettings: mocks.publicReminderSettings,
}))

import { GET, POST, PUT } from "@/app/api/settings/reminders/route"

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
    generation_failed: { channel: "none" as const },
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
    mocks.telegramReminderConfiguration.mockReturnValue({
      botConfigured: false,
      defaultChatConfigured: false,
      interactiveConfigured: false,
    })
    mocks.configureTelegramWebhook.mockResolvedValue({ configured: false })
  })

  it("requires authentication", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it("saves no-reminder mode even when Telegram is not configured", async () => {
    const response = await PUT(
      jsonRequest("PUT", {
        events: settings.events,
      })
    )
    expect(response.status).toBe(200)
    expect(mocks.saveReminderSettings).toHaveBeenCalledWith({
      events: settings.events,
    })
  })

  it("does not enable Telegram without a server bot token", async () => {
    const response = await PUT(
      jsonRequest("PUT", {
        telegramChatId: "123456",
        events: {
          ...settings.events,
          generated: { channel: "telegram" },
        },
      })
    )
    expect(response.status).toBe(400)
    expect(mocks.saveReminderSettings).not.toHaveBeenCalled()
  })

  it("enables generation notifications when Telegram is first linked", async () => {
    mocks.telegramReminderConfiguration.mockReturnValue({
      botConfigured: true,
      defaultChatConfigured: false,
      interactiveConfigured: true,
    })
    const response = await PUT(
      jsonRequest("PUT", {
        telegramChatId: "123456",
        notificationDefaultsApplied: false,
        events: settings.events,
      })
    )
    expect(response.status).toBe(200)
    expect(mocks.saveReminderSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationDefaultsApplied: true,
        events: expect.objectContaining({
          generated: { channel: "telegram" },
        }),
      })
    )
  })

  it("sends a test before any event is wired to Telegram", async () => {
    // Proving the connection works is the step that comes BEFORE choosing
    // events, so the test must not require one to already be routed.
    mocks.getReminderSettings.mockResolvedValue({
      ...settings,
      telegramChatId: "123456",
    })
    mocks.telegramReminderConfiguration.mockReturnValue({
      botConfigured: true,
      defaultChatConfigured: false,
      interactiveConfigured: false,
    })
    mocks.sendTelegramReminder.mockResolvedValue({ sent: true })
    const response = await POST(jsonRequest("POST", {}))
    expect(response.status).toBe(200)
    expect(mocks.sendTelegramReminder).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: "123456" })
    )
  })
})

function jsonRequest(method: string, body: unknown) {
  return new Request("http://localhost/api/settings/reminders", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
