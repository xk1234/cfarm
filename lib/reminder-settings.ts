import "server-only"

import path from "node:path"

import { clean, isRecord } from "@/lib/guards"
import { readJsonArrayRecord, upsertJsonArrayRecord } from "@/lib/json-store"

export const reminderEvents = [
  "generated",
  "ready_to_post",
  "scheduled_to_post",
  "respond_to_comments",
  "publish_failed",
  "generation_failed",
] as const

export type ReminderEvent = (typeof reminderEvents)[number]
export type ReminderChannel = "none" | "telegram"

export type ReminderEventMetadata = {
  label: string
  description: string
  supportsOffsets: boolean
  defaultOffsetsHours?: readonly number[]
}

export const reminderEventMetadata: Record<
  ReminderEvent,
  ReminderEventMetadata
> = {
  generated: {
    label: "Generation complete",
    description: "Send as soon as a slideshow or video finishes generating.",
    supportsOffsets: false,
  },
  ready_to_post: {
    label: "Ready to post",
    description:
      "Send at the post's due time when a review or manual post is ready.",
    supportsOffsets: false,
  },
  scheduled_to_post: {
    label: "Scheduled to post",
    description: "Send when a post is successfully scheduled with PostFast.",
    supportsOffsets: false,
  },
  respond_to_comments: {
    label: "Respond to comments",
    description: "Follow up after publishing while the conversation is active.",
    supportsOffsets: true,
    defaultOffsetsHours: [24, 72],
  },
  publish_failed: {
    label: "Publishing failed",
    description: "Send when LumenClip cannot publish a post.",
    supportsOffsets: false,
  },
  generation_failed: {
    label: "Generation failed",
    description: "Send when a slideshow or video cannot be generated.",
    supportsOffsets: false,
  },
}

export type ReminderEventSettings = {
  channel: ReminderChannel
  offsetsHours?: number[]
}

export type ReminderSettings = {
  id: "reminders"
  telegramChatId?: string
  telegramBotToken?: string
  events: Record<ReminderEvent, ReminderEventSettings>
  updatedAt: string
}

export type ReminderSettingsInput = Pick<
  ReminderSettings,
  "telegramChatId" | "telegramBotToken" | "events"
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
    events: Object.fromEntries(
      reminderEvents.map((event) => [
        event,
        {
          channel: "none",
          ...(reminderEventMetadata[event].supportsOffsets
            ? {
                offsetsHours: [
                  ...(reminderEventMetadata[event].defaultOffsetsHours ?? []),
                ],
              }
            : {}),
        },
      ])
    ) as Record<ReminderEvent, ReminderEventSettings>,
    updatedAt: new Date(0).toISOString(),
  }
}

export function normalizeReminderSettings(
  value: unknown
): ReminderSettings | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const rawEvents =
    input.events &&
    typeof input.events === "object" &&
    !Array.isArray(input.events)
      ? (input.events as Record<string, unknown>)
      : {}
  const defaults = defaultReminderSettings()
  const events = Object.fromEntries(
    reminderEvents.map((event) => {
      const metadata = reminderEventMetadata[event]
      const raw = rawEvents[event]
      const rawEvent =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : null
      const channel: ReminderChannel =
        rawEvent?.channel === "telegram" ? "telegram" : "none"
      const offsetsHours = metadata.supportsOffsets
        ? normalizeOffsets(
            rawEvent?.offsetsHours,
            defaults.events[event].offsetsHours ?? []
          )
        : undefined
      return [
        event,
        {
          channel,
          ...(offsetsHours ? { offsetsHours } : {}),
        },
      ]
    })
  ) as Record<ReminderEvent, ReminderEventSettings>

  return {
    id: "reminders",
    telegramChatId: clean(input.telegramChatId) || undefined,
    telegramBotToken: clean(input.telegramBotToken) || undefined,
    events,
    updatedAt: clean(input.updatedAt) || defaults.updatedAt,
  }
}

function normalizeOffsets(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) return [...fallback]
  return [
    ...new Set(
      value.filter(
        (offset): offset is number =>
          typeof offset === "number" &&
          Number.isInteger(offset) &&
          offset > 0 &&
          offset <= 24 * 365
      )
    ),
  ].sort((left, right) => left - right)
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

export function publicReminderSettings(settings: ReminderSettings) {
  const safe = { ...settings }
  delete safe.telegramBotToken
  return safe
}

