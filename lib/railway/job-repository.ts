import "server-only"

import { getRailwayDatabase } from "@/lib/railway/database"

export type StoredJobStatus =
  "queued" | "processing" | "completed" | "failed" | "dead"

export type StoredJob = {
  id: string
  ownerId: string
  type: string
  status: StoredJobStatus
  payload: unknown
  result: unknown
  error: string | null
  attempts: number
  maxAttempts: number
  priority: number
  runAt: string
  lockedBy: string | null
  leaseExpiresAt: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

type JobRow = {
  id: string
  owner_id: string | null
  job_type: string
  status: StoredJobStatus
  payload: unknown
  result: unknown
  error: string | null
  attempts: number
  max_attempts: number
  priority: number
  run_at: Date | string
  locked_by: string | null
  lease_expires_at: Date | string | null
  created_at: Date | string
  updated_at: Date | string
  completed_at: Date | string | null
}

export type EnqueueStoredJobInput = {
  id: string
  ownerId: string
  type: string
  payload: unknown
  priority: number
  maxAttempts: number
  runAt: Date
  dedupeKey: string
}

export type JobRepository = {
  enqueue(input: EnqueueStoredJobInput): Promise<"enqueued" | "duplicate">
  list(input: {
    ownerId: string
    status?: StoredJobStatus
    type?: string
    limit: number
  }): Promise<StoredJob[]>
  get(id: string): Promise<StoredJob | null>
  stats(ownerId: string): Promise<Partial<Record<StoredJobStatus, number>>>
  claim(input: {
    workerId: string
    batch: number
    leaseMs: number
    excludedTypes?: string[]
  }): Promise<StoredJob[]>
  complete(id: string, result: unknown): Promise<void>
  retry(input: { id: string; error: string; runAt: Date }): Promise<void>
  dead(input: { id: string; error: string }): Promise<void>
}

export const railwayJobRepository: JobRepository = {
  async enqueue(input) {
    const sql = getRailwayDatabase()
    const rows = await sql`
      INSERT INTO jobs (
        id, owner_id, job_type, status, payload, attempts, max_attempts,
        priority, run_at, dedupe_key
      ) VALUES (
        ${input.id}, ${input.ownerId}, ${input.type}, 'queued',
        ${sql.json(serializable(input.payload))}, 0, ${input.maxAttempts},
        ${input.priority}, ${input.runAt}, ${input.dedupeKey}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `
    return rows.length > 0 ? "enqueued" : "duplicate"
  },

  async list(input) {
    const sql = getRailwayDatabase()
    const rows = await sql<JobRow[]>`
      SELECT *
      FROM jobs
      WHERE owner_id = ${input.ownerId}
        AND (${input.status ?? null}::text IS NULL OR status = ${input.status ?? null})
        AND (${input.type ?? null}::text IS NULL OR job_type = ${input.type ?? null})
      ORDER BY created_at DESC
      LIMIT ${input.limit}
    `
    return rows.map(mapRow)
  },

  async get(id) {
    const sql = getRailwayDatabase()
    const [row] = await sql<JobRow[]>`
      SELECT * FROM jobs WHERE id = ${id}
    `
    return row ? mapRow(row) : null
  },

  async stats(ownerId) {
    const sql = getRailwayDatabase()
    const rows = await sql<Array<{ status: StoredJobStatus; count: number }>>`
      SELECT status, count(*)::int AS count
      FROM jobs
      WHERE owner_id = ${ownerId}
      GROUP BY status
    `
    return Object.fromEntries(rows.map((row) => [row.status, row.count]))
  },

  async claim(input) {
    const sql = getRailwayDatabase()
    const excludedTypes = input.excludedTypes ?? []
    const exclusion = excludedTypes.length
      ? sql`AND job_type NOT IN ${sql(excludedTypes)}`
      : sql``
    const leaseExpiresAt = new Date(Date.now() + input.leaseMs)
    const rows = await sql<JobRow[]>`
      WITH candidates AS (
        SELECT id
        FROM jobs
        WHERE (
          (status = 'queued' AND run_at <= now())
          OR
          (status = 'processing' AND lease_expires_at < now())
        )
        ${exclusion}
        ORDER BY priority DESC, run_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${Math.max(1, input.batch)}
      )
      UPDATE jobs AS job
      SET status = 'processing',
          attempts = job.attempts + 1,
          locked_at = now(),
          locked_by = ${input.workerId},
          lease_expires_at = ${leaseExpiresAt},
          updated_at = now()
      FROM candidates
      WHERE job.id = candidates.id
      RETURNING job.*
    `
    return rows.map(mapRow)
  },

  async complete(id, result) {
    const sql = getRailwayDatabase()
    await sql`
      UPDATE jobs
      SET status = 'completed', result = ${sql.json(serializable(result))},
          error = null, locked_at = null, locked_by = null,
          lease_expires_at = null, completed_at = now(), updated_at = now()
      WHERE id = ${id}
    `
  },

  async retry(input) {
    const sql = getRailwayDatabase()
    await sql`
      UPDATE jobs
      SET status = 'queued', error = ${input.error}, run_at = ${input.runAt},
          locked_at = null, locked_by = null, lease_expires_at = null,
          updated_at = now()
      WHERE id = ${input.id}
    `
  },

  async dead(input) {
    const sql = getRailwayDatabase()
    await sql`
      UPDATE jobs
      SET status = 'dead', error = ${input.error}, locked_at = null,
          locked_by = null, lease_expires_at = null, updated_at = now()
      WHERE id = ${input.id}
    `
  },
}

function mapRow(row: JobRow): StoredJob {
  return {
    id: row.id,
    ownerId: row.owner_id ?? "",
    type: row.job_type,
    status: row.status,
    payload: row.payload,
    result: row.result,
    error: row.error,
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    priority: Number(row.priority),
    runAt: iso(row.run_at),
    lockedBy: row.locked_by,
    leaseExpiresAt: row.lease_expires_at ? iso(row.lease_expires_at) : null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    completedAt: row.completed_at ? iso(row.completed_at) : null,
  }
}

function iso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function serializable(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null)) as never
}
