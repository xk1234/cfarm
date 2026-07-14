import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { clean } from "@/lib/guards"
import { publishXAutomationRun } from "@/lib/x-automation-publishing"
import {
  listXAutomations,
  listXAutomationRuns,
  upsertXAutomationRun,
} from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const runId = clean(payload?.runId)
  const run = (await listXAutomationRuns()).find((item) => item.id === runId)
  if (!run) throw new ApiError(404, "X automation run not found")
  const automation = (await listXAutomations()).find(
    (item) => item.id === run.automationId
  )
  if (!automation) throw new ApiError(404, "X automation not found")

  const publishing = await publishXAutomationRun({ automation, run })
  const updated = {
    ...run,
    publishing,
    status:
      publishing.published > 0
        ? ("published" as const)
        : publishing.failed > 0
          ? ("failed" as const)
          : run.status,
    updatedAt: new Date().toISOString(),
  }
  await upsertXAutomationRun(updated)
  return NextResponse.json({ run: updated })
})
