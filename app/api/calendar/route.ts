import { NextResponse } from "next/server"

import { ApiError } from "@/lib/api"
import { listCalendarItems, MAX_CALENDAR_RANGE_DAYS } from "@/lib/calendar-feed"
import { publishingRoute, requireWorkspace } from "@/lib/publishing/http"

export const dynamic = "force-dynamic"

const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms) : null
}

/**
 * Scheduled, publishing, published and failed posts in `[from, to)`
 * (defaults to the current UTC month).
 */
export const GET = publishingRoute(async (request) => {
  const { workspaceId } = await requireWorkspace()
  const params = new URL(request.url).searchParams
  const from = parseDate(params.get("from"))
  const to = parseDate(params.get("to"))
  if ((params.has("from") && !from) || (params.has("to") && !to)) {
    throw new ApiError(400, "from and to must be valid ISO dates")
  }
  const now = new Date()
  const start = from ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = to ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  if (end <= start) throw new ApiError(400, "to must be after from")
  if (end.getTime() - start.getTime() > MAX_CALENDAR_RANGE_DAYS * DAY_MS) {
    throw new ApiError(400, `The range can span at most ${MAX_CALENDAR_RANGE_DAYS} days`)
  }
  const { items, summary } = await listCalendarItems(workspaceId, {
    from: start.toISOString(),
    to: end.toISOString(),
  })
  return NextResponse.json({ from: start.toISOString(), to: end.toISOString(), items, summary })
})
