import crypto from "node:crypto"

import {
  railwayJobRepository,
  type JobRepository,
  type StoredJob,
} from "@/lib/railway/job-repository"
import { getRailwayDatabase } from "@/lib/railway/database"
import type { RailwayServiceContext } from "@/services/template-scheduler"

type ReminderEvent =
  | "generated"
  | "ready_to_post"
  | "scheduled_to_post"
  | "respond_to_comments"
  | "publish_failed"
  | "generation_failed"

type ReminderSettings = {
  channel?: "none" | "telegram"
  telegramBotToken?: string
  telegramChatId?: string
  notificationDefaultsApplied?: boolean
  events?: Partial<
    Record<ReminderEvent, boolean | { channel?: "none" | "telegram" }>
  >
}

type ReminderPayload = {
  event?: string
  text?: string
  sourceType?: string
  sourceId?: string
  requiresPostConfirmation?: boolean
}

type WorkerDependencies = {
  jobs: JobRepository
  loadReminderSettings(ownerId: string): Promise<ReminderSettings | null>
  fetch: typeof fetch
  now(): Date
}

const reminderEvents = new Set<ReminderEvent>([
  "generated",
  "ready_to_post",
  "scheduled_to_post",
  "respond_to_comments",
  "publish_failed",
  "generation_failed",
])

export function createJobWorker(
  dependencies: Partial<WorkerDependencies> = {}
) {
  const jobs = dependencies.jobs ?? railwayJobRepository
  const loadSettings =
    dependencies.loadReminderSettings ?? loadRailwayReminderSettings
  const fetcher = dependencies.fetch ?? fetch
  const now = dependencies.now ?? (() => new Date())

  return async ({ log, error }: RailwayServiceContext) => {
    const batch = positiveInteger(process.env.BATCH, 1)
    const leaseMs = positiveInteger(process.env.LEASE_MS, 960_000)
    const workerId = `worker-${crypto.randomBytes(4).toString("hex")}`
    let processed = 0
    let failed = 0

    try {
      const claimed = await jobs.claim({
        workerId,
        batch,
        leaseMs,
        excludedTypes: ["sync-post-analytics"],
      })
      for (const job of claimed) {
        try {
          const result = await handleJob(job, { loadSettings, fetcher })
          await jobs.complete(job.id, result)
          processed += 1
        } catch (cause) {
          const message = errorMessage(cause).slice(0, 4_000)
          const nonRetryable =
            typeof cause === "object" &&
            cause !== null &&
            (cause as { nonRetryable?: boolean }).nonRetryable === true
          if (nonRetryable || job.attempts >= job.maxAttempts) {
            await jobs.dead({ id: job.id, error: message })
            await sendTelegram(
              `Dead job: ${job.type}\n${job.id}\n${message}`,
              {},
              fetcher
            ).catch(() => undefined)
          } else {
            await jobs.retry({
              id: job.id,
              error: message,
              runAt: new Date(now().getTime() + backoffMs(job.attempts)),
            })
          }
          failed += 1
          error(`job ${job.id} (${job.type}) failed: ${message}`)
        }
      }
      log(`worker ${workerId}: processed ${processed}, failed ${failed}`)
      return { ok: true, worker: workerId, processed, failed, skipped: 0 }
    } catch (cause) {
      error(`worker fatal: ${errorMessage(cause)}`)
      return { ok: false, error: errorMessage(cause) }
    }
  }
}

async function handleJob(
  job: StoredJob,
  dependencies: {
    loadSettings(ownerId: string): Promise<ReminderSettings | null>
    fetcher: typeof fetch
  }
) {
  if (job.type === "echo") return { echoed: job.payload }
  if (job.type !== "send-notification") {
    throw new Error(`no handler for job type "${job.type}"`)
  }
  const payload = asReminderPayload(job.payload)
  if (!clean(payload.text)) {
    throw new Error("send-notification: missing text")
  }
  if (!payload.event) {
    return sendTelegram(payload.text!, {}, dependencies.fetcher)
  }
  return sendConfiguredReminder(payload, job, dependencies)
}

