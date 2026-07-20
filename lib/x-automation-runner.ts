import { clean } from "@/lib/guards"
import { enqueueReminder } from "@/lib/reminders"
import type { XAutomationRecord, XTrendCandidate } from "@/lib/x-automation"
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
  const run = {
    ...generated,
    requestId: clean(input.requestId) || undefined,
  }
  await upsertXAutomationRun(run)
  await enqueueReminder({
    event: "generated",
    sourceType: run.platform,
    sourceId: run.id,
    text: `Post generated\n${run.hook || input.automation.name}`,
  }).catch(() => undefined)

  const usedAt = run.createdAt
  await upsertXAutomation({
    ...input.automation,
    usage: {
      recentArchetypes: [
        ...input.automation.usage.recentArchetypes,
        ...(run.plans ?? []).map((plan) => ({
          id: plan.archetype,
          at: usedAt,
        })),
      ].slice(-100),
      recentHooks: [
        ...input.automation.usage.recentHooks,
        ...(run.plans ?? []).map((plan) => plan.hookStyle),
      ].slice(-30),
      recentBodies: [
        ...input.automation.usage.recentBodies,
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
  return run
}
