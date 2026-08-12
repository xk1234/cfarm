import { randomUUID } from "node:crypto"

import { afterAll, describe, expect, it } from "vitest"

import {
  closeRailwayDatabase,
  getRailwayDatabase,
} from "@/lib/railway/database"
import {
  acquireConcurrencyLease,
  consumeRateLimit,
  releaseConcurrencyLease,
} from "@/lib/request-guard"

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip

describeWithDatabase("request guard PostgreSQL integration", () => {
  const rateScope = `compat-rate-${randomUUID()}`
  const concurrencyScope = `compat-concurrency-${randomUUID()}`

  afterAll(async () => {
    const sql = getRailwayDatabase()
    await sql`DELETE FROM request_rate_limits WHERE scope = ${rateScope}`
    await sql`DELETE FROM request_concurrency_leases WHERE scope = ${concurrencyScope}`
    await closeRailwayDatabase()
  })

  it("enforces a shared request limit", async () => {
    const input = {
      scope: rateScope,
      subject: "203.0.113.1",
      limit: 2,
      windowSeconds: 60,
    }
    expect(await consumeRateLimit(input)).toMatchObject({
      allowed: true,
      remaining: 1,
    })
    expect(await consumeRateLimit(input)).toMatchObject({
      allowed: true,
      remaining: 0,
    })
    expect(await consumeRateLimit(input)).toMatchObject({
      allowed: false,
      remaining: 0,
    })
  })

  it("acquires and releases a shared concurrency lease", async () => {
    const first = await acquireConcurrencyLease({
      scope: concurrencyScope,
      subject: "203.0.113.1",
      limit: 1,
      leaseSeconds: 60,
    })
    expect(first).toBeTruthy()
    expect(
      await acquireConcurrencyLease({
        scope: concurrencyScope,
        subject: "203.0.113.2",
        limit: 1,
        leaseSeconds: 60,
      })
    ).toBeNull()
    await releaseConcurrencyLease(first!)
    const afterRelease = await acquireConcurrencyLease({
      scope: concurrencyScope,
      subject: "203.0.113.2",
      limit: 1,
      leaseSeconds: 60,
    })
    expect(afterRelease).toBeTruthy()
    await releaseConcurrencyLease(afterRelease!)
  })
})
