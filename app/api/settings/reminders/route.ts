import { NextResponse } from "next/server"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import {
  configureTelegramWebhook,
  getReminderSettings,
  publicReminderSettings,
  saveReminderSettings,
  sendTelegramReminder,
  telegramReminderConfiguration,
} from "@/lib/reminder-settings"

export const dynamic = "force-dynamic"

const settingsSchema = z.object({
  channel: z.enum(["none", "telegram"]),
  telegramChatId: z.string().trim().max(255).optional(),
  telegramBotToken: z.string().trim().max(255).optional(),
  events: z.object({
    generated: z.boolean(),
    ready_to_post: z.boolean(),
    scheduled_to_post: z.boolean(),
  }),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const settings = await getReminderSettings()
  return NextResponse.json({
    settings: publicReminderSettings(settings),
    telegram: telegramReminderConfiguration(settings),
  })
}

export async function PUT(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = settingsSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a reminder method and valid reminder events." },
      { status: 400 }
    )
  }
  const current = await getReminderSettings()
  const telegramBotToken =
    parsed.data.telegramBotToken?.trim() || current.telegramBotToken
  const candidate = {
    ...parsed.data,
    ...(telegramBotToken ? { telegramBotToken } : {}),
  }
  const configuration = telegramReminderConfiguration({
    ...current,
    ...candidate,
    id: "reminders",
    updatedAt: current.updatedAt,
  })
  if (parsed.data.channel === "telegram" && !configuration.botConfigured) {
    return NextResponse.json(
      { error: "Telegram reminders are not configured on the server." },
      { status: 400 }
    )
  }
  if (
    parsed.data.channel === "telegram" &&
    !parsed.data.telegramChatId &&
    !configuration.defaultChatConfigured
  ) {
    return NextResponse.json(
      { error: "Enter a Telegram chat or channel ID." },
      { status: 400 }
    )
  }
  const settings = await saveReminderSettings(candidate)
  const webhook =
    settings.channel === "telegram"
      ? await configureTelegramWebhook(settings).catch(() => ({
          configured: false,
        }))
      : { configured: false }
  return NextResponse.json({
    settings: publicReminderSettings(settings),
    telegram: telegramReminderConfiguration(settings),
    webhook,
  })
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const payload = await request.json().catch(() => null)
  const settings = await getReminderSettings()
  if (settings.channel !== "telegram") {
    return NextResponse.json(
      { error: "Save Telegram as the reminder method first." },
      { status: 400 }
    )
  }
  try {
    await sendTelegramReminder({
      chatId:
        typeof payload?.telegramChatId === "string"
          ? payload.telegramChatId
          : settings.telegramChatId,
      text: "LumenClip reminder test\nTelegram reminders are connected.",
      botToken: settings.telegramBotToken,
    })
    return NextResponse.json({ sent: true })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Telegram reminder test failed.",
      },
      { status: 502 }
    )
  }
}
