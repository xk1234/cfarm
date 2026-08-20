// App-side helpers for Railway's native `jobs` table.
import crypto from "node:crypto"

import { getCurrentUser } from "@/lib/auth"
import {
  railwayJobRepository,
  type StoredJob,
} from "@/lib/railway/job-repository"
import { systemOwnerId } from "@/lib/system-owner-context"

export type JobStatus =
  "queued" | "processing" | "completed" | "failed" | "dead"

export type EnqueueInput = {
  type: string
  payload?: unknown
  /** Stable key to prevent duplicate enqueues (same key => same row). */
  dedupeKey?: string
  priority?: number
  maxAttempts?: number
  availableAt?: Date
}

export type Job = {
  id: string
  type: string
  status: JobStatus
  payload: unknown
  result: unknown
  error: string | null
  attempts: number
  maxAttempts: number
  availableAt: string | null
  createdAt: string | null
  updatedAt: string | null
  ownerId: string
}

export function deterministicJobId(ownerId: string, dedupeKey: string): string {
  return jobId(`${ownerId}:${dedupeKey}`)
}

function jobId(basis: string): string {
  return (
    "j" + crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)
  )
}

function mapJob(row: StoredJob): Job {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: row.payload,
    result: row.result,
    error: row.error,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    availableAt: row.runAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ownerId: row.ownerId,
  }
}

async function queueOwnerId() {
  return systemOwnerId() ?? (await getCurrentUser())?.$id
}

/** Push a job onto Railway's durable queue. */
export async function enqueueJob(
  input: EnqueueInput
): Promise<{ id: string; status: "enqueued" | "duplicate" } | null> {
  const ownerId = await queueOwnerId()
  if (!ownerId) throw new Error("Authentication is required to enqueue jobs.")
  const dedupe = input.dedupeKey ?? `${input.type}:${crypto.randomUUID()}`
  const id = deterministicJobId(ownerId, dedupe)
  const status = await railwayJobRepository.enqueue({
    id,
    ownerId,
    type: input.type,
    payload: input.payload ?? null,
    priority: input.priority ?? 0,
    maxAttempts: input.maxAttempts ?? 3,
    runAt: input.availableAt ?? new Date(),
    dedupeKey: dedupe,
  })
  return { id, status }
}

/** List jobs, most-recent first, optionally filtered by status/type. */
export async function listJobs(
  opts: { status?: JobStatus; type?: string; limit?: number } = {}
): Promise<Job[]> {
  const ownerId = await queueOwnerId()
  if (!ownerId) return []
  const rows = await railwayJobRepository.list({
    ownerId,
    status: opts.status,
    type: opts.type,
    limit: Math.max(1, opts.limit ?? 50),
  })
  return rows.map(mapJob)
}

export async function getJob(id: string): Promise<Job | null> {
  const ownerId = await queueOwnerId()
  if (!ownerId) return null
  const stored = await railwayJobRepository.get(id)
  return stored?.ownerId === ownerId ? mapJob(stored) : null
}

/** Count of jobs per status (for a queue dashboard). */
export async function queueStats(): Promise<Record<JobStatus, number>> {
  const statuses: JobStatus[] = [
    "queued",
    "processing",
    "completed",
    "failed",
    "dead",
  ]
  const empty = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<
    JobStatus,
    number
  >
  const ownerId = await queueOwnerId()
  if (!ownerId) return empty
  Object.assign(empty, await railwayJobRepository.stats(ownerId))
  return empty
}
