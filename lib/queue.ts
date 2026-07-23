// App-side helpers for the Appwrite-backed job queue (the `jobs` table).
// The scheduler + job-worker Appwrite Functions produce/consume these rows;
// the app can also enqueue jobs (e.g. asset generation) and read queue state
// for the UI. All operations no-op to null/[] when Appwrite is unconfigured.
import crypto from "node:crypto"

import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { getCurrentUser } from "@/lib/auth"
import { systemOwnerId } from "@/lib/system-owner-context"

const JOBS_TABLE = "jobs"

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

export type RetryGenerationJobResult = {
  job: Job
  retried: boolean
  reason?: "not_generation" | "not_failed"
}

export function deterministicJobId(ownerId: string, dedupeKey: string): string {
  return jobId(`${ownerId}:${dedupeKey}`)
}

function jobId(basis: string): string {
  return (
    "j" + crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)
  )
}

function safeParse(value: unknown): unknown {
  if (typeof value !== "string" || value === "") return null
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function mapJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.$id),
    type: String(row.type ?? ""),
    status: (row.status as JobStatus) ?? "queued",
    payload: safeParse(row.payload),
    result: safeParse(row.result),
    error: (row.error as string) ?? null,
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 0),
    availableAt: (row.available_at as string) ?? null,
    createdAt: (row.created_at as string) ?? null,
    updatedAt: (row.updated_at as string) ?? null,
    ownerId: String(row.owner_id ?? ""),
  }
}

async function queueOwnerId() {
  return systemOwnerId() ?? (await getCurrentUser())?.$id
}

/** Push a job onto the queue. Returns null when Appwrite isn't configured. */
export async function enqueueJob(
  input: EnqueueInput
): Promise<{ id: string; status: "enqueued" | "duplicate" } | null> {
  const aw = getAppwrite()
  if (!aw) return null
  const ownerId = await queueOwnerId()
  if (!ownerId) throw new Error("Authentication is required to enqueue jobs.")
  const nowIso = new Date().toISOString()
  const dedupe = input.dedupeKey ?? `${input.type}:${crypto.randomUUID()}`
  const id = deterministicJobId(ownerId, dedupe)
  try {
    await aw.tables.createRow(APPWRITE_DATABASE_ID, JOBS_TABLE, id, {
      type: input.type,
      status: "queued",
      payload: JSON.stringify(input.payload ?? null),
      priority: input.priority ?? 0,
      attempts: 0,
      max_attempts: input.maxAttempts ?? 3,
      available_at: (input.availableAt ?? new Date()).toISOString(),
      dedupe_key: dedupe,
      created_at: nowIso,
      updated_at: nowIso,
      owner_id: ownerId,
    })
    return { id, status: "enqueued" }
  } catch (error) {
    if ((error as { code?: number }).code === 409)
      return { id, status: "duplicate" }
    throw error
  }
}

/** List jobs, most-recent first, optionally filtered by status/type. */
export async function listJobs(
  opts: { status?: JobStatus; type?: string; limit?: number } = {}
): Promise<Job[]> {
  const aw = getAppwrite()
  if (!aw) return []
  const ownerId = await queueOwnerId()
  if (!ownerId) return []
  const queries = [Query.orderDesc("$createdAt"), Query.limit(opts.limit ?? 50)]
  queries.push(Query.equal("owner_id", [ownerId]))
  if (opts.status) queries.push(Query.equal("status", [opts.status]))
  if (opts.type) queries.push(Query.equal("type", [opts.type]))
  const res = await aw.tables.listRows(
    APPWRITE_DATABASE_ID,
    JOBS_TABLE,
    queries
  )
  return (res.rows as Array<Record<string, unknown>>).map(mapJob)
}

export async function getJob(id: string): Promise<Job | null> {
  const aw = getAppwrite()
  if (!aw) return null
  const ownerId = await queueOwnerId()
  if (!ownerId) return null
  try {
    const job = mapJob(
      (await aw.tables.getRow(APPWRITE_DATABASE_ID, JOBS_TABLE, id)) as Record<
        string,
        unknown
      >
    )
    return job.ownerId === ownerId ? job : null
  } catch {
    return null
  }
}

