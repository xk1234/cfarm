import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { calendarItems } from "@/lib/calendar-feed"
import {
  calendarItemMatchesFilters,
  type CalendarFilters,
  type CalendarItem,
} from "@/lib/calendar-items"
import { getRepositories } from "@/lib/data"
import { clean } from "@/lib/guards"
import { requireWorkspaceId } from "@/lib/workspace"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const workspaceId = await requireWorkspaceId()
  const { searchParams } = new URL(request.url)
  const now = new Date()
  const parsedFrom = validDate(searchParams.get("from"))
  const parsedTo = validDate(searchParams.get("to"))
  if (
    (searchParams.has("from") && !parsedFrom) ||
    (searchParams.has("to") && !parsedTo)
  ) {
    return NextResponse.json(
      { error: "from and to must be valid ISO dates" },
      { status: 400 }
    )
  }
  const from = parsedFrom ?? startOfMonth(now)
  const to = parsedTo ?? endOfMonth(now)
  if (to < from) {
    return NextResponse.json({ error: "to must be after from" }, { status: 400 })
  }

  const items = await calendarItems(getRepositories(), workspaceId, from, to)
  const filtered = items.filter((item) =>
    calendarItemMatchesFilters(item, calendarFilters(searchParams))
  )
  return NextResponse.json({
    items: filtered,
    summary: calendarSummary(filtered),
    range: { from: from.toISOString(), to: to.toISOString() },
  })
})

function calendarFilters(searchParams: URLSearchParams): CalendarFilters {
  return {
    accounts: filterSet(searchParams, "accounts"),
    platforms: filterSet(searchParams, "platforms", true),
    statuses: filterSet(searchParams, "statuses"),
    sourceTypes: filterSet(searchParams, "sourceType"),
  }
}

function filterSet(searchParams: URLSearchParams, key: string, lowercase = false) {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => clean(value))
    .filter(Boolean)
    .map((value) => (lowercase ? value.toLowerCase() : value))
  return values.length ? new Set(values) : undefined
}

function calendarSummary(items: CalendarItem[]) {
  return {
    needsAction: items.filter((item) => item.status === "needs_action" || item.status === "draft").length,
    failed: items.filter((item) => ["generation_failed", "failed"].includes(item.status)).length,
    planned: items.filter((item) => item.status === "planned").length,
  }
}

function validDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
}
