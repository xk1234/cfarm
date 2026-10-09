import { NextResponse } from "next/server"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import {
  getReminderSettings,
  publicReminderSettings,
  reminderEventMetadata,
  reminderEvents,
  saveReminderSettings,
} from "@/lib/reminder-settings"

export const dynamic = "force-dynamic"

const eventSettingsSchema = z.object({
  channel: z.enum(["none", "in_app"]),
  offsetsHours: z.array(z.number().int().positive()).optional(),
})

const settingsSchema = z.object({
  notificationDefaultsApplied: z.boolean().optional(),
  events: z.object(
    Object.fromEntries(
      reminderEvents.map((event) => [event, eventSettingsSchema])
    ) as Record<(typeof reminderEvents)[number], typeof eventSettingsSchema>
  ),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const settings = await getReminderSettings(user.$id)
  return NextResponse.json({
    settings: publicReminderSettings(settings),
    eventMetadata: reminderEventMetadata,
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
      { error: "Choose a notification setting for each event." },
      { status: 400 }
    )
  }
  const settings = await saveReminderSettings(user.$id, parsed.data)
  return NextResponse.json({
    settings: publicReminderSettings(settings),
    eventMetadata: reminderEventMetadata,
  })
}
