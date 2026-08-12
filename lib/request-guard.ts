import "server-only"

import crypto from "node:crypto"

import { getRailwayDatabase } from "@/lib/railway/database"

export async function consumeRateLimit(input: {
  scope: string
  subject: string
  limit: number
  windowSeconds: number
}) {
  const sql = getRailwayDatabase()
  const limit = Math.max(1, Math.floor(input.limit))
  const windowSeconds = Math.max(1, Math.floor(input.windowSeconds))
  const subject = subjectHash(input.subject)
  const [row] = await sql<
    Array<{ request_count: number; retry_after_seconds: number }>
  >`
    INSERT INTO request_rate_limits (
      scope, subject, window_started_at, request_count, updated_at
    ) VALUES (${input.scope}, ${subject}, now(), 1, now())
    ON CONFLICT (scope, subject) DO UPDATE SET
      request_count = CASE
        WHEN request_rate_limits.window_started_at <= now() - (${windowSeconds} * interval '1 second')
          THEN 1
        ELSE request_rate_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN request_rate_limits.window_started_at <= now() - (${windowSeconds} * interval '1 second')
          THEN now()
        ELSE request_rate_limits.window_started_at
      END,
      updated_at = now()
    RETURNING request_count,
      GREATEST(
        1,
        CEIL(EXTRACT(EPOCH FROM (
          window_started_at + (${windowSeconds} * interval '1 second') - now()
        )))::int
      ) AS retry_after_seconds
  `
  return {
    allowed: row.request_count <= limit,
    remaining: Math.max(0, limit - row.request_count),
    retryAfterSeconds: row.retry_after_seconds,
  }
}

export async function acquireConcurrencyLease(input: {
  scope: string
  subject: string
  limit: number
  leaseSeconds: number
}) {
  const sql = getRailwayDatabase()
  const leaseId = crypto.randomUUID()
  const subject = subjectHash(input.subject)
  const limit = Math.max(1, Math.floor(input.limit))
  const leaseSeconds = Math.max(1, Math.floor(input.leaseSeconds))
  const acquired = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${input.scope}))`
    await tx`
      DELETE FROM request_concurrency_leases
      WHERE scope = ${input.scope} AND expires_at <= now()
    `
    const [count] = await tx<Array<{ value: number }>>`
      SELECT count(*)::int AS value
      FROM request_concurrency_leases
      WHERE scope = ${input.scope} AND expires_at > now()
    `
    if (count.value >= limit) return false
    await tx`
      INSERT INTO request_concurrency_leases (
        scope, lease_id, subject, expires_at
      ) VALUES (
        ${input.scope}, ${leaseId}, ${subject},
        now() + (${leaseSeconds} * interval '1 second')
      )
    `
    return true
  })
  return acquired ? leaseId : null
}

export async function releaseConcurrencyLease(leaseId: string) {
  const sql = getRailwayDatabase()
  await sql`DELETE FROM request_concurrency_leases WHERE lease_id = ${leaseId}`
}

function subjectHash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex")
}
