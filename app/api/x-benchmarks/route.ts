import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { clean } from "@/lib/guards"
import {
  benchmarkXRunWithJudge,
  listGeneratedXBenchmarks,
  listXBenchmarkCorpus,
  xBenchmarkComparisonForRun,
} from "@/lib/x-benchmarks"
import { getXAutomation, getXAutomationRun } from "@/lib/x-automation-store"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const runId = new URL(request.url).searchParams.get("runId")?.trim()
  if (runId)
    return NextResponse.json({
      comparison: await xBenchmarkComparisonForRun(runId),
    })
  const [corpus, generated] = await Promise.all([
    listXBenchmarkCorpus(),
    listGeneratedXBenchmarks(),
  ])
  return NextResponse.json({ corpus, generated })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const runId = clean(payload?.runId)
  if (!runId) throw new ApiError(400, "A run id is required")
  const run = await getXAutomationRun(runId)
  if (!run) throw new ApiError(404, "Draft not found")
  if (run.needsReview)
    throw new ApiError(
      422,
      "This draft failed deterministic validation and cannot be graded yet."
    )
  const automation = await getXAutomation(run.automationId)
  if (!automation) throw new ApiError(404, "Automation not found")
  const result = await benchmarkXRunWithJudge({
    run,
    niche: automation.niche.label,
  })
  return NextResponse.json({
    comparison: await xBenchmarkComparisonForRun(run.id),
    generated: !result.cacheHit,
  })
})
