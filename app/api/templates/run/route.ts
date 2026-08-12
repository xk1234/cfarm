import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { getAutomationRecord } from "@/lib/automations"
import { queueSlideshowTemplateWorkflow } from "@/lib/generation-workflows"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  return runAutomations(request)
})

async function runAutomations(request: Request) {
  const body = await request.json().catch(() => null)
  const templateId = stringValue(body?.templateId)
  if (!templateId || body?.force !== true) {
    throw new ApiError(
      400,
      "Interactive generation requires templateId and force=true"
    )
  }
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Authentication is required")
  const template = await getAutomationRecord(templateId)
  if (!template) throw new ApiError(404, "Template not found")
  if (template.schema.automationKind !== "slideshow") {
    throw new ApiError(
      409,
      "This endpoint accepts slideshow templates; video and post templates use their Windmill generation endpoints"
    )
  }
  const workflow = await queueSlideshowTemplateWorkflow({
    templateId,
    ownerId: user.$id,
    requestId: stringValue(body?.requestId),
    hook: stringValue(body?.hook),
    scheduledFor: dateValue(body?.now)?.toISOString(),
    generationSource: "manual",
  })
  return NextResponse.json(
    {
      status: "queued",
      workflow,
      pollUrl: `/api/workflow-runs/${encodeURIComponent(workflow.jobId)}`,
    },
    { status: 202 }
  )
}

function dateValue(value: unknown) {
  const date = typeof value === "string" ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date : undefined
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}
