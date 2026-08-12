// Appwrite Function: job-worker (cron every minute)
// Runs IN Appwrite. Drains the `jobs` queue: claims queued (and lease-expired)
// jobs, dispatches them to handlers, and marks completed / retried / dead-lettered.
//
// Variables: APPWRITE_API_KEY, APPWRITE_DATABASE_ID, BATCH, LEASE_MS,
//            OPENROUTER_API_KEY, POSTFAST_API_KEY, optional DEEPL_KEY,
//            TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, BASE_URL, and optional
//            SLIDESHOW_SHARE_SECRET.
import crypto from "node:crypto"
import { Client, TablesDB, Query } from "node-appwrite"

const railwayDataBackend = process.env.LUMENCLIP_DATA_BACKEND === "railway"
let RailwayTablesCompat
if (railwayDataBackend) {
  ;({ RailwayTablesCompat } =
    await import("../../../../lib/railway/appwrite-compat.ts"))
}

// Self-hosted Appwrite injects APPWRITE_FUNCTION_API_ENDPOINT from _APP_DOMAIN,
// which is not guaranteed to be routable from inside the function container.
// An explicitly configured endpoint always wins.
const API_ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.APPWRITE_FUNCTION_API_ENDPOINT

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
// This worker handles short notification jobs only. Generation is owned by
// Windmill and never enters this queue.
const BATCH = Math.max(1, Math.min(50, Number(process.env.BATCH || 10)))
// Must outlive the function timeout so another cron execution cannot reclaim a
// notification delivery while it is still running.
const LEASE_MS = Number(process.env.LEASE_MS || 960000)
const TELEGRAM_TIMEOUT_MS = Math.max(
  1_000,
  Number(process.env.TELEGRAM_TIMEOUT_MS || 15_000)
)
const JOB_RETENTION_DAYS = Math.max(
  1,
  Number(process.env.JOB_RETENTION_DAYS || 30)
)
const WID = `worker-${crypto.randomBytes(4).toString("hex")}`

function db() {
  if (railwayDataBackend) return new RailwayTablesCompat()
  return new TablesDB(
    new Client()
      .setEndpoint(API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY)
  )
}
const nowIso = () => new Date().toISOString()
const safeJson = (value) => {
  try {
    return JSON.parse(value || "null")
  } catch {
    return null
  }
}
const backoffMs = (attempts) =>
  Math.min(60 * 60 * 1000, 1000 * Math.pow(2, attempts)) // capped 1h

function reminderChannel(settings, event) {
  const eventSettings = settings?.events?.[event]
  const channel =
    typeof eventSettings === "boolean"
      ? eventSettings && settings?.channel === "telegram"
        ? "telegram"
        : "none"
      : eventSettings?.channel === "telegram"
        ? "telegram"
        : "none"
  if (channel === "telegram") return channel
  const hasDestination = Boolean(
    String(
      settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID || ""
    ).trim()
  )
  const anyEventEnabled = Object.values(settings?.events || {}).some(
    (configured) =>
      configured === true ||
      (configured &&
        typeof configured === "object" &&
        configured.channel === "telegram")
  )
  return event === "generated" &&
    hasDestination &&
    settings?.notificationDefaultsApplied !== true &&
    !anyEventEnabled
    ? "telegram"
    : "none"
}

