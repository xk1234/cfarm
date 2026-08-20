import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getJob: vi.fn(),
  markReminderGenerationPosted: vi.fn(),
  telegramBotRequest: vi.fn(),
  getReminderSettings: vi.fn(),
}))

vi.mock("@/lib/railway/job-repository", () => ({
  railwayJobRepository: { get: mocks.getJob },
}))
vi.mock("@/lib/reminder-actions", () => ({
  markReminderGenerationPosted: mocks.markReminderGenerationPosted,
}))
vi.mock("@/lib/reminder-settings", () => ({
  getReminderSettings: mocks.getReminderSettings,
  telegramBotRequest: mocks.telegramBotRequest,
}))

import { POST } from "@/app/api/telegram/webhook/route"

describe("Telegram reminder webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "webhook-secret")
    mocks.telegramBotRequest.mockResolvedValue({ ok: true })
    mocks.getReminderSettings.mockResolvedValue({
      channel: "telegram",
      events: {},
    })
  })

  afterEach(() => vi.unstubAllEnvs())

  it("rejects requests without Telegram's webhook secret", async () => {
    const response = await POST(webhookRequest("wrong-secret"))
    expect(response.status).toBe(401)
    expect(mocks.getJob).not.toHaveBeenCalled()
  })

  it("marks the source generation posted and removes the action button", async () => {
    mocks.getJob.mockResolvedValue({
      id: "job-ready-1",
      type: "send-notification",
      ownerId: "owner-1",
      payload: {
        event: "ready_to_post",
        sourceType: "slideshow",
        sourceId: "slideshow-1",
        requiresPostConfirmation: true,
      },
    })
    mocks.markReminderGenerationPosted.mockResolvedValue({
      alreadyPosted: false,
      publishedAt: "2026-07-18T05:00:00.000Z",
    })

    const response = await POST(webhookRequest("webhook-secret"))
    expect(response.status).toBe(200)
    expect(mocks.markReminderGenerationPosted).toHaveBeenCalledWith({
      ownerId: "owner-1",
      sourceType: "slideshow",
      sourceId: "slideshow-1",
    })
    expect(mocks.telegramBotRequest).toHaveBeenCalledWith(
      "editMessageText",
      expect.objectContaining({
        chat_id: 123456,
        message_id: 99,
        reply_markup: { inline_keyboard: [] },
      })
    )
  })
})

function webhookRequest(secret: string) {
  return new Request("https://app.example.com/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": secret,
    },
    body: JSON.stringify({
      callback_query: {
        id: "callback-1",
        data: "posted:job-ready-1",
        message: {
          message_id: 99,
          text: "Slideshow ready to post",
          chat: { id: 123456 },
        },
      },
    }),
  })
}
