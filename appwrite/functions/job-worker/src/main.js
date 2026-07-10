// Appwrite Function: job-worker (cron every minute)
// Runs IN Appwrite. Drains the `jobs` queue: claims queued (and lease-expired)
// jobs, dispatches them to handlers, and marks completed / retried / dead-lettered.
//
// Variables: APPWRITE_API_KEY (full-access key), APPWRITE_DATABASE_ID (default "cfarm"),
//            BATCH (default 10), LEASE_MS (default 120000).
import crypto from "node:crypto"
import { Client, TablesDB, Query } from "node-appwrite"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const BATCH = Number(process.env.BATCH || 10)
const LEASE_MS = Number(process.env.LEASE_MS || 120000)
const WID = `worker-${crypto.randomBytes(4).toString("hex")}`

function db() {
  return new TablesDB(
    new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY)
  )
}
const nowIso = () => new Date().toISOString()
const backoffMs = (attempts) => Math.min(60 * 60 * 1000, 1000 * Math.pow(2, attempts)) // capped 1h

async function findCandidates(t) {
  const now = nowIso()
  const queued = await t.listRows(DB, "jobs", [
    Query.equal("status", ["queued"]),
    Query.lessThanEqual("available_at", now),
    Query.orderDesc("priority"),
    Query.orderAsc("available_at"),
    Query.limit(BATCH),
  ])
  const stale = await t.listRows(DB, "jobs", [
    Query.equal("status", ["processing"]),
    Query.lessThan("leased_until", now),
    Query.limit(BATCH),
  ])
  return [...queued.rows, ...stale.rows].slice(0, BATCH)
}

async function claim(t, job) {
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString()
  await t.updateRow(DB, "jobs", job.$id, {
    status: "processing",
    leased_by: WID,
    leased_until: leaseUntil,
    attempts: (job.attempts || 0) + 1,
    updated_at: nowIso(),
  })
  const fresh = await t.getRow(DB, "jobs", job.$id)
  return fresh.leased_by === WID ? fresh : null // lost the race
}

async function complete(t, job, result) {
  await t.updateRow(DB, "jobs", job.$id, {
    status: "completed",
    result: JSON.stringify(result ?? null).slice(0, 100000),
    error: null,
    updated_at: nowIso(),
  })
}
async function failOrRetry(t, job, err) {
  const attempts = job.attempts || 0
  const max = job.max_attempts || 3
  const message = (err instanceof Error ? err.message : String(err)).slice(0, 4000)
  if (attempts >= max) {
    await t.updateRow(DB, "jobs", job.$id, { status: "dead", error: message, updated_at: nowIso() })
  } else {
    await t.updateRow(DB, "jobs", job.$id, {
      status: "queued",
      available_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
      leased_by: null,
      leased_until: null,
      error: message,
      updated_at: nowIso(),
    })
  }
}

// ---------- handlers ----------
const handlers = {
  // verification handler
  async echo(payload) {
    return { echoed: payload }
  },

  // Integration point for the automation pipeline. Runs in Appwrite: records a
  // durable run row (deduped) in `automation_runs`. The heavy media generation
  // (LLM copy -> image/video via OpenRouter/KIE, assembly via Rendi -> Storage,
  // then social posting) plugs in here as cloud HTTP calls using function vars
  // for the provider keys. Kept as an explicit, honest boundary rather than faked.
  async ["run-automation"](payload, t) {
    const { automationId, scheduledFor } = payload || {}
    if (!automationId) throw new Error("run-automation: missing automationId")
    const runId = "run" + crypto.createHash("sha256")
      .update(`${automationId}:${scheduledFor}`).digest("hex").slice(0, 33)
    const record = {
      id: runId, automationId, scheduledFor,
      status: "accepted", // -> "generating" -> "posted" once the pipeline is wired
      claimedAt: nowIso(), claimedBy: "job-worker",
    }
    try {
      await t.createRow(DB, "automation_runs", runId, {
        rid: runId, name: automationId, status: record.status,
        created_raw: record.claimedAt, source_key: "runs",
        ord: Math.floor(Date.now() / 1000),
        data: JSON.stringify(record),
      })
      return { runId, created: true, note: "run recorded; media-generation pipeline is the next handler step" }
    } catch (e) {
      if (e.code === 409) return { runId, created: false, note: "run already recorded (dedup)" }
      throw e
    }
  },
}

export default async ({ log, error }) => {
  const t = db()
  let processed = 0, failed = 0, skipped = 0
  try {
    const candidates = await findCandidates(t)
    for (const job of candidates) {
      const leased = await claim(t, job).catch(() => null)
      if (!leased) { skipped++; continue }
      const handler = handlers[leased.type]
      try {
        if (!handler) throw new Error(`no handler for job type "${leased.type}"`)
        const payload = leased.payload ? JSON.parse(leased.payload) : {}
        const result = await handler(payload, t)
        await complete(t, leased, result)
        processed++
      } catch (e) {
        await failOrRetry(t, leased, e)
        failed++
        error(`job ${leased.$id} (${leased.type}) failed: ${e instanceof Error ? e.message : e}`)
      }
    }
    log(`worker ${WID}: processed ${processed}, failed ${failed}, skipped ${skipped}`)
    return { ok: true, worker: WID, processed, failed, skipped }
  } catch (e) {
    error(`worker fatal: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, error: String(e) }
  }
}
