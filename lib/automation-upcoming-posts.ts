import { DateTime } from "luxon"

import { automationSlotsInRange } from "@/lib/automation-slots"
import type { Automation } from "@/lib/realfarm-data"

export type UpcomingAutomationPost = {
  key: string
  label: string
  scheduledAt: string
}

export type NextUpcomingAutomationPost = UpcomingAutomationPost & {
  automationId: string
  automationName: string
}

export function nextUpcomingAutomationPost(
  automations: Automation[],
  now = new Date()
): NextUpcomingAutomationPost | null {
  let next: NextUpcomingAutomationPost | null = null

  for (const automation of automations) {
    if (automation.status !== "live" || automation.schedule?.paused === true) {
      continue
    }
    const post = upcomingAutomationPosts(automation, now, 1)[0]
    if (!post) continue
    if (next && Date.parse(post.scheduledAt) >= Date.parse(next.scheduledAt)) {
      continue
    }
    next = {
      ...post,
      automationId: automation.id,
      automationName: automation.name,
    }
  }

  return next
}

export function upcomingAutomationPosts(
  automation: Automation,
  now = new Date(),
  count = 2
): UpcomingAutomationPost[] {
  const zone = automation.schedule?.timezone || automation.timezone
  const current = DateTime.fromJSDate(now, { zone })
  const slots = automationSlotsInRange(
    automation,
    new Date(now.getTime() + 1),
    new Date(now.getTime() + 32 * 24 * 60 * 60_000)
  ).slice(0, Math.max(0, count))

  return slots.map((slot) => {
    const scheduled = DateTime.fromISO(slot.scheduledFor, {
      zone: slot.timezone,
    })
    return {
      key: slot.scheduledFor,
      label: upcomingPostLabel(scheduled, current),
      scheduledAt: slot.scheduledFor,
    }
  })
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
