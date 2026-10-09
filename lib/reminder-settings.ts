import "server-only"

import path from "node:path"

import { clean } from "@/lib/guards"
import { readJsonArrayRecord, upsertJsonArrayRecord } from "@/lib/json-store"

export const reminderEvents = [
  "generated",
  "ready_to_post",
  "scheduled_to_post",
  "respond_to_comments",
  "publish_failed",
] as const

export type ReminderEvent = (typeof reminderEvents)[number]
// Notifications are delivered in-app only; there is no external channel.
export type ReminderChannel = "none" | "in_app"

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
    label: "Slideshow rendered",
    description: "Notify as soon as a slideshow finishes rendering.",
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
}

export type ReminderEventSettings = {
  channel: ReminderChannel
  offsetsHours?: number[]
}

export type ReminderSettings = {
  id: "reminders"
  notificationDefaultsApplied: boolean
  events: Record<ReminderEvent, ReminderEventSettings>
  updatedAt: string
}

export type ReminderSettingsInput = Pick<
  ReminderSettings,
  "events"
> & {
  notificationDefaultsApplied?: boolean
}

const rootDir = path.join(process.cwd(), "data", "settings")
const store = {
  rootDir,
  fileName: "reminders.json",
  key: "settings",
}

export function defaultReminderSettings(): ReminderSettings {
  return {
    id: "reminders",
    notificationDefaultsApplied: false,
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
  const notificationDefaultsApplied = input.notificationDefaultsApplied === true
  const events = Object.fromEntries(
    reminderEvents.map((event) => {
      const metadata = reminderEventMetadata[event]
      const raw = rawEvents[event]
      const rawEvent =
        raw && typeof raw === "object" && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : null
      // Legacy Telegram routing becomes in-app delivery.
      const channel: ReminderChannel =
        rawEvent?.channel === "in_app" || rawEvent?.channel === "telegram"
          ? "in_app"
          : "none"
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
    notificationDefaultsApplied,
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
  return { ...settings }
}
