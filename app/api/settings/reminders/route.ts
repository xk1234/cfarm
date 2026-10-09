import { NextResponse } from "next/server"

import { validate } from "@/lib/api"
import { publishingRoute, readJson, requireWorkspace } from "@/lib/publishing/http"
import {
  getReminderSettings,
  reminderEventMetadata,
  ReminderSettingsInputSchema,
  saveReminderSettings,
} from "@/lib/reminder-settings"

export const dynamic = "force-dynamic"

/**
 * In-app notification settings: `{ channel: "in_app" | "none", leadMinutes }`.
 * The response also carries a per-event `events` view for the settings panel.
 */
export const GET = publishingRoute(async () => {
  const { workspaceId } = await requireWorkspace()
  return NextResponse.json({
    settings: await getReminderSettings(workspaceId),
    eventMetadata: reminderEventMetadata,
  })
})

export const PUT = publishingRoute(async (request) => {
  const { workspaceId } = await requireWorkspace()
  const input = validate(ReminderSettingsInputSchema, await readJson(request))
  return NextResponse.json({
    settings: await saveReminderSettings(workspaceId, input),
    eventMetadata: reminderEventMetadata,
  })
})
