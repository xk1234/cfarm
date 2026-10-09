import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { clean, isRecord } from "@/lib/guards"
import {
  deleteXAutomationRuns,
  getXAutomation,
  listXAutomationRuns,
  upsertXAutomation,
} from "@/lib/x-automation-store"
import type { XTrendCandidate } from "@/lib/x-automation"
import { generateStoredXAutomationRun } from "@/lib/x-automation-runner"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const automationId = new URL(request.url).searchParams
    .get("automationId")
    ?.trim()
  return NextResponse.json({ runs: await listXAutomationRuns(automationId) })
})

export const DELETE = withHandler(async (request: Request) => {
  const automationId = new URL(request.url).searchParams
    .get("automationId")
    ?.trim()
  if (!automationId) throw new ApiError(400, "An automation id is required")
  const automation = await getXAutomation(automationId)
  if (!automation) throw new ApiError(404, "X automation not found")

  const deletedRuns = await deleteXAutomationRuns(automationId)
  await upsertXAutomation({
    ...automation,
    usage: {
      recentArchetypes: [],
      recentHooks: [],
      recentBodies: [],
    },
  })
  return NextResponse.json({
    deletedRuns: deletedRuns.length,
  })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const automationId = clean(payload?.automationId)
  if (!automationId) throw new ApiError(400, "An automation id is required")
  const automation = await getXAutomation(automationId)
  if (!automation) throw new ApiError(404, "X automation not found")
  const run = await generateStoredXAutomationRun({
    automation,
    topic: clean(payload?.topic),
    sourceCandidate: isRecord(payload?.sourceCandidate)
      ? (payload.sourceCandidate as XTrendCandidate)
      : undefined,
  })
  return NextResponse.json({ run }, { status: 201 })
})