export async function sendConfiguredReminder(
  payload: ReminderPayload,
  job: Pick<StoredJob, "id" | "ownerId">,
  dependencies: {
    loadSettings(ownerId: string): Promise<ReminderSettings | null>
    fetcher: typeof fetch
  }
) {
  const event = clean(payload.event) as ReminderEvent
  if (!reminderEvents.has(event)) {
    throw new Error("send-notification: invalid reminder event")
  }
  const settings = await dependencies.loadSettings(job.ownerId)
  if (!settings || settings.channel === "none") {
    return { sent: false, reason: "disabled" }
  }
  if (reminderChannel(settings, event) !== "telegram") {
    return { sent: false, reason: "event_disabled" }
  }
  const delivery =
    payload.sourceType === "slideshow"
      ? slideshowDeliveryUrls(job.ownerId, clean(payload.sourceId))
      : undefined
  return sendTelegram(
    payload.text!,
    {
      botToken: settings.telegramBotToken,
      chatId: settings.telegramChatId,
      previewUrl: delivery?.previewUrl,
      downloadUrl: delivery?.downloadUrl,
      confirmationJobId: payload.requiresPostConfirmation ? job.id : undefined,
    },
    dependencies.fetcher
  )
}

async function loadRailwayReminderSettings(ownerId: string) {
  if (!ownerId) return null
  const sql = getRailwayDatabase()
  const [row] = await sql<Array<{ payload: ReminderSettings }>>`
    SELECT payload
    FROM domain_records
    WHERE table_name = 'permanent_assets'
      AND source_key = 'reminder_settings'
      AND owner_id = ${ownerId}
    ORDER BY appwrite_updated_at DESC NULLS LAST
    LIMIT 1
  `
  return row?.payload ?? null
}

function reminderChannel(settings: ReminderSettings, event: ReminderEvent) {
  const configured = settings.events?.[event]
  if (configured === true && settings.channel === "telegram") return "telegram"
  if (typeof configured === "object" && configured?.channel === "telegram") {
    return "telegram"
  }
  const hasDestination = Boolean(
    clean(settings.telegramChatId) || clean(process.env.TELEGRAM_CHAT_ID)
  )
  const anyEnabled = Object.values(settings.events ?? {}).some(
    (value) =>
      value === true ||
      (typeof value === "object" && value?.channel === "telegram")
  )
  return event === "generated" &&
    hasDestination &&
    settings.notificationDefaultsApplied !== true &&
    !anyEnabled
    ? "telegram"
    : "none"
}

async function sendTelegram(
  text: string,
  options: {
    botToken?: string
    chatId?: string
    previewUrl?: string
    downloadUrl?: string
    confirmationJobId?: string
  },
  fetcher: typeof fetch
) {
  const savedToken = clean(options.botToken)
  const token = telegramBotToken(savedToken)
    ? savedToken
    : clean(process.env.TELEGRAM_BOT_TOKEN)
  const chatId = clean(options.chatId) || clean(process.env.TELEGRAM_CHAT_ID)
  if (!token || !chatId) return { sent: false, reason: "not_configured" }

  const buttons: Array<
    Array<{ text: string; url?: string; callback_data?: string }>
  > = []
  if (options.previewUrl) {
    buttons.push([{ text: "Preview generation", url: options.previewUrl }])
  }
  if (options.downloadUrl) {
    buttons.push([{ text: "Download slides (.zip)", url: options.downloadUrl }])
  }
  if (options.confirmationJobId) {
    buttons.push([
      {
        text: "Yes, I posted it",
        callback_data: `posted:${options.confirmationJobId}`,
      },
    ])
  }
  const response = await fetcher(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4_000),
        ...(buttons.length
          ? { reply_markup: { inline_keyboard: buttons } }
          : {}),
      }),
    }
  )
  if (!response.ok) {
    throw new Error(`Telegram notification failed (${response.status})`)
  }
  return { sent: true }
}

function slideshowDeliveryUrls(ownerId: string, outputId: string) {
  const baseUrl = clean(process.env.BASE_URL).replace(/\/$/, "")
  const secret = clean(process.env.SLIDESHOW_SHARE_SECRET)
  if (!/^https:\/\//i.test(baseUrl) || !secret || !ownerId || !outputId) {
    return undefined
  }
  const claims = {
    ownerId,
    outputId,
    expiresAt: Math.floor(Date.now() / 1_000) + 365 * 24 * 60 * 60,
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url")
  const token = encodeURIComponent(`${payload}.${signature}`)
  const encodedOutputId = encodeURIComponent(outputId)
  return {
    previewUrl: `${baseUrl}/share/slideshows/${encodedOutputId}?token=${token}`,
    downloadUrl: `${baseUrl}/api/public/slideshows/${encodedOutputId}/download?token=${token}`,
  }
}

function asReminderPayload(value: unknown): ReminderPayload {
  return value && typeof value === "object" ? (value as ReminderPayload) : {}
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function telegramBotToken(value: string) {
  return /^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(value)
}

function positiveInteger(value: string | undefined, fallback: number) {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback
}

function backoffMs(attempts: number) {
  return Math.min(60 * 60 * 1_000, 1_000 * 2 ** attempts)
}

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value)
}

export default createJobWorker()
