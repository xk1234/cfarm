// Appwrite Function: automation-scheduler (cron */5)
// Runs IN Appwrite. Reads the `automations` table, computes which automations
// are due (from the generated canonical lib/automation-slots.ts runtime), and enqueues
// `run-automation` jobs into the `jobs` queue table.
//
// Variables: APPWRITE_API_KEY (full-access key), APPWRITE_DATABASE_ID (default "cfarm"),
//            LOOKBACK_MINUTES (default 10), LUMENCLIP_SYSTEM_OWNER_ID (optional).
import crypto from "node:crypto"
import { Client, TablesDB, Query } from "node-appwrite"
import { dueAutomationSlots } from "./automation-slots.js"

export { dueAutomationSlots as dueSlots } from "./automation-slots.js"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const LOOKBACK = Number(process.env.LOOKBACK_MINUTES || 10)
// Slideshow rendering can take several minutes. Queue it ahead of the target
// slot so PostFast can hold the finished post until the exact scheduled time.
// This is product behavior, not deployment configuration.
export const SLIDESHOW_GENERATION_LEAD_MINUTES = 30

function client() {
  return new TablesDB(
    new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY)
  )
}

function rowId(basis) {
  return (
    "j" + crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)
  )
}

export async function listLiveAutomations(db, table = "automations") {
  const out = []
  let cursor = null
  for (;;) {
    const q = [
      Query.equal("status", ["live"]),
      Query.limit(100),
      Query.orderAsc("ord"),
    ]
    if (cursor) q.push(Query.cursorAfter(cursor))
    const res = await db.listRows(DB, table, q)
    for (const row of res.rows) {
      try {
        out.push({
          ...JSON.parse(row.data),
          ownerId: row.owner_id || JSON.parse(row.data).ownerId,
        })
      } catch {
        /* skip */
      }
    }
    if (res.rows.length < 100) break
    cursor = res.rows[res.rows.length - 1].$id
  }
  return out
}

async function enqueue(
  db,
  { type, payload, dedupeKey, ownerId, maxAttempts = 3 }
) {
  const nowIso = new Date().toISOString()
  const id = rowId(dedupeKey)
  try {
    await db.createRow(DB, "jobs", id, {
      type,
      status: "queued",
      payload: JSON.stringify(payload),
      priority: 0,
      attempts: 0,
      max_attempts: maxAttempts,
      available_at: nowIso,
      dedupe_key: dedupeKey,
      created_at: nowIso,
      updated_at: nowIso,
      owner_id: ownerId,
    })
    return "enqueued"
  } catch (e) {
    if (e.code === 409) return "duplicate"
    throw e
  }
}

async function automationScheduler({ log, error }) {
  try {
    const db = client()
    const now = new Date()
    const automations = await listLiveAutomations(db)
    const xAutomations = await listLiveAutomations(db, "x_automations").catch(
      (cause) => {
        if (cause?.code === 404) return []
        throw cause
      }
    )
    let enqueued = 0,
      dup = 0,
      considered = 0
    for (const a of automations) {
      considered++
      for (const slot of dueAutomationSlots(
        a.schema,
        now,
        LOOKBACK,
        a.schema.posting_mode === "review"
          ? Number(a.schema.generation_lead_minutes) ||
              SLIDESHOW_GENERATION_LEAD_MINUTES
          : SLIDESHOW_GENERATION_LEAD_MINUTES
      )) {
        const res = await enqueue(db, {
          type: "run-automation",
          payload: { automationId: a.id, scheduledFor: slot },
          dedupeKey: `auto:${a.id}:${slot}`,
          ownerId: a.ownerId,
        })
        if (res === "enqueued") enqueued++
        else dup++
      }
    }
    for (const a of xAutomations) {
      considered++
      for (const slot of dueAutomationSlots(a, now, LOOKBACK)) {
        const res = await enqueue(db, {
          type: "run-x-automation",
          payload: { automationId: a.id, scheduledFor: slot },
          dedupeKey: `x-auto:${a.id}:${slot}`,
          ownerId: a.ownerId,
        })
        if (res === "enqueued") enqueued++
        else dup++
      }
    }

    log(
      `scheduler: ${automations.length} slideshow + ${xAutomations.length} X automations, ${considered} live, enqueued ${enqueued}, dedup ${dup}`
    )
    return {
      ok: true,
      automations: automations.length,
      xAutomations: xAutomations.length,
      live: considered,
      enqueued,
      duplicates: dup,
    }
  } catch (e) {
    error(`scheduler failed: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, error: String(e) }
  }
}

export default automationScheduler
