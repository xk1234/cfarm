import { clean } from "@/lib/guards"
import { enqueueReminder } from "@/lib/reminders"
import type {
  XAutomationRecord,
  XAutomationRun,
  XTrendCandidate,
} from "@/lib/x-automation"
import { generateXAutomationRun } from "@/lib/x-automation-generation"
import {
  upsertXAutomation,
  upsertXAutomationRun,
} from "@/lib/x-automation-store"

/**
 * Generate and persist one X/Threads draft through the same path used by the
 * HTTP route and MCP. Publishing remains a separate, explicitly confirmed
 * action.
 */
export async function generateStoredXAutomationRun(input: {
  automation: XAutomationRecord
  topic?: string
  sourceCandidate?: XTrendCandidate
  requestId?: string
}) {
  const generated = await generateXAutomationRun({
    automation: input.automation,
    topic: clean(input.topic),
    sourceCandidate: input.sourceCandidate,
  })
  return persistGeneratedXAutomationRun({
    automation: input.automation,
    run: generated,
    requestId: input.requestId,
  })
}

export async function persistGeneratedXAutomationRun(input: {
  automation: XAutomationRecord
  run: Awaited<ReturnType<typeof generateXAutomationRun>>
  requestId?: string
}) {
  const run = {
    ...input.run,
    requestId: clean(input.requestId) || undefined,
  }
  await upsertXAutomationRun(run)
  await enqueueReminder({
    event: "generated",
    sourceType: run.platform,
    sourceId: run.id,
    text: `Post generated\n${run.hook || input.automation.name}`,
  }).catch(() => undefined)

  await upsertXAutomation(
    buildXAutomationUsageUpdate({ automation: input.automation, run })
  )
  return run
}

export function buildXAutomationUsageUpdate(input: {
  automation: XAutomationRecord
  run: XAutomationRun
}) {
  const usedAt = input.run.createdAt
  return {
    ...input.automation,
    usage: {
      recentArchetypes: [
        ...input.automation.usage.recentArchetypes,
        ...(input.run.plans ?? []).map((plan) => ({
          id: plan.archetype,
          at: usedAt,
        })),
      ].slice(-100),
      recentHooks: [
        ...input.automation.usage.recentHooks,
        ...(input.run.plans ?? []).map((plan) => plan.hookStyle),
      ].slice(-30),
      recentBodies: [
        ...input.automation.usage.recentBodies,
        ...(input.run.platform === "threads" && input.run.posts[0]
          ? [
              {
                body:
                  input.run.posts[0].text
                    .split(/\n\s*\n/)
                    .slice(1)
                    .join("\n\n") || input.run.posts[0].text,
                hook: input.run.posts[0].text.split(/\n/)[0] || input.run.hook,
                at: usedAt,
              },
            ]
          : []),
      ].slice(-100),
    },
  }
}
