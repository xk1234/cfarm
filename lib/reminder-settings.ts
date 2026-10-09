/**
 * Notification settings: one workspace-wide channel (`in_app` or `none`) plus
 * the lead times for "post coming up" reminders. Stored in
 * `workspace_settings.reminders` ({ enabled, leadMinutes }).
 *
 * The HTTP shape also carries a per-event `events` view so the existing
 * settings panel keeps working; every event shares the one channel.
 */
import { z } from "zod"

import {
  getRepositories,
  type ReminderSettings as StoredReminderSettings,
  type Repositories,
  type WorkspaceId,
} from "@/lib/data"

export const REMINDER_CHANNELS = ["in_app", "none"] as const
export type ReminderChannel = (typeof REMINDER_CHANNELS)[number]

export const reminderEvents = ["render_finished", "post_upcoming", "post_published", "publish_failed"] as const
export type ReminderEvent = (typeof reminderEvents)[number]

export type ReminderEventMetadata = {
  label: string
  description: string
  supportsOffsets: boolean
  defaultOffsetsHours?: readonly number[]
}

export const reminderEventMetadata: Record<ReminderEvent, ReminderEventMetadata> = {
  render_finished: {
    label: "Render finished",
    description: "When a slideshow render succeeds or fails.",
    supportsOffsets: false,
  },
  post_upcoming: {
    label: "Post coming up",
    description: "Before a scheduled post goes out.",
    supportsOffsets: true,
    defaultOffsetsHours: [1],
  },
  post_published: {
    label: "Post published",
    description: "When SocialBu confirms a post is live.",
    supportsOffsets: false,
  },
  publish_failed: {
    label: "Publishing failed",
    description: "When SocialBu cannot publish a post.",
    supportsOffsets: false,
  },
}

export type ReminderEventSettings = { channel: ReminderChannel; offsetsHours?: number[] }

export type PublicReminderSettings = {
  channel: ReminderChannel
  /** Minutes before a scheduled post. */
  leadMinutes: number[]
  notificationDefaultsApplied: boolean
  events: Record<ReminderEvent, ReminderEventSettings>
}

const MAX_LEAD_MINUTES = 7 * 24 * 60
const MAX_LEADS = 5

const leadMinutesSchema = z
  .array(z.number().int().positive().max(MAX_LEAD_MINUTES))
  .max(MAX_LEADS)

export const ReminderSettingsInputSchema = z
  .object({
    channel: z.enum(REMINDER_CHANNELS).optional(),
    leadMinutes: leadMinutesSchema.optional(),
    notificationDefaultsApplied: z.boolean().optional(),
    /** Legacy per-event form from the settings panel. */
    events: z
      .record(
        z.string(),
        z.object({
          channel: z.string(),
          offsetsHours: z.array(z.number().int().positive().max(MAX_LEAD_MINUTES / 60)).optional(),
        })
      )
      .optional(),
  })
  .refine((value) => value.channel || value.events || value.leadMinutes, {
    message: "Choose a notification setting.",
  })

export type ReminderSettingsInput = z.infer<typeof ReminderSettingsInputSchema>

function normalizeLeads(values: readonly number[]): number[] {
  return [...new Set(values.filter((v) => Number.isInteger(v) && v > 0 && v <= MAX_LEAD_MINUTES))]
    .sort((a, b) => a - b)
    .slice(0, MAX_LEADS)
}

export function toPublicReminderSettings(stored: StoredReminderSettings): PublicReminderSettings {
  const channel: ReminderChannel = stored.enabled ? "in_app" : "none"
  const leadMinutes = normalizeLeads(stored.leadMinutes)
  const offsetsHours = leadMinutes.filter((m) => m % 60 === 0).map((m) => m / 60)
  const events = Object.fromEntries(
    reminderEvents.map((event) => [
      event,
      reminderEventMetadata[event].supportsOffsets ? { channel, offsetsHours } : { channel },
    ])
  ) as Record<ReminderEvent, ReminderEventSettings>
  return { channel, leadMinutes, notificationDefaultsApplied: true, events }
}

/** Applies an input onto stored settings. */
export function applyReminderSettingsInput(
  current: StoredReminderSettings,
  input: ReminderSettingsInput
): StoredReminderSettings {
  let enabled = current.enabled
  let leadMinutes = current.leadMinutes
  if (input.events) {
    const channels = Object.values(input.events).map((event) => event.channel)
    enabled = channels.some((channel) => channel === "in_app" || channel === "telegram")
    const upcoming = input.events.post_upcoming
    if (upcoming?.offsetsHours) leadMinutes = upcoming.offsetsHours.map((hours) => hours * 60)
  }
  if (input.channel) enabled = input.channel === "in_app"
  if (input.leadMinutes) leadMinutes = input.leadMinutes
  return { enabled, leadMinutes: normalizeLeads(leadMinutes) }
}

export async function getReminderSettings(
  workspaceId: WorkspaceId,
  repos: Repositories = getRepositories()
): Promise<PublicReminderSettings> {
  const settings = await repos.settings.get(workspaceId)
  return toPublicReminderSettings(settings.reminders)
}

export async function saveReminderSettings(
  workspaceId: WorkspaceId,
  input: ReminderSettingsInput,
  repos: Repositories = getRepositories()
): Promise<PublicReminderSettings> {
  const current = await repos.settings.get(workspaceId)
  const reminders = applyReminderSettingsInput(current.reminders, input)
  const saved = await repos.settings.patch(workspaceId, { reminders })
  return toPublicReminderSettings(saved.reminders)
}
