import { NextResponse } from "next/server"

import { ApiError, readRouteId, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { resolveQueuedWorkflowResponse } from "@/lib/generation-workflows"
import { refreshOwnedWorkflowRun } from "@/lib/workflow-run-store"

export const dynamic = "force-dynamic"

export const GET = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const jobId = await readRouteId(params)
    if (!jobId) throw new ApiError(400, "A workflow run id is required")
    const user = await getCurrentUser()
    if (!user) throw new ApiError(401, "Authentication is required")
    const run = await refreshOwnedWorkflowRun(jobId, user.$id)
    if (!run) throw new ApiError(404, "Workflow run not found")

    if (run.status === "failed") {
      return NextResponse.json({
        status: "failed",
        error: run.error || "Workflow failed",
        workflow: run,
      })
    }
    if (run.status !== "succeeded" || !run.result) {
      return NextResponse.json({
        status: run.status,
        workflow: run,
        retryAfterMs: 2_000,
      })
    }

    const value = await resolveQueuedWorkflowResponse({
      run: {
        workflowId: run.workflowId,
        requestId: run.requestId,
        jobId: run.jobId,
        flowPath: run.flowPath,
        status: "succeeded",
        result: run.result,
      },
      templateId: run.templateId,
    })
    return NextResponse.json({ status: "succeeded", workflow: run, value })
  }
)
