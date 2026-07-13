import { DateTime } from "luxon"

import type { Automation } from "@/lib/realfarm-data"
import type { AutomationDay } from "@/lib/realfarm-automation"

export type UpcomingAutomationPost = {
  key: string
  label: string
  scheduledAt: string
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

export function upcomingAutomationPosts(
  automation: Automation,
  now = new Date(),
  count = 2
): UpcomingAutomationPost[] {
  const zone = validZone(automation.timezone)
  const current = DateTime.fromJSDate(now, { zone })
  const configured = automation.schedule?.posting_times?.filter(
    (postingTime) => postingTime.enabled !== false
  )
  const postingTimes =
    configured && configured.length > 0
      ? configured
      : automation.times.map((time) => ({ time, days: weekdays }))

  const candidates = Array.from({ length: 15 }, (_, dayOffset) => {
    const day = current.startOf("day").plus({ days: dayOffset })
    const weekday = weekdays[day.weekday - 1]
    return postingTimes.flatMap((postingTime) => {
      if (postingTime.days.length > 0 && !postingTime.days.includes(weekday)) {
        return []
      }
      const parsed = parsePostingTime(postingTime.time)
      if (!parsed) return []
      const scheduled = day.set(parsed)
      return scheduled > current ? [scheduled] : []
    })
  })
    .flat()
    .sort((first, second) => first.toMillis() - second.toMillis())
    .slice(0, Math.max(0, count))

  return candidates.map((scheduled) => ({
    key: scheduled.toISO() ?? `${scheduled.toMillis()}`,
    label: upcomingPostLabel(scheduled, current),
    scheduledAt: scheduled.toISO() ?? "",
  }))
}

function upcomingPostLabel(scheduled: DateTime, current: DateTime) {
  const dayDifference = Math.round(
    scheduled.startOf("day").diff(current.startOf("day"), "days").days
  )
  const dayLabel =
    dayDifference === 0
      ? "Today"
      : dayDifference === 1
        ? "Tomorrow"
        : scheduled.toFormat("ccc, LLL d")
  return `${dayLabel}, ${scheduled.toFormat("h:mm a")}`
}

function parsePostingTime(value: string) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(value.trim())
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const period = match[3]?.toUpperCase()
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) {
    return null
  }
  if (period) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (period === "PM" ? 12 : 0)
  } else if (hour > 23) {
    return null
  }
  return { hour, minute, second: 0, millisecond: 0 }
}

function validZone(value: string | undefined) {
  const zone = value?.trim() || DateTime.local().zoneName
  return DateTime.local().setZone(zone).isValid
    ? zone
    : DateTime.local().zoneName
}
