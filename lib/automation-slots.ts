import { DateTime } from "luxon"

import type { Automation } from "@/lib/realfarm-data"
import type {
  AutomationDay,
  AutomationSchedule,
} from "@/lib/realfarm-automation"

export type AutomationSlot = {
  automationId: string
  automationName: string
  scheduledFor: string
  timezone: string
  paused: boolean
}

export const SLIDESHOW_GENERATION_LEAD_MINUTES = 30
export const UGC_GENERATION_LEAD_MINUTES = 60

export type SlideshowGenerationTimingInput = {
  posting_mode?: unknown
  generation_lead_minutes?: unknown
}

type LegacyScheduleInterval = {
  every_n_hours: number
  start_time: string
  end_time: string
  days: AutomationDay[]
  enabled?: boolean
}

export type AutomationScheduleInput = AutomationSchedule & {
  interval?: LegacyScheduleInterval
}

type SlotOptions = {
  includePaused?: boolean
  random?: (slotISO: string) => number
}

/** Canonical lead used by both the scheduler and calendar projections. */
export function slideshowGenerationLeadMinutes(
  input: SlideshowGenerationTimingInput
) {
  if (input.posting_mode !== "review") {
    return SLIDESHOW_GENERATION_LEAD_MINUTES
  }
  const configured = Number(input.generation_lead_minutes)
  return Number.isFinite(configured) && configured > 0
    ? configured
    : SLIDESHOW_GENERATION_LEAD_MINUTES
}

export function ugcGenerationLeadMinutes(input: SlideshowGenerationTimingInput) {
  const configured = Number(input.generation_lead_minutes)
  return Number.isFinite(configured) && configured > 0
    ? configured
    : UGC_GENERATION_LEAD_MINUTES
}

export function generationExpectedAt(publishedAt: string, leadMinutes: number) {
  const timestamp = Date.parse(publishedAt)
  if (!Number.isFinite(timestamp)) return undefined
  return new Date(
    timestamp - Math.max(0, Number(leadMinutes) || 0) * 60_000
  ).toISOString()
}

const weekdays: AutomationDay[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
]

/**
 * Canonical slot projection used by the runner, Appwrite scheduler, calendar,
 * and automation-card preview. Keep this file runtime-portable: the Appwrite
 * deployment transpiles it to the function bundle via scripts/sync-function-shared.mjs.
 */
export function automationSlotsInRange(
  automation: Pick<
    Automation,
    "id" | "name" | "status" | "times" | "timezone" | "schedule"
  >,
  from: Date,
  to: Date
): AutomationSlot[] {
  const timezone = validZone(
    automation.schedule?.timezone || automation.timezone
  )
  const schedule = scheduleForAutomation(automation, timezone)
  return scheduleSlotsInRange(schedule, from, to, {
    includePaused: true,
  }).map((scheduledFor) => ({
    automationId: automation.id,
    automationName: automation.name,
    scheduledFor,
    timezone,
    paused:
      automation.status === "paused" || automation.schedule?.paused === true,
  }))
}

export function dueAutomationSlots(
  scheduleOrSchema:
    AutomationScheduleInput | { schedule?: AutomationScheduleInput },
  now: Date,
  lookbackMinutes: number,
  generationLeadMinutes = 0,
  random?: (slotISO: string) => number
) {
  const schedule = scheduleInput(scheduleOrSchema)
  if (!schedule || schedule.paused) return []
  const timezone = validZone(schedule.timezone)
  const earliest = DateTime.fromJSDate(
    new Date(now.getTime() - Math.max(0, lookbackMinutes) * 60_000),
    { zone: timezone }
  )
  const latest = DateTime.fromJSDate(
    new Date(now.getTime() + Math.max(0, generationLeadMinutes) * 60_000),
    { zone: timezone }
  )

  return baseSlotsInRange(schedule, earliest, latest)
    .map((slot) => jitteredSlot(slot, schedule, random))
    .map(toUtcISO)
    .filter((value): value is string => Boolean(value))
    .filter(unique)
    .sort(byTimestamp)
}

export function scheduleSlotsInRange(
  schedule: AutomationScheduleInput,
  from: Date,
  to: Date,
  options: SlotOptions = {}
) {
  if (schedule.paused && !options.includePaused) return []
  const timezone = validZone(schedule.timezone)
  const start = DateTime.fromJSDate(from, { zone: timezone })
  const end = DateTime.fromJSDate(to, { zone: timezone })
  if (!start.isValid || !end.isValid || end < start) return []

  const jitterMinutes = scheduleJitterMinutes(schedule)
  const candidates = baseSlotsInRange(
    schedule,
    start.minus({ minutes: jitterMinutes }),
    end.plus({ minutes: jitterMinutes })
  )

  return candidates
    .map((slot) => jitteredSlot(slot, schedule, options.random))
    .filter((slot) => slot >= start && slot <= end)
    .map(toUtcISO)
    .filter((value): value is string => Boolean(value))
    .filter(unique)
    .sort(byTimestamp)
}

