import "server-only"

import path from "node:path"

import { clean } from "@/lib/guards"
import { readJsonArrayRecord, upsertJsonArrayRecord } from "@/lib/json-store"

export const reminderEvents = [
  "generated",
  "ready_to_post",
  "scheduled_to_post",
] as const

export type ReminderEvent = (typeof reminderEvents)[number]
export type ReminderChannel = "none" | "telegram"

export type ReminderSettings = {
  id: "reminders"
  channel: ReminderChannel
  telegramChatId?: string
  events: Record<ReminderEvent, boolean>
  updatedAt: string
}

export type ReminderSettingsInput = Pick<
  ReminderSettings,
  "channel" | "telegramChatId" | "events"
>

const rootDir = path.join(process.cwd(), "data", "settings")
const store = {
  rootDir,
  fileName: "reminders.json",
  key: "settings",
}

export function defaultReminderSettings(): ReminderSettings {
  return {
    id: "reminders",
    channel: "none",
    events: {
      generated: true,
      ready_to_post: true,
      scheduled_to_post: true,
    },
    updatedAt: new Date(0).toISOString(),
  }
}

export function normalizeReminderSettings(
  value: unknown
): ReminderSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Partial<ReminderSettings>
  const rawEvents: Partial<Record<ReminderEvent, unknown>> =
    input.events && typeof input.events === "object" ? input.events : {}
  const defaults = defaultReminderSettings()

  return {
    id: "reminders",
    channel: input.channel === "telegram" ? "telegram" : "none",
    telegramChatId: clean(input.telegramChatId) || undefined,
    events: {
      generated:
        typeof rawEvents.generated === "boolean"
          ? rawEvents.generated
          : defaults.events.generated,
      ready_to_post:
        typeof rawEvents.ready_to_post === "boolean"
          ? rawEvents.ready_to_post
          : defaults.events.ready_to_post,
      scheduled_to_post:
        typeof rawEvents.scheduled_to_post === "boolean"
          ? rawEvents.scheduled_to_post
          : defaults.events.scheduled_to_post,
    },
    updatedAt: clean(input.updatedAt) || defaults.updatedAt,
  }
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  return (
    (await readJsonArrayRecord<ReminderSettings>({
      ...store,
      id: "reminders",
      normalize: normalizeReminderSettings,
    })) ?? defaultReminderSettings()
  )
}

export async function saveReminderSettings(
  input: ReminderSettingsInput
): Promise<ReminderSettings> {
  const settings = normalizeReminderSettings({
    id: "reminders",
    ...input,
    updatedAt: new Date().toISOString(),
  })
  if (!settings) throw new Error("Invalid reminder settings")
  await upsertJsonArrayRecord({ ...store, record: settings })
  return settings
}

export function telegramReminderConfiguration() {
  const baseUrl = clean(process.env.BASE_URL).replace(/\/$/, "")
  const webhookSecret = clean(process.env.TELEGRAM_WEBHOOK_SECRET)
  return {
    botConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
    defaultChatConfigured: Boolean(process.env.TELEGRAM_CHAT_ID?.trim()),
    interactiveConfigured:
      Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()) &&
      Boolean(webhookSecret) &&
      /^https:\/\//i.test(baseUrl),
  }
}

export async function telegramBotRequest(
  method: string,
  body: Record<string, unknown>,
  fetcher: typeof fetch = fetch
) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token)
    throw new Error("Telegram reminders are not configured on the server.")
  const response = await fetcher(
    `https://api.telegram.org/bot${token}/${encodeURIComponent(method)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  )
  if (!response.ok) {
    throw new Error(`Telegram request failed (${response.status}).`)
  }
  const payload = await response.json().catch(() => null)
  if (payload && typeof payload === "object" && payload.ok === false) {
    throw new Error("Telegram rejected the request.")
  }
  return payload
}

export async function configureTelegramWebhook(fetcher: typeof fetch = fetch) {
  const configuration = telegramReminderConfiguration()
  if (!configuration.interactiveConfigured) return { configured: false }
  const baseUrl = clean(process.env.BASE_URL).replace(/\/$/, "")
  await telegramBotRequest(
    "setWebhook",
    {
      url: `${baseUrl}/api/telegram/webhook`,
      secret_token: clean(process.env.TELEGRAM_WEBHOOK_SECRET),
      allowed_updates: ["callback_query"],
      drop_pending_updates: false,
    },
    fetcher
  )
  return { configured: true }
}

export async function sendTelegramReminder(input: {
  text: string
  chatId?: string
  fetcher?: typeof fetch
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = clean(input.chatId) || process.env.TELEGRAM_CHAT_ID?.trim()
  if (!token)
    throw new Error("Telegram reminders are not configured on the server.")
  if (!chatId) throw new Error("Enter a Telegram chat or channel ID.")

  await telegramBotRequest(
    "sendMessage",
    { chat_id: chatId, text: clean(input.text).slice(0, 4000) },
    input.fetcher
  )
  return { sent: true }
}
