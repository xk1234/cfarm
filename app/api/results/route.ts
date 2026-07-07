import { NextResponse } from "next/server"

import { listResultRecords } from "@/lib/results"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const automationId = searchParams.get("automationId")?.trim()
  const runId = searchParams.get("runId")?.trim()
  const id = searchParams.get("id")?.trim()
  const limitValue = Number(searchParams.get("limit"))
  const results = await listResultRecords({
    id: id || undefined,
    automationId: automationId || undefined,
    runId: runId || undefined,
    limit: Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 50,
  })

  return NextResponse.json({
    results,
    resultsCount: results.length,
  })
}
