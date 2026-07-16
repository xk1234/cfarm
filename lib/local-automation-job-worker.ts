import "server-only"

import crypto from "node:crypto"
import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { syncPostFastAnalytics } from "@/lib/postfast-analytics"
import { withSystemOwner } from "@/lib/system-owner-context"

const workerKey = Symbol.for("cfarm.localAutomationJobWorker")
const pollIntervalMs = 5 * 60_000
const leaseMs = 30 * 60_000
// Slideshow execution belongs exclusively to the Appwrite job-worker.
const localJobTypes = ["sync-post-analytics"]

type WorkerState = {
  running: boolean
  timer: NodeJS.Timeout
}

export function startLocalAutomationJobWorker() {
  const scope = globalThis as typeof globalThis & {
    [workerKey]?: WorkerState
  }
  if (scope[workerKey] || !getAppwrite()) return

  const state: WorkerState = {
    running: false,
    timer: setInterval(() => void tick(state), pollIntervalMs),
  }
  state.timer.unref()
  scope[workerKey] = state
  void tick(state)
}

async function tick(state: WorkerState) {
  if (state.running) return
  state.running = true
  try {
    const job = await nextLocalJob()
    if (job) await processLocalJob(job)
  } catch (error) {
    console.error("[local-automation-worker] poll failed", error)
  } finally {
    state.running = false
  }
}

async function nextLocalJob() {
  const aw = getAppwrite()
  if (!aw) return null
  const now = new Date().toISOString()
  const queued = await aw.tables.listRows(APPWRITE_DATABASE_ID, "jobs", [
    Query.equal("type", localJobTypes),
    Query.equal("status", ["queued"]),
    Query.lessThanEqual("available_at", now),
    Query.orderDesc("priority"),
    Query.orderAsc("available_at"),
    Query.limit(1),
  ])
  const stale =
    queued.rows.length > 0
      ? null
      : await aw.tables.listRows(APPWRITE_DATABASE_ID, "jobs", [
          Query.equal("type", localJobTypes),
          Query.equal("status", ["processing"]),
          Query.lessThan("leased_until", now),
          Query.limit(1),
        ])
  return (queued.rows[0] ?? stale?.rows[0] ?? null) as JobRow | null
}

async function processLocalJob(job: JobRow) {
  const aw = getAppwrite()
  if (!aw) return
  const workerId = `local-${process.pid}-${crypto.randomBytes(3).toString("hex")}`
  const attempts = Number(job.attempts ?? 0) + 1
  await aw.tables.updateRow(APPWRITE_DATABASE_ID, "jobs", job.$id, {
    status: "processing",
    leased_by: workerId,
    leased_until: new Date(Date.now() + leaseMs).toISOString(),
    attempts,
    updated_at: new Date().toISOString(),
  })
  const claimed = (await aw.tables.getRow(
    APPWRITE_DATABASE_ID,
    "jobs",
    job.$id
  )) as unknown as JobRow
  if (claimed.leased_by !== workerId) return

  try {
    const payload = jsonRecord(claimed.payload)
    const ownerId =
      stringValue(claimed.owner_id) || stringValue(payload.ownerId)
    if (!ownerId) {
      throw new Error(`${claimed.type || "local"} job requires an ownerId`)
    }
    const result = await withSystemOwner(ownerId, () =>
      syncPostFastAnalytics({ days: analyticsDays(payload.days) })
    )
    await aw.tables.updateRow(APPWRITE_DATABASE_ID, "jobs", job.$id, {
      status: "completed",
      result: JSON.stringify(result).slice(0, 100_000),
      error: null,
      leased_by: null,
      leased_until: null,
      updated_at: new Date().toISOString(),
    })
  } catch (error) {
    const maxAttempts = Number(claimed.max_attempts ?? 3)
    const message = error instanceof Error ? error.message : String(error)
    const dead = attempts >= maxAttempts
    await aw.tables.updateRow(APPWRITE_DATABASE_ID, "jobs", job.$id, {
      status: dead ? "dead" : "queued",
      available_at: dead
        ? claimed.available_at
        : new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
      leased_by: null,
      leased_until: null,
      error: message.slice(0, 4000),
      updated_at: new Date().toISOString(),
    })
  }
}

function analyticsDays(value: unknown) {
  const days = Number(value)
  return Number.isFinite(days) ? Math.max(1, Math.min(365, days)) : 30
}

function retryDelayMs(attempts: number) {
  return Math.min(60 * 60_000, 1000 * 2 ** attempts)
}

function jsonRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

type JobRow = {
  $id: string
  type?: string
  status?: string
  payload?: string
  attempts?: number
  max_attempts?: number
  available_at?: string
  leased_by?: string
  leased_until?: string
  owner_id?: string
}
