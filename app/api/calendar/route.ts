import { NextResponse } from "next/server"

import {
  calendarQueryFilters,
  loadCalendar,
  parseCalendarRange,
} from "@/features/calendar/server/load-calendar"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams
  const range = parseCalendarRange(searchParams)
  if (!range.ok) {
    return NextResponse.json({ error: range.error }, { status: 400 })
  }

  return NextResponse.json(
    await loadCalendar({
      from: range.from,
      to: range.to,
      filters: calendarQueryFilters(searchParams),
    })
  )
}