export async function findCandidates(t) {
  const now = nowIso()
  const queued = await t.listRows(DB, "jobs", [
    Query.equal("status", ["queued"]),
    Query.notEqual("type", ["sync-post-analytics"]),
    Query.lessThanEqual("available_at", now),
    Query.orderDesc("priority"),
    Query.orderAsc("available_at"),
    Query.limit(BATCH),
  ])
  if (!queued || !Array.isArray(queued.rows)) {
    throw new Error(
      `jobs listRows returned no rows array from ${API_ENDPOINT} (db=${DB}); ` +
        `got keys [${queued ? Object.keys(queued).join(",") : "none"}]. ` +
        `Check that this endpoint actually serves the Appwrite API.`
    )
  }
  if (queued.rows.length > 0) return queued.rows
  const stale = await t.listRows(DB, "jobs", [
    Query.equal("status", ["processing"]),
    Query.notEqual("type", ["sync-post-analytics"]),
    Query.lessThan("leased_until", now),
    Query.limit(BATCH),
  ])
  return stale.rows.slice(0, BATCH)
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

async function claimBatch(t) {
  const now = nowIso()
  if (typeof t.claimJobs === "function") {
    return t.claimJobs({
      workerId: WID,
      limit: BATCH,
      leaseUntil: new Date(Date.now() + LEASE_MS).toISOString(),
      now,
      excludeTypes: ["sync-post-analytics"],
    })
  }
  const candidates = await findCandidates(t)
  const claimed = []
  for (const candidate of candidates) {
    const leased = await claim(t, candidate).catch(() => null)
    if (leased) claimed.push(leased)
  }
  return claimed
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
  const message = (err instanceof Error ? err.message : String(err)).slice(
    0,
    4000
  )
  const nonRetryable = err?.nonRetryable === true
  if (nonRetryable || attempts >= max) {
    await t.updateRow(DB, "jobs", job.$id, {
      status: "dead",
      error: message,
      updated_at: nowIso(),
    })
    if (err?.telegramNotified !== true)
      await sendTelegram(`Dead job: ${job.type}\n${job.$id}\n${message}`).catch(
        () => undefined
      )
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

async function sendTelegram(text, chatIdOverride, options = {}) {
  const configuredToken = cleanString(options.botToken)
  const token = telegramBotToken(configuredToken)
    ? configuredToken
    : cleanString(process.env.TELEGRAM_BOT_TOKEN)
  const chatId = cleanString(chatIdOverride) || process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return { sent: false, reason: "not_configured" }
  const buttons = []
  if (options.previewUrl) {
    buttons.push([
      {
        text: "Preview generation",
        url: options.previewUrl,
      },
    ])
  }
  if (options.downloadUrl) {
    buttons.push([
      {
        text: "Download slides (.zip)",
        url: options.downloadUrl,
      },
    ])
  }
  if (options.confirmationJobId) {
    buttons.push([
      {
        text: "Yes, I posted it",
        callback_data: `posted:${options.confirmationJobId}`,
      },
    ])
  }
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).slice(0, 4000),
        ...(buttons.length
          ? {
              reply_markup: {
                inline_keyboard: buttons,
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    }
  )
  if (!response.ok)
    throw new Error(`Telegram notification failed (${response.status})`)
  return { sent: true }
}

function telegramBotToken(value) {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(value)
}

async function reminderSettings(t, ownerId) {
  if (!ownerId) return null
  const response = await t.listRows(DB, "permanent_assets", [
    Query.equal("owner_id", [ownerId]),
    Query.equal("source_key", ["reminder_settings"]),
    Query.limit(1),
  ])
  const value = safeJson(response.rows[0]?.data)
  if (value?.channel === "none") return null
  return value || null
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : ""
}

export async function sendConfiguredReminder(payload, t, job) {
  const event = cleanString(payload?.event)
  if (
    event !== "generated" &&
    event !== "ready_to_post" &&
    event !== "scheduled_to_post" &&
    event !== "respond_to_comments" &&
    event !== "publish_failed" &&
    event !== "generation_failed"
  ) {
    throw new Error("send-notification: invalid reminder event")
  }
  const settings = await reminderSettings(t, job?.owner_id)
  if (!settings) return { sent: false, reason: "disabled" }
  if (reminderChannel(settings, event) !== "telegram") {
    return { sent: false, reason: "event_disabled" }
  }
  const delivery =
    payload.sourceType === "slideshow"
      ? slideshowDeliveryUrls({
          ownerId: job?.owner_id,
          outputId: payload.sourceId,
        })
      : undefined
  return sendTelegram(payload.text, settings.telegramChatId, {
    botToken: settings.telegramBotToken,
    previewUrl: delivery?.previewUrl,
    downloadUrl: delivery?.downloadUrl,
    confirmationJobId:
      payload.requiresPostConfirmation === true ? job?.$id : undefined,
  })
}

function slideshowDeliveryUrls({ ownerId, outputId }) {
  const baseUrl = cleanString(process.env.BASE_URL).replace(/\/$/, "")
  const secret =
    cleanString(process.env.SLIDESHOW_SHARE_SECRET) ||
    cleanString(process.env.APPWRITE_API_KEY)
  if (!/^https:\/\//i.test(baseUrl) || !secret || !ownerId || !outputId) {
    return undefined
  }
  const claims = {
    ownerId: cleanString(ownerId),
    outputId: cleanString(outputId),
    expiresAt: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url")
  const token = `${payload}.${signature}`
  const encodedOutputId = encodeURIComponent(claims.outputId)
  const encodedToken = encodeURIComponent(token)
  return {
    previewUrl: `${baseUrl}/share/slideshows/${encodedOutputId}?token=${encodedToken}`,
    downloadUrl: `${baseUrl}/api/public/slideshows/${encodedOutputId}/download?token=${encodedToken}`,
  }
}

async function enqueueReminderJob(t, ownerId, input) {
  const settings = await reminderSettings(t, ownerId)
  if (!settings || settings.events?.[input.event] !== true) return
  const dedupe = [
    "reminder",
    input.event,
    input.sourceType,
    input.sourceId,
    input.dedupeSuffix,
  ]
    .filter(Boolean)
    .join(":")
  const id =
    "j" +
    crypto
      .createHash("sha256")
      .update(`${ownerId}:${dedupe}`)
      .digest("hex")
      .slice(0, 35)
  const now = nowIso()
  try {
    await t.createRow(DB, "jobs", id, {
      type: "send-notification",
      status: "queued",
      payload: JSON.stringify({
        event: input.event,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        scheduledFor: input.scheduledFor,
        text: input.text,
      }),
      priority: 0,
      attempts: 0,
      max_attempts: 5,
      available_at: now,
      dedupe_key: dedupe,
      created_at: now,
      updated_at: now,
      owner_id: ownerId,
    })
  } catch (error) {
    if (error?.code !== 409) throw error
  }
}

// ---------- handlers ----------
const handlers = {
  // verification handler
  async echo(payload) {
    return { echoed: payload }
  },

  async ["send-notification"](payload, t, job) {
    if (!payload?.text) throw new Error("send-notification: missing text")
    return payload.event
      ? sendConfiguredReminder(payload, t, job)
      : sendTelegram(payload.text)
  },
}

export default async ({ log, error }) => {
  const t = db()
  let processed = 0,
    failed = 0,
    skipped = 0
  try {
    const jobs = await claimBatch(t)
    await Promise.all(
      jobs.map(async (leased) => {
        const handler = handlers[leased.type]
        try {
          if (!handler)
            throw new Error(`no handler for job type "${leased.type}"`)
          const payload = leased.payload ? JSON.parse(leased.payload) : {}
          const result = await handler(payload, t, leased)
          await complete(t, leased, result)
          processed++
        } catch (e) {
          await failOrRetry(t, leased, e)
          failed++
          error(
            `job ${leased.$id} (${leased.type}) failed: ${e instanceof Error ? e.message : e}`
          )
        }
      })
    )
    if (typeof t.deleteTerminalJobsBefore === "function") {
      const cutoff = new Date(
        Date.now() - JOB_RETENTION_DAYS * 24 * 60 * 60_000
      ).toISOString()
      const deleted = await t.deleteTerminalJobsBefore(cutoff)
      if (deleted > 0) log(`worker ${WID}: pruned ${deleted} terminal jobs`)
    }
    log(
      `worker ${WID}: processed ${processed}, failed ${failed}, skipped ${skipped}`
    )
    return { ok: true, worker: WID, processed, failed, skipped }
  } catch (e) {
    error(
      `worker fatal: ${e instanceof Error ? e.message : String(e)}\n` +
        `endpoint=${process.env.APPWRITE_FUNCTION_API_ENDPOINT} db=${DB}\n` +
        `${e instanceof Error ? e.stack : ""}`
    )
    return { ok: false, error: String(e) }
  }
}
