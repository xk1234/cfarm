import { NextResponse } from "next/server"

import { ApiError, readRouteId, withHandler } from "@/lib/api"
import { getAutomationRecord } from "@/lib/automations"
import { actualUgcCostFromLedger, estimateUgcCost } from "@/lib/ugc-cost"
import { getUgcRunStatus } from "@/lib/ugc-run-status"

export const dynamic = "force-dynamic"

export const GET = withHandler<{ params: Promise<{ id: string }> }>(
  async (_request, { params }) => {
    assertUgcEnabled()
    const id = await readRouteId(params)
    if (!id) throw new ApiError(400, "A UGC run id is required.")
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
  const actual = await actualUgcCostFromLedger(id)
    return NextResponse.json({
      run,
      estimate: estimateUgcCost(automation.schema.ugc),
      actual,
    })
  }
)

function assertUgcEnabled() {
  if (process.env.ENABLE_UGC_AUTOMATION !== "true")
    throw new ApiError(404, "UGC automation is not enabled.")
}
