import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getReminderSettings: vi.fn(),
  configureTelegramWebhook: vi.fn(),
  saveReminderSettings: vi.fn(),
  sendTelegramReminder: vi.fn(),
  telegramReminderConfiguration: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }))
vi.mock("@/lib/reminder-settings", () => ({
  configureTelegramWebhook: mocks.configureTelegramWebhook,
  getReminderSettings: mocks.getReminderSettings,
  saveReminderSettings: mocks.saveReminderSettings,
  sendTelegramReminder: mocks.sendTelegramReminder,
  telegramReminderConfiguration: mocks.telegramReminderConfiguration,
}))

import { GET, POST, PUT } from "@/app/api/settings/reminders/route"

const settings = {
  id: "reminders",
  channel: "none" as const,
  events: {
    generated: true,
    ready_to_post: true,
    scheduled_to_post: true,
  },
  updatedAt: "2026-07-18T00:00:00.000Z",
}

describe("reminder settings route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getCurrentUser.mockResolvedValue({ $id: "user-1" })
    mocks.getReminderSettings.mockResolvedValue(settings)
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

  it("returns the saved policy without exposing credentials", async () => {
    const response = await GET()
    expect(await response.json()).toEqual({
      settings,
      telegram: {
        botConfigured: false,
        defaultChatConfigured: false,
        interactiveConfigured: false,
      },
    })
  })

  it("saves no-reminder mode even when Telegram is not configured", async () => {
    const response = await PUT(
      jsonRequest("PUT", {
        channel: "none",
        events: settings.events,
      })
    )
    expect(response.status).toBe(200)
    expect(mocks.saveReminderSettings).toHaveBeenCalledWith({
      channel: "none",
      events: settings.events,
    })
  })

  it("does not enable Telegram without a server bot token", async () => {
    const response = await PUT(
      jsonRequest("PUT", {
        channel: "telegram",
        telegramChatId: "123456",
        events: settings.events,
      })
    )
    expect(response.status).toBe(400)
    expect(mocks.saveReminderSettings).not.toHaveBeenCalled()
  })

  it("sends a test only after Telegram is selected", async () => {
    mocks.getReminderSettings.mockResolvedValue({
      ...settings,
      channel: "telegram",
      telegramChatId: "123456",
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