export function telegramReminderConfiguration(settings?: ReminderSettings) {
  const baseUrl = clean(process.env.BASE_URL).replace(/\/$/, "")
  const webhookSecret = clean(process.env.TELEGRAM_WEBHOOK_SECRET)
  const token =
    clean(settings?.telegramBotToken) || clean(process.env.TELEGRAM_BOT_TOKEN)
  return {
    botConfigured: Boolean(token),
    customBotConfigured: Boolean(settings?.telegramBotToken),
    defaultChatConfigured: Boolean(process.env.TELEGRAM_CHAT_ID?.trim()),
    interactiveConfigured:
      Boolean(token) && Boolean(webhookSecret) && /^https:\/\//i.test(baseUrl),
  }
}

export async function telegramBotRequest(
  method: string,
  body: Record<string, unknown>,
  fetcher: typeof fetch = fetch,
  botToken?: string
) {
  const token = clean(botToken) || process.env.TELEGRAM_BOT_TOKEN?.trim()
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
  // Telegram answers 200 with `{ok:false, error_code, description}`. Throwing a
  // bare string discarded the only field that says what was wrong.
  const raw = await response.text()
  let payload: unknown = null
  try {
    payload = JSON.parse(raw)
  } catch {
    payload = null
  }
  if (
    payload &&
    typeof payload === "object" &&
    (payload as { ok?: boolean }).ok === false
  ) {
    const detail = payload as { error_code?: number; description?: string }
    throw new Error(
      [
        "Telegram rejected the request",
        detail.error_code ? `code=${detail.error_code}` : "",
        detail.description,
      ]
        .filter(Boolean)
        .join(" | ")
    )
  }
  return payload
}

export async function configureTelegramWebhook(
  settingsOrFetcher?: ReminderSettings | typeof fetch,
  requestedFetcher: typeof fetch = fetch
) {
  const settings =
    typeof settingsOrFetcher === "function" ? undefined : settingsOrFetcher
  const fetcher =
    typeof settingsOrFetcher === "function"
      ? settingsOrFetcher
      : requestedFetcher
  const configuration = telegramReminderConfiguration(settings)
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
    fetcher,
    settings?.telegramBotToken
  )
  return { configured: true }
}

/**
 * Who the workspace bot is. Shown in settings so a person knows which bot to
 * open — "enter a chat ID" is unanswerable if you cannot tell which bot is
 * asking.
 */
export async function telegramBotIdentity(input: {
  botToken?: string
  fetcher?: typeof fetch
}) {
  const payload = await telegramBotRequest(
    "getMe",
    {},
    input.fetcher,
    input.botToken
  )
  // telegramBotRequest returns Telegram's whole `{ok, result}` envelope.
  const result =
    isRecord(payload) && isRecord(payload.result) ? payload.result : {}
  const username = clean(result.username)
  return {
    username: username || undefined,
    name: clean(result.first_name) || undefined,
  }
}

/**
 * Resolve the chat ID from the bot's own recent updates, so nobody has to open
 * a getUpdates URL by hand. Returns the most recent chat that messaged the bot.
 */
export async function detectTelegramChat(input: {
  botToken?: string
  fetcher?: typeof fetch
}) {
  const payload = await telegramBotRequest(
    "getUpdates",
    { limit: 100, allowed_updates: ["message", "channel_post"] },
    input.fetcher,
    input.botToken
  )
  const updates =
    isRecord(payload) && Array.isArray(payload.result) ? payload.result : []
  for (const update of [...updates].reverse()) {
    if (!isRecord(update)) continue
    const message = isRecord(update.message)
      ? update.message
      : isRecord(update.channel_post)
        ? update.channel_post
        : undefined
    const chat = message && isRecord(message.chat) ? message.chat : undefined
    // Chat IDs arrive as numbers, and negative for groups and channels, so
    // clean() would drop every one of them.
    const id =
      typeof chat?.id === "number" || typeof chat?.id === "string"
        ? String(chat.id)
        : ""
    if (!id) continue
    return {
      chatId: id,
      title:
        clean(chat?.title) ||
        [clean(chat?.first_name), clean(chat?.last_name)]
          .filter(Boolean)
          .join(" ") ||
        clean(chat?.username) ||
        undefined,
    }
  }
  return { chatId: undefined, title: undefined }
}

export async function sendTelegramReminder(input: {
  text: string
  chatId?: string
  botToken?: string
  fetcher?: typeof fetch
}) {
  const token = clean(input.botToken) || process.env.TELEGRAM_BOT_TOKEN?.trim()
  const chatId = clean(input.chatId) || process.env.TELEGRAM_CHAT_ID?.trim()
  if (!token)
    throw new Error("Telegram reminders are not configured on the server.")
  if (!chatId) throw new Error("Enter a Telegram chat or channel ID.")

  await telegramBotRequest(
    "sendMessage",
    { chat_id: chatId, text: clean(input.text).slice(0, 4000) },
    input.fetcher,
    token
  )
  return { sent: true }
}
