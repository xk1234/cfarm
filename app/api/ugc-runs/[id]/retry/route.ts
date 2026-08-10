import { NextResponse } from "next/server"

import { ApiError, readRouteId, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { runVideoTemplateWorkflow } from "@/lib/generation-workflows"
import { getUgcRunStatus } from "@/lib/ugc-run-status"

export const dynamic = "force-dynamic"

export const POST = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)
    if (!id) throw new ApiError(400, "A UGC run id is required.")
    const user = await getCurrentUser()
    if (!user) throw new ApiError(401, "Authentication is required.")
    const run = await getUgcRunStatus(id)
    if (!run) throw new ApiError(404, "UGC run not found.")
    if (!run.scheduledFor) {
      throw new ApiError(
        409,
        "This run has no generation identity and cannot be resumed."
      )
    }
    const result = await runVideoTemplateWorkflow({
      templateId: run.automationId,
      ownerId: user.$id,
      requestId: `ugc-retry-${id}-${run.updatedAt}`,
      generationId: id,
      scheduledFor: run.scheduledFor,
    })
    return NextResponse.json(result)
  }
)