function baseSlotsInRange(
  schedule: AutomationScheduleInput,
  start: DateTime,
  end: DateTime
) {
  const slots: DateTime[] = []
  const dayCount = Math.min(370, Math.ceil(end.diff(start, "days").days) + 2)

  for (let offset = 0; offset < dayCount; offset += 1) {
    const day = start.startOf("day").plus({ days: offset })
    if (day > end.endOf("day")) break
    const weekday = weekdays[day.weekday - 1]

    for (const postingTime of schedule.posting_times || []) {
      if (postingTime.enabled === false) continue
      if (postingTime.days.length > 0 && !postingTime.days.includes(weekday)) {
        continue
      }
      const parsed = parsePostingTime(postingTime.time, day.zoneName)
      if (!parsed) continue
      const slot = day.set(parsed)
      if (slot >= start && slot <= end) slots.push(slot)
    }

    const interval = schedule.interval
    if (
      interval?.enabled !== false &&
      interval &&
      (interval.days.length === 0 || interval.days.includes(weekday))
    ) {
      const intervalStart = parsePostingTime(interval.start_time, day.zoneName)
      const intervalEnd = parsePostingTime(interval.end_time, day.zoneName)
      if (!intervalStart || !intervalEnd) continue
      let slot = day.set(intervalStart)
      const last = day.set(intervalEnd)
      const step = Number(interval.every_n_hours)
      if (!Number.isFinite(step) || step <= 0 || last < slot) continue
      while (slot <= last) {
        if (slot >= start && slot <= end) slots.push(slot)
        slot = slot.plus({ hours: step })
      }
    }
  }

  const seen = new Set<string>()
  return slots.filter((slot) => {
    const key = toUtcISO(slot)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function jitteredSlot(
  slot: DateTime,
  schedule: AutomationScheduleInput,
  random?: (slotISO: string) => number
) {
  const jitterMinutes = scheduleJitterMinutes(schedule)
  if (jitterMinutes === 0) return slot
  const slotISO = toUtcISO(slot) || slot.toString()
  const value = clampRandom(random?.(slotISO) ?? deterministicRandom(slotISO))
  const offset = Math.round((value * 2 - 1) * jitterMinutes)
  return slot.plus({ minutes: offset })
}

function scheduleJitterMinutes(schedule: AutomationScheduleInput) {
  return Math.max(0, Number(schedule.jitter_minutes) || 0)
}

function scheduleInput(
  value: AutomationScheduleInput | { schedule?: AutomationScheduleInput }
): AutomationScheduleInput | undefined {
  const wrapped = value as { schedule?: AutomationScheduleInput }
  return wrapped.schedule ?? (value as AutomationScheduleInput)
}

function scheduleForAutomation(
  automation: Pick<Automation, "schedule" | "times">,
  timezone: string
): AutomationScheduleInput {
  const schedule = automation.schedule as AutomationScheduleInput | undefined
  if (schedule?.posting_times?.length || schedule?.interval) return schedule
  return {
    timezone,
    posting_times: automation.times.map((time) => ({
      time,
      days: weekdays,
    })),
  }
}

function parsePostingTime(value: string, zone: string | null) {
  const formats = ["h:mm a", "h a", "H:mm", "HH:mm"]
  for (const format of formats) {
    const parsed = DateTime.fromFormat(
      String(value).trim().toUpperCase(),
      format,
      {
        zone: zone || "UTC",
      }
    )
    if (parsed.isValid) {
      return {
        hour: parsed.hour,
        minute: parsed.minute,
        second: 0,
        millisecond: 0,
      }
    }
  }
  return null
}

function deterministicRandom(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 0xffffffff
}

function clampRandom(value: number) {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

function toUtcISO(value: DateTime) {
  return value.toUTC().toISO({ suppressMilliseconds: false })
}

function unique(value: string, index: number, values: string[]) {
  return values.indexOf(value) === index
}

function byTimestamp(first: string, second: string) {
  return Date.parse(first) - Date.parse(second)
}

function validZone(value: string | undefined) {
  const zone = value?.trim() || DateTime.local().zoneName
  return DateTime.local().setZone(zone).isValid
    ? zone
    : DateTime.local().zoneName
}
