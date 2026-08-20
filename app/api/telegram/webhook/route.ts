import crypto from "node:crypto"
import { NextResponse } from "next/server"

import { markReminderGenerationPosted } from "@/lib/reminder-actions"
import {
  getReminderSettings,
  telegramBotRequest,
} from "@/lib/reminder-settings"
import { railwayJobRepository } from "@/lib/railway/job-repository"
import { withSystemOwner } from "@/lib/system-owner-context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type TelegramCallback = {
  id?: string
  data?: string
  message?: {
    message_id?: number
    text?: string
    chat?: { id?: string | number }
  }
}

export async function POST(request: Request) {
  if (!validWebhookSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const update = await request.json().catch(() => null)
  const callback = callbackValue(update?.callback_query)
  const jobId = postedJobId(callback?.data)
  if (!callback?.id || !jobId) return NextResponse.json({ ok: true })

  let botToken: string | undefined
  try {
    const job = await reminderJob(jobId)
    const ownerId = job.ownerId
    const payload = parsePayload(job.payload)
    if (
      job.type !== "send-notification" ||
      payload.event !== "ready_to_post" ||
      payload.requiresPostConfirmation !== true
    ) {
      throw new Error("Invalid reminder action")
    }
    botToken = await withSystemOwner(ownerId, async () => {
      const settings = await getReminderSettings()
      return settings.telegramBotToken
    })
    const result = await markReminderGenerationPosted({
      ownerId,
      sourceType: String(payload.sourceType ?? ""),
      sourceId: String(payload.sourceId ?? ""),
    })
    await acknowledgePosted(callback, result.alreadyPosted, botToken)
  } catch {
    await requestTelegram(botToken, "answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "LumenClip could not update this generation. Open the app to check it.",
      show_alert: true,
    }).catch(() => undefined)
  }

  // Telegram retries non-2xx webhook responses. Callback failures are already
  // surfaced to the person who tapped, so acknowledge the update exactly once.
  return NextResponse.json({ ok: true })
}

function validWebhookSecret(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? ""
  const supplied =
    request.headers.get("x-telegram-bot-api-secret-token")?.trim() ?? ""
  const expectedBytes = Buffer.from(expected)
  const suppliedBytes = Buffer.from(supplied)
  if (!expected || expectedBytes.length !== suppliedBytes.length) return false
  return crypto.timingSafeEqual(expectedBytes, suppliedBytes)
}

async function reminderJob(id: string) {
  const job = await railwayJobRepository.get(id)
  if (!job) throw new Error("Reminder job not found")
  return job
}

function parsePayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== "string") return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function callbackValue(value: unknown): TelegramCallback | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as TelegramCallback)
    : null
}

function postedJobId(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("posted:")) return ""
  const id = value.slice("posted:".length)
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(id) ? id : ""
}

async function acknowledgePosted(
  callback: TelegramCallback,
  alreadyPosted: boolean,
  botToken?: string
) {
  await requestTelegram(botToken, "answerCallbackQuery", {
    callback_query_id: callback.id,
    text: alreadyPosted ? "Already marked as posted" : "Marked as posted",
  })

  const chatId = callback.message?.chat?.id
  const messageId = callback.message?.message_id
  if (chatId === undefined || messageId === undefined) return
  const original = callback.message?.text?.trim() ?? "Generation ready to post"
  const confirmation = alreadyPosted
    ? "✅ Already marked as posted in LumenClip."
    : "✅ Marked as posted in LumenClip. Link the TikTok URL later when it is available."
  await requestTelegram(botToken, "editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: `${original.slice(0, 3900)}\n\n${confirmation}`,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => undefined)
}

function requestTelegram(
  botToken: string | undefined,
  method: string,
  body: Record<string, unknown>
) {
  return botToken
    ? telegramBotRequest(method, body, undefined, botToken)
    : telegramBotRequest(method, body)
}
