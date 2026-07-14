// Appwrite Function: automation-scheduler (cron */5)
// Runs IN Appwrite. Reads the `automations` table, computes which automations
// are due (ported from lib/automation-runner.ts due-slot logic), and enqueues
// `run-automation` jobs into the `jobs` queue table. Deduped per (automation, slot).
//
// Variables: APPWRITE_API_KEY (full-access key), APPWRITE_DATABASE_ID (default "cfarm"),
//            LOOKBACK_MINUTES (default 10).
import crypto from "node:crypto"
import { Client, TablesDB, Query } from "node-appwrite"
import { DateTime } from "luxon"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const LOOKBACK = Number(process.env.LOOKBACK_MINUTES || 10)

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

// ---- ported due-slot logic (luxon) ----
function parseLocalSlot(nowLocal, time) {
  const formats = ["h:mm a", "h a", "H:mm", "HH:mm"]
  const zone = nowLocal.zoneName || "UTC"
  for (const format of formats) {
    const parsed = DateTime.fromFormat(
      String(time).trim().toUpperCase(),
      format,
      { zone }
    )
    if (parsed.isValid) {
      return nowLocal.set({
        hour: parsed.hour,
        minute: parsed.minute,
        second: 0,
        millisecond: 0,
      })
    }
  }
  return null
}
function slotForDays({ nowLocal, earliest, time, days }) {
  const day = nowLocal.toFormat("ccc")
  if (!Array.isArray(days) || !days.includes(day)) return []
  const base = parseLocalSlot(nowLocal, time)
  if (!base || base > nowLocal || base < earliest) return []
  const iso =
    base.toUTC().toISO({ suppressMilliseconds: false }) ?? base.toUTC().toISO()
  return iso ? [iso] : []
}
function dueSlots(schema, now, lookbackMinutes) {
  const sch = schema?.schedule
  if (!sch || sch.paused) return []
  const zone = sch.timezone || DateTime.local().zoneName
  const nowLocal = DateTime.fromJSDate(now, { zone })
  const earliest = nowLocal.minus({ minutes: lookbackMinutes })
  const slots = []
  for (const pt of sch.posting_times || []) {
    if (pt.enabled === false) continue
    slots.push(
      ...slotForDays({ nowLocal, earliest, time: pt.time, days: pt.days })
    )
  }
  const iv = sch.interval
  if (
    iv &&
    iv.enabled !== false &&
    Array.isArray(iv.days) &&
    iv.days.includes(nowLocal.toFormat("ccc"))
  ) {
    const start = parseLocalSlot(nowLocal, iv.start_time)
    const end = parseLocalSlot(nowLocal, iv.end_time)
    if (start && end && end >= start) {
      let slot = start
      while (slot <= end) {
        if (slot <= nowLocal && slot >= earliest) {
          const iso =
            slot.toUTC().toISO({ suppressMilliseconds: false }) ??
            slot.toUTC().toISO()
          if (iso) slots.push(iso)
        }
        slot = slot.plus({ hours: Number(iv.every_n_hours) || 24 })
      }
    }
  }
  return [...new Set(slots)]
}

async function listAutomations(db, table = "automations") {
  const out = []
  let cursor = null
  for (;;) {
    const q = [Query.limit(100), Query.orderAsc("ord")]
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

export default async ({ log, error }) => {
  try {
    const db = client()
    const now = new Date()
    const automations = await listAutomations(db)
    const xAutomations = await listAutomations(db, "x_automations").catch(
      (cause) => {
        if (cause?.code === 404) return []
        throw cause
      }
    )
    let enqueued = 0,
      dup = 0,
      considered = 0
    for (const a of automations) {
      if (a?.schema?.status !== "live") continue
      considered++
      for (const slot of dueSlots(a.schema, now, LOOKBACK)) {
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
      if (a?.status !== "live") continue
      considered++
      for (const slot of dueSlots(a, now, LOOKBACK)) {
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
