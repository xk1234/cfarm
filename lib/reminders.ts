import "server-only"

import { enqueueJob } from "@/lib/queue"
import {
  getReminderSettings,
  type ReminderEvent,
} from "@/lib/reminder-settings"

export type ReminderEventInput = {
  event: ReminderEvent
  sourceType: string
  sourceId: string
  text: string
  scheduledFor?: string
  availableAt?: Date
  dedupeSuffix?: string
  requiresPostConfirmation?: boolean
}

/**
 * Queue a lifecycle reminder. The worker reads the latest workspace settings
 * immediately before delivery, so disabling reminders also suppresses future
 * messages that were queued earlier.
 */
export async function enqueueReminder(input: ReminderEventInput) {
  const settings = await getReminderSettings()
  if (settings.channel !== "telegram" || !settings.events[input.event]) {
    return null
  }
  return enqueueJob({
    type: "send-notification",
    payload: {
      event: input.event,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      scheduledFor: input.scheduledFor,
      requiresPostConfirmation: input.requiresPostConfirmation === true,
      text: input.text,
    },
    availableAt: input.availableAt,
    dedupeKey: [
      "reminder",
      input.event,
      input.sourceType,
      input.sourceId,
      input.dedupeSuffix,
    ]
      .filter(Boolean)
      .join(":"),
    maxAttempts: 5,
  })
}
