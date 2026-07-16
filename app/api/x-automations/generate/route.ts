import { NextResponse } from "next/server"

import { ApiError, withHandler } from "@/lib/api"
import { clean, isRecord } from "@/lib/guards"
import { generateXAutomationRun } from "@/lib/x-automation-generation"
import {
  deleteXAutomationRuns,
  getXAutomation,
  listXAutomationRuns,
  upsertXAutomationRun,
  upsertXAutomation,
} from "@/lib/x-automation-store"
import type { XTrendCandidate } from "@/lib/x-automation"
import {
  benchmarkXRunWithJudge,
  deleteGeneratedXBenchmarksForRuns,
} from "@/lib/x-benchmarks"

export const dynamic = "force-dynamic"

export const GET = withHandler(async (request: Request) => {
  const automationId = new URL(request.url).searchParams
    .get("automationId")
    ?.trim()
  return NextResponse.json({ runs: await listXAutomationRuns(automationId) })
})

export const DELETE = withHandler(async (request: Request) => {
  const automationId = new URL(request.url).searchParams
    .get("automationId")
    ?.trim()
  if (!automationId) throw new ApiError(400, "An automation id is required")
  const automation = await getXAutomation(automationId)
  if (!automation) throw new ApiError(404, "X automation not found")

  const deletedRuns = await deleteXAutomationRuns(automationId)
  const deletedBenchmarks = await deleteGeneratedXBenchmarksForRuns(
    deletedRuns.map((run) => run.id)
  )
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
    deletedBenchmarks: deletedBenchmarks.length,
  })
})

export const POST = withHandler(async (request: Request) => {
  const payload = await request.json().catch(() => null)
  const automationId = clean(payload?.automationId)
  if (!automationId) throw new ApiError(400, "An automation id is required")
  const automation = await getXAutomation(automationId)
  if (!automation) throw new ApiError(404, "X automation not found")
  const run = await generateXAutomationRun({
    automation,
    topic: clean(payload?.topic),
    sourceCandidate: isRecord(payload?.sourceCandidate)
      ? (payload.sourceCandidate as XTrendCandidate)
      : undefined,
  })
  await upsertXAutomationRun(run)
  if (!run.needsReview) {
    await benchmarkXRunWithJudge({
      run,
      niche: automation.niche.label,
    }).catch((error) => {
      console.error("[x-automations/generate] benchmark grading failed", {
        runId: run.id,
        error,
      })
    })
  }
  const usedAt = run.createdAt
  await upsertXAutomation({
    ...automation,
    usage: {
      recentArchetypes: [
        ...automation.usage.recentArchetypes,
        ...(run.plans ?? []).map((plan) => ({
          id: plan.archetype,
          at: usedAt,
        })),
      ].slice(-100),
      recentHooks: [
        ...automation.usage.recentHooks,
        ...(run.plans ?? []).map((plan) => plan.hookStyle),
      ].slice(-30),
      recentBodies: [
        ...automation.usage.recentBodies,
        ...(run.platform === "threads" && run.posts[0]
          ? [
              {
                body:
                  run.posts[0].text
                    .split(/\n\s*\n/)
                    .slice(1)
                    .join("\n\n") || run.posts[0].text,
                hook: run.posts[0].text.split(/\n/)[0] || run.hook,
                at: usedAt,
              },
            ]
          : []),
      ].slice(-100),
    },
  })
  return NextResponse.json({ run }, { status: 201 })
})
