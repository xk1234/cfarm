import { NextResponse } from "next/server"

import { ApiError, readRouteId, withHandler } from "@/lib/api"
import { getAutomationRecord } from "@/lib/automations"
import { getCurrentUser } from "@/lib/auth"
import {
  deterministicJobId,
  enqueueJob,
  getJob,
  retryGenerationJob,
} from "@/lib/queue"
import { getUgcRunStatus } from "@/lib/ugc-run-status"

export const dynamic = "force-dynamic"

export const POST = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    assertUgcEnabled()
    const id = await readRouteId(params)
    if (!id) throw new ApiError(400, "A UGC run id is required.")
    const user = await getCurrentUser()
    if (!user) throw new ApiError(401, "Authentication is required.")
    const run = await getUgcRunStatus(id)
    if (!run) throw new ApiError(404, "UGC run not found.")
    const automation = await getAutomationRecord(run.automationId)
    if (
      !automation ||
      automation.schema.automationKind !== "ugc" ||
      automation.schema.ugc?.enabled !== true
    ) {
      throw new ApiError(404, "UGC automation not found.")
    }
    if (!run.scheduledFor)
      throw new ApiError(
        409,
        "This run has no schedule identity and cannot be resumed."
      )

    const dedupeKey = `ugc-auto:${run.automationId}:${run.scheduledFor}`
    const jobId = deterministicJobId(user.$id, dedupeKey)
    const enqueue = await enqueueJob({
      type: "run-ugc-automation",
      payload: {
        automationId: run.automationId,
        scheduledFor: run.scheduledFor,
      },
      dedupeKey,
    })
    if (!enqueue) throw new ApiError(503, "The job queue is not configured.")
    if (enqueue.status === "enqueued") {
      return NextResponse.json({
        jobId,
        status: "queued",
        resumedFromCache: true,
      })
    }

    const existing = await getJob(jobId)
    if (!existing) throw new ApiError(404, "UGC generation job not found.")
    if (existing.type !== "run-ugc-automation")
      throw new ApiError(409, "The deterministic queue item is not a UGC job.")
    if (existing.status !== "failed" && existing.status !== "dead") {
      throw new ApiError(
        409,
        existing.status === "completed"
          ? "This UGC run is already complete."
          : "This UGC run is already queued or processing."
      )
    }
    const retried = await retryGenerationJob(jobId)
    if (!retried?.retried)
      throw new ApiError(409, "The UGC job could not be retried.")
    return NextResponse.json({
      jobId,
      status: retried.job.status,
      resumedFromCache: true,
    })
  }
)

function assertUgcEnabled() {
  if (process.env.ENABLE_UGC_AUTOMATION !== "true")
    throw new ApiError(404, "UGC automation is not enabled.")
}
