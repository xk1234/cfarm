import { NextResponse } from "next/server"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import {
  configureTelegramWebhook,
  detectTelegramChat,
  getReminderSettings,
  telegramBotIdentity,
  publicReminderSettings,
  reminderEventMetadata,
  reminderEvents,
  saveReminderSettings,
  sendTelegramReminder,
  telegramReminderConfiguration,
} from "@/lib/reminder-settings"

export const dynamic = "force-dynamic"

const eventSettingsSchema = z.object({
  channel: z.enum(["none", "telegram"]),
  offsetsHours: z.array(z.number().int().positive()).optional(),
})

const settingsSchema = z.object({
  telegramChatId: z.string().trim().max(255).optional(),
  telegramBotToken: z.string().trim().max(255).optional(),
  notificationDefaultsApplied: z.boolean().optional(),
  events: z.object(
    Object.fromEntries(
      reminderEvents.map((event) => [event, eventSettingsSchema])
    ) as Record<(typeof reminderEvents)[number], typeof eventSettingsSchema>
  ),
})

function usesTelegram(events: z.infer<typeof settingsSchema>["events"]) {
  return reminderEvents.some((event) => events[event].channel === "telegram")
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const settings = await getReminderSettings()
  const telegram = telegramReminderConfiguration(settings)
  // Best effort: naming the bot is a convenience, so a Telegram outage must not
  // take the whole settings page down with it.
  const identity = telegram.botConfigured
    ? await telegramBotIdentity({
        botToken: settings.telegramBotToken,
      }).catch(() => ({ username: undefined, name: undefined }))
    : { username: undefined, name: undefined }
  return NextResponse.json({
    settings: publicReminderSettings(settings),
    eventMetadata: reminderEventMetadata,
    telegram: { ...telegram, ...identity },
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
  if (
    candidate.telegramChatId &&
    candidate.notificationDefaultsApplied !== true &&
    !usesTelegram(candidate.events)
  ) {
    candidate.events = {
      ...candidate.events,
      generated: { channel: "telegram" },
    }
    candidate.notificationDefaultsApplied = true
  }
  const configuration = telegramReminderConfiguration({
    ...current,
    ...candidate,
    id: "reminders",
    updatedAt: current.updatedAt,
  })
  if (usesTelegram(candidate.events) && !configuration.botConfigured) {
    return NextResponse.json(
      { error: "Telegram reminders are not configured on the server." },
      { status: 400 }
    )
  }
  if (
    usesTelegram(candidate.events) &&
    !candidate.telegramChatId &&
    !configuration.defaultChatConfigured
  ) {
    return NextResponse.json(
      { error: "Enter a Telegram chat or channel ID." },
      { status: 400 }
    )
  }
  const settings = await saveReminderSettings(candidate)
  const webhook = usesTelegram(settings.events)
    ? await configureTelegramWebhook(settings).catch(() => ({
        configured: false,
      }))
    : { configured: false }
  return NextResponse.json({
    settings: publicReminderSettings(settings),
    eventMetadata: reminderEventMetadata,
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

  // Detecting the chat only reads the bot's own updates, so it works before any
  // event is routed to Telegram — which is the point, since you need the chat ID
  // in order to configure one.
  if (payload?.action === "detect-chat") {
    try {
      const detected = await detectTelegramChat({
        botToken: settings.telegramBotToken,
      })
      if (!detected.chatId) {
        return NextResponse.json(
          {
            error:
              "No recent chat found. Open the bot in Telegram, send it /start, then try again.",
          },
          { status: 404 }
        )
      }
      return NextResponse.json(detected)
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The Telegram chat could not be detected.",
        },
        { status: 502 }
      )
    }
  }

  // Deliberately not gated on an event already routing to Telegram: the whole
  // point of the test is to prove the connection works BEFORE wiring events to
  // it. It still needs a bot and a destination, which is what actually matters.
  if (!telegramReminderConfiguration(settings).botConfigured) {
    return NextResponse.json(
      { error: "Telegram reminders are not configured on the server." },
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