/**
 * Permanently remove queued and historical generation jobs for one standard
 * automation. This is used by the automation deletion cascade so stale failed
 * jobs do not keep appearing after their automation is gone.
 */
export async function deleteAutomationJobs(
  automationId: string
): Promise<Job[]> {
  const aw = getAppwrite()
  if (!aw) return []
  const ownerId = await queueOwnerId()
  if (!ownerId || !automationId.trim()) return []

  const candidates = (
    await Promise.all(
      ["run-automation", "run-ugc-automation"].map(async (type) => {
        const jobs: Job[] = []
        let offset = 0
        const pageSize = 100

        while (true) {
          const res = await aw.tables.listRows(
            APPWRITE_DATABASE_ID,
            JOBS_TABLE,
            [
              Query.equal("owner_id", [ownerId]),
              Query.equal("type", [type]),
              Query.orderAsc("$createdAt"),
              Query.limit(pageSize),
              Query.offset(offset),
            ]
          )
          const page = (res.rows as Array<Record<string, unknown>>).map(mapJob)
          jobs.push(...page)
          if (page.length < pageSize) break
          offset += page.length
        }

        return jobs
      })
    )
  )
    .flat()
    .filter((job) => {
      const payload =
        job.payload && typeof job.payload === "object"
          ? (job.payload as Record<string, unknown>)
          : {}
      return String(payload.automationId ?? "") === automationId
    })

  await Promise.all(
    candidates.map((job) =>
      aw.tables.deleteRow(APPWRITE_DATABASE_ID, JOBS_TABLE, job.id)
    )
  )
  return candidates
}

/** Reset a failed generation job so the worker can claim it again immediately. */
export async function retryGenerationJob(
  id: string
): Promise<RetryGenerationJobResult | null> {
  const aw = getAppwrite()
  if (!aw) return null
  const ownerId = await queueOwnerId()
  if (!ownerId) return null

  let row: Record<string, unknown>
  try {
    row = (await aw.tables.getRow(
      APPWRITE_DATABASE_ID,
      JOBS_TABLE,
      id
    )) as Record<string, unknown>
  } catch (error) {
    if ((error as { code?: number }).code === 404) return null
    throw error
  }

  const job = mapJob(row)
  if (job.ownerId !== ownerId) return null
  if (
    job.type !== "run-automation" &&
    job.type !== "run-x-automation" &&
    job.type !== "run-ugc-automation"
  ) {
    return { job, retried: false, reason: "not_generation" }
  }
  if (job.status !== "failed" && job.status !== "dead") {
    return { job, retried: false, reason: "not_failed" }
  }

  const now = new Date().toISOString()
  await aw.tables.updateRow(APPWRITE_DATABASE_ID, JOBS_TABLE, id, {
    status: "queued",
    attempts: 0,
    available_at: now,
    leased_by: null,
    leased_until: null,
    result: null,
    error: null,
    updated_at: now,
  })
  return {
    retried: true,
    job: {
      ...job,
      status: "queued",
      attempts: 0,
      availableAt: now,
      result: null,
      error: null,
      updatedAt: now,
    },
  }
}

/** Count of jobs per status (for a queue dashboard). */
export async function queueStats(): Promise<Record<JobStatus, number>> {
  const aw = getAppwrite()
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
  if (!aw) return empty
  const ownerId = await queueOwnerId()
  if (!ownerId) return empty
  await Promise.all(
    statuses.map(async (status) => {
      const res = await aw.tables.listRows(APPWRITE_DATABASE_ID, JOBS_TABLE, [
        Query.equal("status", [status]),
        Query.equal("owner_id", [ownerId]),
        Query.limit(1),
      ])
      empty[status] = res.total
    })
  )
  return empty
}
