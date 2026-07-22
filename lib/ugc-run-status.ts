import "server-only"

import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { getCurrentUser } from "@/lib/auth"
import { deterministicJobId } from "@/lib/queue"
import { systemOwnerId } from "@/lib/system-owner-context"
import {
  ugcStageOrder,
  type UgcCheckpoints,
  type UgcStageName,
} from "@/lib/ugc-automation-runner"

export type UgcDisplayStageStatus = "done" | "active" | "pending" | "failed"
export type UgcRunStage = {
  name: UgcStageName
  status: UgcDisplayStageStatus
  assetPaths: string[]
}
export type UgcRunStatus = {
  id: string
  automationId: string
  scheduledFor: string | null
  status: string
  error: string | null
  checkpoints: UgcCheckpoints
  stages: UgcRunStage[]
  createdAt: string | null
  updatedAt: string | null
}

type StoredRun = Record<string, unknown> & { checkpoints?: UgcCheckpoints }

export async function getUgcRunStatus(
  runId: string
): Promise<UgcRunStatus | null> {
  const aw = getAppwrite()
  const ownerId = systemOwnerId() ?? (await getCurrentUser())?.$id
  if (!aw || !ownerId) return null
  const response = await aw.tables.listRows(
    APPWRITE_DATABASE_ID,
    "automation_runs",
    [
      Query.equal("rid", [runId]),
      Query.equal("owner_id", [ownerId]),
      Query.limit(1),
    ]
  )
  const row = response.rows[0] as Record<string, unknown> | undefined
  if (!row) return null
  const record = parseRecord(row.data)
  if (!record || String(record.id || row.rid || "") !== runId) return null
  const automationId = String(record.automationId || "")
  const scheduledFor = stringOrNull(record.scheduledFor)
  if (automationId && scheduledFor) {
    const jobId =
      stringOrNull(record.jobId) ??
      deterministicJobId(ownerId, `ugc-auto:${automationId}:${scheduledFor}`)
    try {
      const job = (await aw.tables.getRow(
        APPWRITE_DATABASE_ID,
        "jobs",
        jobId
      )) as Record<string, unknown>
      if (
        job.owner_id === ownerId &&
        (job.status === "failed" || job.status === "dead")
      ) {
        record.status = "failed"
        record.error = job.error
      }
    } catch (error) {
      if ((error as { code?: number }).code !== 404) throw error
      const checkpoints = record.checkpoints ?? {}
      if (ugcStageOrder.some((stage) => !checkpoints[stage])) {
        record.status = "failed"
        record.error = "Generation job was lost. Completed stages remain cached."
      }
    }
  }
  return normalizeUgcRunStatus(record)
}

export function normalizeUgcRunStatus(record: StoredRun): UgcRunStatus {
  const checkpoints =
    record.checkpoints && typeof record.checkpoints === "object"
      ? record.checkpoints
      : {}
  const rawStatus = String(record.status || "pending")
  const failedStage =
    stageName(record.failedStage) ||
    (rawStatus === "failed" ? firstIncomplete(checkpoints) : null)
  const activeStage =
    rawStatus === "failed" ? null : firstIncomplete(checkpoints)
  return {
    id: String(record.id || ""),
    automationId: String(record.automationId || ""),
    scheduledFor: stringOrNull(record.scheduledFor),
    status: rawStatus,
    error: stringOrNull(record.error),
    checkpoints,
    stages: ugcStageOrder.map((name) => ({
      name,
      status: checkpoints[name]
        ? "done"
        : name === failedStage
          ? "failed"
          : name === activeStage
            ? "active"
            : "pending",
      assetPaths: assetPaths(checkpoints[name]),
    })),
    createdAt: stringOrNull(record.createdAt),
    updatedAt: stringOrNull(record.updatedAt),
  }
}

function firstIncomplete(checkpoints: UgcCheckpoints) {
  return ugcStageOrder.find((stage) => !checkpoints[stage]) ?? null
}
function stageName(value: unknown): UgcStageName | null {
  return ugcStageOrder.includes(value as UgcStageName)
    ? (value as UgcStageName)
    : null
}
function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null
}
function assetPaths(checkpoint: unknown) {
  if (!checkpoint || typeof checkpoint !== "object") return []
  const value = checkpoint as Record<string, unknown>
  return [
    value.storagePath,
    ...(Array.isArray(value.storagePaths) ? value.storagePaths : []),
    value.audioPath,
    value.timingsPath,
    value.videoPath,
    value.thumbnailPath,
  ]
    .filter(
      (path): path is string => typeof path === "string" && path.length > 0
    )
    .filter((path, index, all) => all.indexOf(path) === index)
}
function parseRecord(value: unknown): StoredRun | null {
  if (typeof value !== "string")
    return value && typeof value === "object" ? (value as StoredRun) : null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}
