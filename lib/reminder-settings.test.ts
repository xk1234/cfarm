import { afterEach, describe, expect, it, vi } from "vitest"

import {
  configureTelegramWebhook,
  defaultReminderSettings,
  getReminderSettings,
  normalizeReminderSettings,
  saveReminderSettings,
  sendTelegramReminder,
} from "@/lib/reminder-settings"
import { deleteJsonArrayRecord } from "@/lib/json-store"
import { withSystemOwner } from "@/lib/system-owner-context"
import path from "node:path"

const originalToken = process.env.TELEGRAM_BOT_TOKEN
const originalChatId = process.env.TELEGRAM_CHAT_ID
const originalBaseUrl = process.env.BASE_URL
const originalWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET

afterEach(() => {
  restoreEnv("TELEGRAM_BOT_TOKEN", originalToken)
  restoreEnv("TELEGRAM_CHAT_ID", originalChatId)
  restoreEnv("BASE_URL", originalBaseUrl)
  restoreEnv("TELEGRAM_WEBHOOK_SECRET", originalWebhookSecret)
})

describe("reminder settings", () => {
  it("defaults to no reminders while keeping all lifecycle events selected", () => {
    expect(defaultReminderSettings()).toMatchObject({
      channel: "none",
      events: {
        generated: true,
        ready_to_post: true,
        scheduled_to_post: true,
      },
    })
  })

  it("normalizes invalid channels and preserves explicit event choices", () => {
    expect(
      normalizeReminderSettings({
        channel: "email",
        events: {
          generated: false,
          ready_to_post: true,
          scheduled_to_post: false,
        },
      })
    ).toMatchObject({
      channel: "none",
      events: {
        generated: false,
        ready_to_post: true,
        scheduled_to_post: false,
      },
    })
  })

  it("sends a Telegram message to the saved destination", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token"
    delete process.env.TELEGRAM_CHAT_ID
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }))

    await expect(
      sendTelegramReminder({
        text: "Generation complete",
        chatId: "123456",
        fetcher,
      })
    ).resolves.toEqual({ sent: true })
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/sendMessage"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          chat_id: "123456",
          text: "Generation complete",
        }),
      })
    )
  })

  it("persists one private reminder policy in Appwrite", async () => {
    const ownerId = `reminder-test-${Date.now()}`.slice(0, 36)
    const rootDir = path.join(process.cwd(), "data", "settings")
    await withSystemOwner(ownerId, async () => {
      try {
        await saveReminderSettings({
          channel: "none",
          events: {
            generated: false,
            ready_to_post: true,
            scheduled_to_post: false,
          },
        })
        await expect(getReminderSettings()).resolves.toMatchObject({
          id: "reminders",
          channel: "none",
          events: {
            generated: false,
            ready_to_post: true,
            scheduled_to_post: false,
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

  it("registers the interactive callback against the public app URL", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token"
    process.env.BASE_URL = "https://app.example.com/"
    process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-secret"
    const fetcher = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 })
    )

    await expect(configureTelegramWebhook(fetcher)).resolves.toEqual({
      configured: true,
    })
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/setWebhook"),
      expect.objectContaining({
        body: JSON.stringify({
          url: "https://app.example.com/api/telegram/webhook",
          secret_token: "webhook-secret",
          allowed_updates: ["callback_query"],
          drop_pending_updates: false,
        }),
      })
    )
  })
})

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}
