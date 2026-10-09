import crypto from "node:crypto"

export type UgcCheckpoint = Record<string, unknown> & { storagePath?: string; storagePaths?: string[] }
export type UgcCheckpoints = Record<string, UgcCheckpoint>
export class UgcConfigurationError extends Error {
  readonly nonRetryable = true
  readonly telegramNotified: boolean
  constructor(message: string, options: { telegramNotified?: boolean } = {}) { super(message); this.name = "UgcConfigurationError"; this.telegramNotified = options.telegramNotified === true }
}

export const ugcRunId = (automationId: string, scheduledFor: string) => `ugcrun${hash(`${automationId}:${scheduledFor}`, 29)}`
export const ugcExportId = (automationId: string, scheduledFor: string) => `ugc-${hash(`${automationId}:${scheduledFor}`, 32)}`

export type UgcStageName = "analysis" | "script" | "actor" | "voice" | "motion" | "lipsync" | "broll" | "composite" | "store" | "publish"
export const ugcStageOrder: readonly UgcStageName[] = ["analysis", "script", "actor", "voice", "motion", "lipsync", "broll", "composite", "store", "publish"]

export async function runUgcAutomation(input: {
  automationId: string
  ownerId: string
  scheduledFor: string
  automation: { status?: string; schema?: { status?: string; ugc?: { enabled?: boolean } } }
  checkpoints?: UgcCheckpoints
  assetExists?: (path: string) => Promise<boolean>
  stages: Partial<Record<UgcStageName | "analyze", (context: { runId: string; exportId: string; checkpoints: UgcCheckpoints }) => Promise<unknown>>>
  saveCheckpoint?: (stage: UgcStageName, checkpoint: UgcCheckpoint, checkpoints: UgcCheckpoints) => Promise<void>
  stopAfter?: UgcStageName
}) {
  const runId = ugcRunId(input.automationId, input.scheduledFor), exportId = ugcExportId(input.automationId, input.scheduledFor)
  if (input.automation.status !== "live" || input.automation.schema?.status !== "live") return { skipped: true as const, reason: "not_live", runId, exportId, checkpoints: input.checkpoints ?? {} }
  if (input.automation.schema.ugc?.enabled !== true) return { skipped: true as const, reason: "ugc_disabled", runId, exportId, checkpoints: input.checkpoints ?? {} }
  const checkpoints = structuredClone(input.checkpoints ?? {})
  for (const stage of ugcStageOrder) {
    const existing = checkpoints[stage]
    if (existing && await checkpointIsDurable(existing, input.assetExists)) {
      if (input.stopAfter === stage) break
      continue
    }
    const handler = input.stages[stage] ?? (stage === "analysis" ? input.stages.analyze : undefined)
    if (!handler) {
      if (input.stopAfter) continue
      throw new Error(`UGC stage ${stage} is not configured`)
    }
    const value = await handler({ runId, exportId, checkpoints })
    const checkpoint = value && typeof value === "object" ? value as UgcCheckpoint : { value }
    checkpoints[stage] = checkpoint
    await input.saveCheckpoint?.(stage, checkpoint, checkpoints)
    if (input.stopAfter === stage) break
  }
  return { skipped: false as const, runId, exportId, checkpoints }
}

export async function checkpointIsDurable(checkpoint: UgcCheckpoint, assetExists?: (path: string) => Promise<boolean>) {
  const paths = [checkpoint.storagePath, ...(Array.isArray(checkpoint.storagePaths) ? checkpoint.storagePaths : [])].filter((value): value is string => typeof value === "string" && value.length > 0)
  if (!paths.length) return true
  if (!assetExists) return false
  return (await Promise.all(paths.map((path) => assetExists(path)))).every(Boolean)
}
const hash = (value: string, length: number) => crypto.createHash("sha256").update(value).digest("hex").slice(0, length)
