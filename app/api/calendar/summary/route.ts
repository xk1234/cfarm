import { NextResponse } from "next/server"

import { calendarAlertSummary } from "@/lib/calendar-summary"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ summary: await calendarAlertSummary() })
}
