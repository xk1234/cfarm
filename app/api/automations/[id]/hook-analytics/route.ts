import { NextResponse } from "next/server"

import { withHandler, readRouteId } from "@/lib/api"
import { hookAnalyticsReport } from "@/lib/hook-publications"

export const dynamic = "force-dynamic"

export const GET = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)
    if (!id) {
      return NextResponse.json(
        { error: "An automation id is required" },
        { status: 400 }
      )
    }
    const report = await hookAnalyticsReport(id)
    if (!report) {
      return NextResponse.json(
        { error: "Automation not found" },
        { status: 404 }
      )
    }
    return NextResponse.json(report)
  }
)
