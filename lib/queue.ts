import "server-only"

import crypto from "node:crypto"
import { and, desc, eq, inArray } from "drizzle-orm"

import { getCurrentUser } from "@/lib/auth"
import { getRailwayOrm } from "@/lib/railway/database"
import { jobs } from "@/lib/railway/schema"
import { systemOwnerId } from "@/lib/system-owner-context"

export type JobStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "dead"

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

export type RetryGenerationJobResult = {
  job: Job
  retried: boolean
  reason?: "not_generation" | "not_failed"
}

type DatabaseJob = typeof jobs.$inferSelect

const GENERATION_JOB_TYPES = [
  "run-automation",
  "run-x-automation",
  "run-ugc-automation",
] as const

export function deterministicJobId(ownerId: string, dedupeKey: string): string {
  return jobId(`${ownerId}:${dedupeKey}`)
}

function jobId(basis: string): string {
  return (
    "j" + crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)
  )
}

function mapJob(row: DatabaseJob): Job {
  return {
    id: row.id,
    type: row.jobType,
    status: normalizeStatus(row.status),
    payload: row.payload,
    result: row.result,
    error: row.error,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    availableAt: row.runAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    ownerId: row.ownerId ?? "",
  }
}

function normalizeStatus(value: string): JobStatus {
  return value === "processing" ||
    value === "completed" ||
    value === "failed" ||
    value === "dead"
    ? value
    : "queued"
}

async function queueOwnerId(): Promise<string> {
  return (
    systemOwnerId() ??
    (await getCurrentUser())?.$id ??
    (() => {
      throw new Error("Authentication is required to access jobs.")
    })()
  )
}

/** Push a job onto the PostgreSQL queue. Duplicate stable IDs are ignored. */
export async function enqueueJob(input: EnqueueInput): Promise<{
  id: string
  status: "enqueued" | "duplicate"
}> {
  const orm = getRailwayOrm()
  const ownerId = await queueOwnerId()
  const dedupeKey = input.dedupeKey ?? `${input.type}:${crypto.randomUUID()}`
  const id = deterministicJobId(ownerId, dedupeKey)
  const inserted = await orm
    .insert(jobs)
    .values({
      id,
      ownerId,
      jobType: input.type,
      status: "queued",
      payload: (input.payload ?? null) as Record<string, unknown>,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      runAt: input.availableAt ?? new Date(),
    })
    .onConflictDoNothing({ target: jobs.id })
    .returning({ id: jobs.id })
  return {
    id,
    status: inserted.length ? "enqueued" : "duplicate",
  }
}

/** List jobs owned by the current worker or user, most recent first. */
export async function listJobs(
  options: { status?: JobStatus; type?: string; limit?: number } = {}
): Promise<Job[]> {
  const orm = getRailwayOrm()
  const ownerId = await queueOwnerId()
  const filters = [eq(jobs.ownerId, ownerId)]
  if (options.status) filters.push(eq(jobs.status, options.status))
  if (options.type) filters.push(eq(jobs.jobType, options.type))
  const rows = await orm
    .select()
    .from(jobs)
    .where(and(...filters))
    .orderBy(desc(jobs.createdAt))
    .limit(Math.max(1, Math.min(options.limit ?? 50, 500)))
  return rows.map(mapJob)
}

export async function getJob(id: string): Promise<Job | null> {
  const orm = getRailwayOrm()
  const ownerId = await queueOwnerId()
  const rows = await orm.select().from(jobs).where(eq(jobs.id, id)).limit(1)
  const job = rows[0]
  return job && job.ownerId === ownerId ? mapJob(job) : null
}

/**
 * Remove queued and historical generation jobs for one standard automation so
 * deletion does not leave stale failed work visible in the queue.
 */
export async function deleteAutomationJobs(
  automationId: string
): Promise<Job[]> {
  if (!automationId.trim()) return []
  const orm = getRailwayOrm()
  const ownerId = await queueOwnerId()
  const candidates = await orm
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.ownerId, ownerId),
        inArray(jobs.jobType, [...GENERATION_JOB_TYPES])
      )
    )
  const matching = candidates.filter(
    (job) =>
      job.payload &&
      typeof job.payload === "object" &&
      !Array.isArray(job.payload) &&
      (job.payload as Record<string, unknown>).automationId === automationId
  )
  if (!matching.length) return []
  await orm.delete(jobs).where(
    inArray(
      jobs.id,
      matching.map((job) => job.id)
    )
  )
  return matching.map(mapJob)
}

/** Reset a failed generation job for another worker claim. */
export async function retryGenerationJob(
  id: string
): Promise<RetryGenerationJobResult | null> {
  const current = await getJob(id)
  if (!current) return null
  if (!GENERATION_JOB_TYPES.includes(current.type as (typeof GENERATION_JOB_TYPES)[number])) {
    return { job: current, retried: false, reason: "not_generation" }
  }
  if (current.status !== "failed" && current.status !== "dead") {
    return { job: current, retried: false, reason: "not_failed" }
  }

  const orm = getRailwayOrm()
  const now = new Date()
  await orm
    .update(jobs)
    .set({
      status: "queued",
      attempts: 0,
      runAt: now,
      lockedAt: null,
      lockedBy: null,
      leaseExpiresAt: null,
      result: null,
      error: null,
      updatedAt: now,
    })
    .where(eq(jobs.id, id))
  return {
    retried: true,
    job: {
      ...current,
      status: "queued",
      attempts: 0,
      availableAt: now.toISOString(),
      result: null,
      error: null,
      updatedAt: now.toISOString(),
    },
  }
}

/** Count of jobs per status for a queue dashboard. */
export async function queueStats(): Promise<Record<JobStatus, number>> {
  const orm = getRailwayOrm()
  const ownerId = await queueOwnerId()
  const statuses: JobStatus[] = [
    "queued",
    "processing",
    "completed",
    "failed",
    "dead",
  ]
  const rows = await orm.select().from(jobs).where(eq(jobs.ownerId, ownerId))
  const stats = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<
    JobStatus,
    number
  >
  for (const row of rows) stats[normalizeStatus(row.status)] += 1
  return stats
}
