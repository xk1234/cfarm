// In-memory, per-process progress for in-flight automation runs. This is a
// live view only — nothing is persisted, and a process restart simply loses
// the progress of runs it killed (the stale-claim healer marks those failed).
// Stored on globalThis so the runner and API routes share one registry even
// if the module graph duplicates in dev.

export type AutomationRunProgress = {
  stage: string
  detail?: string
  updatedAt: string
}

const registry: Map<string, AutomationRunProgress> = ((
  globalThis as Record<string, unknown>
).__automationRunProgress ??= new Map()) as Map<string, AutomationRunProgress>

export function setAutomationRunProgress(
  runId: string,
  stage: string,
  detail?: string
) {
  if (!runId) return
  registry.set(runId, {
    stage,
    ...(detail ? { detail } : {}),
    updatedAt: new Date().toISOString(),
  })
}

export function automationRunProgress(runId: string) {
  return registry.get(runId)
}

export function clearAutomationRunProgress(runId: string) {
  registry.delete(runId)
}
