import { NextResponse } from "next/server"

import { listAutomationRuns } from "@/lib/automation-runner"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const automationId = searchParams.get("automationId")?.trim()
  const limitValue = Number(searchParams.get("limit"))
  const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 20
  const runs = await listAutomationRuns({
    automationId: automationId || undefined,
    limit,
  })

  return NextResponse.json({ runs })
}
