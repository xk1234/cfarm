import { NextResponse } from "next/server"

import { calendarAlertSummary } from "@/lib/calendar-summary"
import { publishingRoute, requireWorkspace } from "@/lib/publishing/http"

export const dynamic = "force-dynamic"

export const GET = publishingRoute(async () => {
  const { workspaceId } = await requireWorkspace()
  return NextResponse.json({ summary: await calendarAlertSummary(workspaceId) })
})
