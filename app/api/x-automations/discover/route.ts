import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { clean } from "@/lib/guards"
import { getXAutomation } from "@/lib/x-automation-store"
import { discoverTrendCandidates } from "@/lib/x-trend-discovery"
import type { XDiscoverySource } from "@/lib/x-automation"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const automationId = clean(payload?.automationId)
  const automation = await getXAutomation(automationId)
  if (!automation) throw new ApiError(404, "X automation not found")
  const source = allowedSource(payload?.source)
  const candidates = await discoverTrendCandidates({
    automation,
    query: clean(payload?.query),
    source,
  })
  return NextResponse.json({ candidates })
})

function allowedSource(value: unknown): XDiscoverySource | undefined {
  return value === "x" || value === "tiktok" || value === "instagram"
    ? value
    : undefined
}
