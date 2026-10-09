import { NextResponse } from "next/server"

import { ApiError, readRouteId, withHandler } from "@/lib/api"
import { getAutomationRecord } from "@/lib/automations"
import { clean, isRecord } from "@/lib/guards"
import { getJob, retryGenerationJob } from "@/lib/queue"
import { getXAutomation } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export const POST = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    const id = await readRouteId(params)
    if (!id) throw new ApiError(400, "A generation job id is required.")

    const job = await getJob(id)
    if (!job) throw new ApiError(404, "Generation job not found.")
    if (job.type !== "run-automation" && job.type !== "run-x-automation" && job.type !== "run-ugc-automation") {
      throw new ApiError(409, "This queue item is not a generation job.")
    }
    if (job.status !== "failed" && job.status !== "dead") {
      throw new ApiError(409, "Only failed generations can be retried.")
    }

    const payload = isRecord(job.payload) ? job.payload : {}
    const automationId = clean(payload.automationId)
    if (!automationId) {
      throw new ApiError(
        409,
        "This failed generation has no source automation to retry."
      )
    }
    const sourceAutomation =
      job.type === "run-x-automation"
        ? await getXAutomation(automationId)
        : await getAutomationRecord(automationId)
    if (!sourceAutomation) {
      throw new ApiError(
        409,
        "The source automation no longer exists. Restore it before retrying this generation."
      )
    }

    const result = await retryGenerationJob(id)
    if (!result) throw new ApiError(404, "Generation job not found.")
    if (!result.retried) {
      throw new ApiError(
        409,
        result.reason === "not_generation"
          ? "This queue item is not a generation job."
          : "Only failed generations can be retried."
      )
    }

    return NextResponse.json({ job: result.job })
  }
)
