import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { clean, isRecord } from "@/lib/guards"
import { generateXAutomationRun } from "@/lib/x-automation-generation"
import {
  listXAutomations,
  listXAutomationRuns,
  upsertXAutomationRun,
} from "@/lib/x-automation-store"
import type { XTrendCandidate } from "@/lib/x-automation"
import { publishXAutomationRun } from "@/lib/x-automation-publishing"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const automationId = new URL(request.url).searchParams
    .get("automationId")
    ?.trim()
  return NextResponse.json({ runs: await listXAutomationRuns(automationId) })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const automationId = clean(payload?.automationId)
  if (!automationId) throw new ApiError(400, "An automation id is required")
  const automation = (await listXAutomations()).find(
    (item) => item.id === automationId
  )
  if (!automation) throw new ApiError(404, "X automation not found")
  let run = await generateXAutomationRun({
    automation,
    topic: clean(payload?.topic),
    sourceCandidate: isRecord(payload?.sourceCandidate)
      ? (payload.sourceCandidate as XTrendCandidate)
      : undefined,
  })
  if (automation.publishing.autoPost) {
    const publishing = await publishXAutomationRun({ automation, run })
    run = {
      ...run,
      publishing,
      status:
        publishing.published > 0
          ? "published"
          : publishing.failed > 0
            ? "failed"
            : "draft",
      updatedAt: new Date().toISOString(),
    }
  }
  await upsertXAutomationRun(run)
  return NextResponse.json({ run }, { status: 201 })
})
