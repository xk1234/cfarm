import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { queueSocialTemplateWorkflow } from "@/lib/generation-workflows"
import { clean, isRecord } from "@/lib/guards"
import {
  deleteXAutomationRuns,
  getXAutomation,
  listXAutomationRuns,
  upsertXAutomation,
} from "@/lib/x-automation-store"
import type { XTrendCandidate } from "@/lib/x-automation"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const automationId = new URL(request.url).searchParams
    .get("templateId")
    ?.trim()
  return NextResponse.json({ runs: await listXAutomationRuns(automationId) })
})

export const DELETE = withHandler(async (request: Request) => {
  const automationId = new URL(request.url).searchParams
    .get("templateId")
    ?.trim()
  if (!automationId) throw new ApiError(400, "A template id is required")
  const automation = await getXAutomation(automationId)
  if (!automation) throw new ApiError(404, "Social template not found")

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
  const automationId = clean(payload?.templateId)
  if (!automationId) throw new ApiError(400, "A template id is required")
  const automation = await getXAutomation(automationId)
  if (!automation) throw new ApiError(404, "Social template not found")
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Authentication is required")
  const workflow = await queueSocialTemplateWorkflow({
    templateId: automation.id,
    ownerId: user.$id,
    topic: clean(payload?.topic),
    sourceCandidate: isRecord(payload?.sourceCandidate)
      ? (payload.sourceCandidate as XTrendCandidate)
      : undefined,
    requestId: clean(payload?.requestId),
  })
  return NextResponse.json(
    {
      status: "queued",
      workflow,
      pollUrl: `/api/workflow-runs/${encodeURIComponent(workflow.jobId)}`,
    },
    { status: 202 }
  )
})
