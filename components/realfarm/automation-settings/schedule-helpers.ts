import type { AutomationDay, AutomationSchema } from "@/lib/realfarm-automation"

export const automationDays: AutomationDay[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
]
export const allPostingDays: AutomationDay[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
]

export function schedulePostingTimes(
  config: AutomationSchema
): AutomationSchema["schedule"]["posting_times"] {
  return config.schedule.posting_times.length > 0
    ? config.schedule.posting_times
    : [defaultPostingTime()]
}

export function defaultPostingTime() {
  return {
    time: "11:00 AM",
    days: allPostingDays,
  }
}

export function timeInputValue(value: string) {
  const minutes = minutesFromTimeLabel(value)
  if (minutes === null) {
    return "11:00"
  }
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export function displayTimeFromInput(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) {
    return "11:00 AM"
  }
  const hour24 = Math.min(23, Math.max(0, Number(match[1])))
  const minute = Math.min(59, Math.max(0, Number(match[2])))
  const period = hour24 >= 12 ? "PM" : "AM"
  const hour12 = hour24 % 12 || 12
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

export function timezoneLabel(timezone: string) {
  const label = timezone.split("/").at(-1) || timezone || "Local"
  return label.replace(/_/g, " ")
}

export function minutesFromTimeLabel(value: string) {
  const normalized = value.trim().toUpperCase()
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/.exec(normalized)
  if (!match) {
    return null
  }
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const period = match[3]
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) {
    return null
  }
  if (period === "PM" && hour < 12) {
    hour += 12
  }
  if (period === "AM" && hour === 12) {
    hour = 0
  }
  if (!period && hour === 24) {
    hour = 0
  }
  if (hour < 0 || hour > 23) {
    return null
  }
  return hour * 60 + minute
}

export function scheduleFrequencyLabel(
  postingTimes: AutomationSchema["schedule"]["posting_times"]
) {
  const everyDay = postingTimes.every(
    (postingTime) => postingTime.days.length === 7
  )
  if (everyDay) {
    return `${postingTimes.length}x every day`
  }
  return `${postingTimes.length} posting ${postingTimes.length === 1 ? "time" : "times"}`
}

