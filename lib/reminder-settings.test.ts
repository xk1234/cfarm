import { afterEach, describe, expect, it, vi } from "vitest"

import {
  detectTelegramChat,
  telegramBotIdentity,
  configureTelegramWebhook,
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
  it("ignores legacy global-channel and boolean events without losing modern siblings", () => {
    expect(
      normalizeReminderSettings({
        channel: "telegram",
        events: {
          generated: true,
          ready_to_post: { channel: "telegram" },
          scheduled_to_post: false,
          unknown_event: true,
        },
      })
    ).toEqual({
      id: "reminders",
      events: {
        generated: { channel: "none" },
        ready_to_post: { channel: "telegram" },
        scheduled_to_post: { channel: "none" },
        respond_to_comments: {
          channel: "none",
          offsetsHours: [24, 72],
        },
        publish_failed: { channel: "none" },
        generation_failed: { channel: "none" },
      },
      updatedAt: new Date(0).toISOString(),
    })
  })

  it("ignores offsets for events that do not support delays", () => {
    expect(
      normalizeReminderSettings({
        events: {
          generated: { channel: "telegram", offsetsHours: [24] },
          respond_to_comments: {
            channel: "telegram",
            offsetsHours: [72, -1, 24, 72],
          },
        },
      })
    ).toMatchObject({
      events: {
        generated: { channel: "telegram" },
        respond_to_comments: {
          channel: "telegram",
          offsetsHours: [24, 72],
        },
      },
    })
    expect(
      normalizeReminderSettings({
        events: {
          generated: { channel: "telegram", offsetsHours: [24] },
        },
      })?.events.generated
    ).not.toHaveProperty("offsetsHours")
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
          events: {
            generated: { channel: "none" },
            ready_to_post: { channel: "telegram" },
            scheduled_to_post: { channel: "none" },
            respond_to_comments: {
              channel: "telegram",
              offsetsHours: [24, 72],
            },
            publish_failed: { channel: "none" },
            generation_failed: { channel: "none" },
          },
        })
        await expect(getReminderSettings()).resolves.toMatchObject({
          id: "reminders",
          events: {
            generated: { channel: "none" },
            ready_to_post: { channel: "telegram" },
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

describe("telegram bot discovery", () => {
  function jsonFetcher(payload: unknown) {
    return (async () =>
      new Response(JSON.stringify({ ok: true, result: payload }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch
  }

  it("names the bot so the settings page can say which one to open", async () => {
    const identity = await telegramBotIdentity({
      botToken: "test-token",
      fetcher: jsonFetcher({ username: "lumenclipnotif", first_name: "Lumen" }),
    })
    expect(identity).toEqual({ username: "lumenclipnotif", name: "Lumen" })
  })

  it("detects the most recent chat rather than the oldest", async () => {
    const detected = await detectTelegramChat({
      botToken: "test-token",
      fetcher: jsonFetcher([
        { message: { chat: { id: 111, first_name: "Older" } } },
        { message: { chat: { id: 222, first_name: "Newer" } } },
      ]),
    })
    expect(detected).toEqual({ chatId: "222", title: "Newer" })
  })

  it("reads channel posts, not just direct messages", async () => {
    const detected = await detectTelegramChat({
      botToken: "test-token",
      fetcher: jsonFetcher([
        { channel_post: { chat: { id: -100123, title: "Updates" } } },
      ]),
    })
    expect(detected).toEqual({ chatId: "-100123", title: "Updates" })
  })

  it("reports no chat when the bot has never been messaged", async () => {
    const detected = await detectTelegramChat({
      botToken: "test-token",
      fetcher: jsonFetcher([]),
    })
    expect(detected.chatId).toBeUndefined()
  })
})
