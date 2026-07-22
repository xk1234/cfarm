// Appwrite Function: job-worker (cron every minute)
// Runs IN Appwrite. Drains the `jobs` queue: claims queued (and lease-expired)
// jobs, dispatches them to handlers, and marks completed / retried / dead-lettered.
//
// Variables: APPWRITE_API_KEY, APPWRITE_DATABASE_ID, BATCH, LEASE_MS,
//            OPENROUTER_API_KEY, POSTFAST_API_KEY, optional DEEPL_KEY,
//            TELEGRAM_BOT_TOKEN, and TELEGRAM_CHAT_ID.
import crypto from "node:crypto"
import { Client, TablesDB, Storage, Query } from "node-appwrite"
import { llmSlopPromptLine, llmSlopViolations } from "./llm-slop.js"
import { openRouterModelForUseCase } from "./realfarm-generation-model-registry.js"
import { runSlideshowAutomation } from "./slideshow-automation.js"
import { runUgcAutomationJob } from "./ugc-automation.js"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
// A slideshow can consume most of one invocation; do not lease more work than
// this execution can safely finish.
const BATCH = Number(process.env.BATCH || 1)
// Must outlive the function timeout so another cron execution cannot reclaim a
// legitimately slow generation job while it is still running.
const LEASE_MS = Number(process.env.LEASE_MS || 960000)
const WID = `worker-${crypto.randomBytes(4).toString("hex")}`

function db() {
  return new TablesDB(
    new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY)
  )
}
function storage() {
  return new Storage(
    new Client()
      .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
      .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
      .setKey(process.env.APPWRITE_API_KEY)
  )
}
const nowIso = () => new Date().toISOString()
const backoffMs = (attempts) =>
  Math.min(60 * 60 * 1000, 1000 * Math.pow(2, attempts)) // capped 1h

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
    if (err?.telegramNotified !== true) await sendTelegram(`Dead job: ${job.type}\n${job.$id}\n${message}`).catch(() => undefined)
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
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = cleanString(chatIdOverride) || process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return { sent: false, reason: "not_configured" }
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).slice(0, 4000),
        ...(options.confirmationJobId
          ? {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Yes, I posted it",
                      callback_data: `posted:${options.confirmationJobId}`,
                    },
                  ],
                ],
              },
            }
          : {}),
      }),
    }
  )
  if (!response.ok)
    throw new Error(`Telegram notification failed (${response.status})`)
  return { sent: true }
}

async function reminderSettings(t, ownerId) {
  if (!ownerId) return null
  const response = await t.listRows(DB, "permanent_assets", [
    Query.equal("owner_id", [ownerId]),
    Query.equal("source_key", ["reminder_settings"]),
    Query.limit(1),
  ])
  const value = safeJson(response.rows[0]?.data)
  if (!value || value.channel !== "telegram") return null
  return value
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : ""
}

export async function sendConfiguredReminder(payload, t, job) {
  const event = cleanString(payload?.event)
  if (
    event !== "generated" &&
    event !== "ready_to_post" &&
    event !== "scheduled_to_post"
  ) {
    throw new Error("send-notification: invalid reminder event")
  }
  const settings = await reminderSettings(t, job?.owner_id)
  if (!settings) return { sent: false, reason: "disabled" }
  if (settings.events?.[event] !== true) {
    return { sent: false, reason: "event_disabled" }
  }
  return sendTelegram(payload.text, settings.telegramChatId, {
    confirmationJobId:
      payload.requiresPostConfirmation === true ? job?.$id : undefined,
  })
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

const safeJson = (value) => {
  try {
    return JSON.parse(value || "null")
  } catch {
    return null
  }
}
async function xAutomationRecord(t, automationId, ownerId) {
  const response = await t.listRows(DB, "x_automations", [
    Query.equal("rid", [automationId]),
    Query.equal("owner_id", [ownerId]),
    Query.limit(1),
  ])
  const automation = safeJson(response.rows[0]?.data)
  if (!automation) throw new Error("run-x-automation: automation not found")
  return { ...automation, _rowId: response.rows[0].$id }
}

async function upsertXOutput(t, record, ownerId) {
  const sourceKey = "x_automation_run"
  const rowId =
    "u" +
    crypto
      .createHash("sha256")
      .update(`outputs:${sourceKey}:${ownerId}:${record.id}`)
      .digest("hex")
      .slice(0, 35)
  let ord = -Date.now()
  try {
    const existing = await t.getRow(DB, "outputs", rowId)
    if (Number.isFinite(existing.ord)) ord = existing.ord
  } catch (error) {
    if (error?.code !== 404) throw error
  }

  const publications = Array.isArray(record.publishing?.records)
    ? record.publishing.records
    : []
  const stored = JSON.parse(JSON.stringify(record))
  const imageUrls = Array.isArray(stored.imageUrls) ? stored.imageUrls : []
  delete stored.imageUrls
  if (stored.publishing?.records) delete stored.publishing.records
  const primary =
    publications.find((item) => item.status === "published") ||
    publications.find((item) => item.status === "scheduled") ||
    publications.find((item) => item.status === "failed") ||
    null
  await t.upsertRow(DB, "outputs", rowId, {
    rid: record.id,
    owner_id: ownerId,
    source_key: sourceKey,
    name: String(record.automationName || record.hook || record.id).slice(
      0,
      2048
    ),
    kind: "social_post",
    subtype: record.platform || null,
    status: record.status || null,
    storage_class: "permanent",
    origin: "deployed_app",
    title: String(record.hook || record.automationName || record.id).slice(
      0,
      2048
    ),
    hook: String(record.hook || "").slice(0, 10000) || null,
    caption: null,
    hashtags: "[]",
    text: (record.posts || [])
      .map((post) => post.text)
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 100000),
    text_data: JSON.stringify(record.posts || []),
    source_automation_id: record.automationId || null,
    source_run_id: record.id,
    source_entity_id: record.id,
    publication_status: primary?.status || null,
    scheduled_at:
      publications.find((item) => item.scheduledAt)?.scheduledAt || null,
    published_at:
      publications.find((item) => item.publishedAt)?.publishedAt || null,
    primary_post_id:
      publications.find((item) => item.postfastPostId)?.postfastPostId || null,
    primary_release_url:
      publications.find((item) => item.releaseUrl)?.releaseUrl || null,
    publications: JSON.stringify(publications),
    evaluation: "null",
    error:
      record.status === "failed"
        ? String(record.publishing?.error || "Publishing failed")
        : null,
    created_raw: record.createdAt,
    updated_at: record.updatedAt,
    migration_source: null,
    ord,
    data: JSON.stringify(stored),
  })

  let cursor
  const existingMedia = []
  for (;;) {
    const queries = [Query.equal("output_id", [rowId]), Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await t.listRows(DB, "output_media", queries)
    existingMedia.push(...response.rows.map((row) => row.$id))
    if (response.rows.length < 100) break
    cursor = response.rows.at(-1)?.$id
  }
  for (const id of existingMedia) await t.deleteRow(DB, "output_media", id)
  for (const [position, url] of imageUrls.entries()) {
    const mediaId =
      "m" +
      crypto
        .createHash("sha256")
        .update(`${rowId}:post_image:${position}:${url}`)
        .digest("hex")
        .slice(0, 35)
    await t.createRow(DB, "output_media", mediaId, {
      output_id: rowId,
      owner_id: ownerId,
      permanent_asset_id: null,
      kind: "image",
      role: "post_image",
      position,
      storage_bucket: null,
      storage_file_id: null,
      storage_path: null,
      url,
      mime_type: null,
      bytes: null,
      width: null,
      height: null,
      duration_ms: null,
      checksum: null,
      data: "null",
      created_at: nowIso(),
    })
  }
}

async function openRouterObject({ model, system, user }) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey)
    throw new Error("run-x-automation: OPENROUTER_API_KEY is not configured")
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90000),
    }
  )
  const payload = await response.json().catch(() => ({}))
  if (!response.ok)
    throw new Error(
      payload?.error?.message || `OpenRouter failed (${response.status})`
    )
  const raw = payload?.choices?.[0]?.message?.content || "{}"
  const parsed = safeJson(
    String(raw)
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
  )
  if (!parsed) throw new Error("OpenRouter returned invalid JSON")
  return parsed
}

function xStringList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : []
}

async function generateScheduledXDraft(automation, scheduledFor) {
  const platform = automation?.platform === "threads" ? "threads" : "x"
  const pillars = Array.isArray(automation?.brief?.pillars)
    ? automation.brief.pillars.map((item) => item?.label).filter(Boolean)
    : xStringList(automation?.niche?.pillars)
  const seed = crypto
    .createHash("sha256")
    .update(`${automation.id}:${scheduledFor}`)
    .digest()
  const topic =
    pillars[seed[0] % Math.max(1, pillars.length)] || automation.niche?.label
  const model =
    automation?.generation?.model ||
    openRouterModelForUseCase("xPostGeneration")
  const autoPost = automation?.publishing?.autoPost === true
  const xArchetypes = autoPost
    ? [
        "pattern_drop",
        "contrarian_take",
        "numbered_list",
        "comparison",
        "opinion_framework",
      ]
    : [
        "educational_thread",
        "pattern_drop",
        "contrarian_take",
        "numbered_list",
        "comparison",
        "opinion_framework",
      ]
  const threadArchetypes = [
    "label_take",
    "provocative_polemic",
    "audience_callout",
    "question_bait",
    "analogy_reframe",
    "micro_story",
  ]
  const eligible = platform === "threads" ? threadArchetypes : xArchetypes
  const previous = automation?.usage?.recentArchetypes?.at?.(-1)?.id
  const choices = eligible.filter((id) => id !== previous)
  const archetype = (choices.length ? choices : eligible)[
    seed[1] % (choices.length || eligible.length)
  ]
  const hookStyles = xStringList(automation?.generation?.hookStyles)
  const hookStyle =
    hookStyles[seed[2] % Math.max(1, hookStyles.length)] ||
    (platform === "threads" ? "threads_unpopular_opinion" : "contrarian")
  const proof = Array.isArray(automation?.proofBank)
    ? automation.proofBank.map((item) => item?.text).filter(Boolean)
    : []
  const system = [
    `Write one ${platform === "threads" ? "Threads" : "X"} draft for the astrology niche.`,
    platform === "threads"
      ? "Use 1-3 short lines with blank lines between them, at most 500 characters, no hashtags, no links, and at most 2 emoji. Make the identity take polarizing and human."
      : "Use lowercase, blunt, specific language. Single posts must fit 280 characters and end with a genuine question or identity trigger. Multi-post threads use 8-15 posts, each under 280 characters.",
    "Astrology value means emotionally specific identity insight and concrete behavior, not generic trait lists.",
    "Never invent a study, statistic, personal experience, result, testimonial, or source.",
    `Only these supplied proof items may be used: ${proof.length ? proof.join(" | ") : "none"}.`,
    llmSlopPromptLine(),
  ].join("\n")
  const output = await openRouterObject({
    model,
    system,
    user: `Niche: ${automation?.niche?.label || "astrology"}\nAudience: ${automation?.brief?.audience || automation?.niche?.audience || "astrology followers"}\nTopic: ${topic}\nArchetype: ${archetype}\nHook style: ${hookStyle}\nReturn {"posts":["..."]}.`,
  })
  const rawPosts = xStringList(output.posts)
  if (!rawPosts.length)
    throw new Error("Scheduled generation returned no posts")
  const errors = []
  if (rawPosts.some((post) => /https?:\/\//i.test(post))) errors.push("links")
  if (rawPosts.join(" ").match(/\b(?:study of|\d+%|\$\d+)/i) && !proof.length)
    errors.push("unsupported proof")
  if (platform === "x" && rawPosts.some((post) => post.length > 280))
    errors.push("X length")
  if (platform === "threads" && rawPosts.join("\n\n").length > 500)
    errors.push("Threads length")
  const slopViolations = llmSlopViolations(rawPosts.join("\n"))
  if (slopViolations.length) {
    console.warn("Scheduled X draft contains banned AI-tell wording", {
      automationId: automation?.id,
      violations: slopViolations,
    })
    errors.push(...slopViolations)
  }
  if (errors.length)
    throw new Error(`Scheduled draft failed validation: ${errors.join(", ")}`)
  const posts = rawPosts.map((text, index) => ({
    id: `${platform}-post-${index + 1}`,
    text,
    characterCount: text.length,
    role: index === 0 ? "hook" : "content",
    platform,
  }))
  const hook = posts[0]?.text || ""
  return {
    topic,
    archetype,
    contentType: posts.length > 1 ? "thread" : "single",
    platform,
    hook,
    setup: "",
    content: posts.slice(1).map((post) => post.text),
    proof: "",
    curiosityGap: "",
    cta: "",
    posts,
    imagePrompt:
      automation?.media?.mode === "generate"
        ? `${automation.media.prompt || "Editorial social visual"}\nTopic: ${topic}\nCore idea: ${hook}`
        : undefined,
    benchmark: {
      total: 0,
      hook: 0,
      specificity: 0,
      readability: 0,
      cta: 0,
      formatFit: 100,
      stageCompleteness: 100,
      archetypeFit: 0,
      comparison: { archetype, target: "pending independent LLM grade" },
      notes: [],
    },
    plans: [{ platform, archetype, pillar: topic, hookStyle }],
    needsReview: false,
  }
}

async function publishScheduledXDraft(automation, record) {
  if (!automation?.publishing?.autoPost || record.posts.length !== 1)
    return null
  const integrations = (automation.publishing.integrations || []).filter(
    (item) =>
      !item.disabled &&
      (automation.platform === "threads"
        ? item.provider === "threads"
        : item.provider === "x" || item.provider === "twitter")
  )
  if (!integrations.length) return null
  const apiKey = process.env.POSTFAST_API_KEY
  if (!apiKey)
    throw new Error("run-x-automation: POSTFAST_API_KEY is not configured")
  let published = 0
  let failed = 0
  const records = []
  for (const integration of integrations) {
    const scheduledAt = new Date(Date.now() + 60_000).toISOString()
    const response = await fetch("https://api.postfa.st/social-posts", {
      method: "POST",
      headers: { "pf-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "SCHEDULED",
        posts: [
          {
            content: record.posts[0].text,
            socialMediaId: integration.integration_id,
            status: "SCHEDULED",
            scheduledAt,
          },
        ],
      }),
    })
    const payload = await response.json().catch(() => ({}))
    const now = nowIso()
    const status = response.ok ? "scheduled" : "failed"
    if (response.ok) published += 1
    else failed += 1
    records.push({
      id:
        "pf" +
        crypto
          .createHash("sha256")
          .update(`${record.id}:${integration.integration_id}`)
          .digest("hex")
          .slice(0, 32),
      sourceType: "x_automation",
      sourceId: record.id,
      postfastPostId:
        payload?.postIds?.[0] || payload?.data?.postIds?.[0] || undefined,
      integrationId: integration.integration_id,
      provider: integration.provider,
      status,
      scheduledAt,
      content: record.posts[0].text,
      media: [],
      error: response.ok
        ? undefined
        : payload?.message || `PostFast failed (${response.status})`,
      createdAt: now,
      updatedAt: now,
      lastSyncedAt: now,
    })
  }
  return { attemptedAt: nowIso(), published, failed, records }
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

  async ["run-automation"](payload, t, job) {
    return runSlideshowAutomation({
      payload,
      tables: t,
      storage: storage(),
      job,
      databaseId: DB,
    })
  },

  async ["run-ugc-automation"](payload, t, job) {
    return runUgcAutomationJob({ payload, tables: t, storage: storage(), job, databaseId: DB, sendTelegram })
  },

  async ["run-x-automation"](payload, t, job) {
    const { automationId, scheduledFor } = payload || {}
    if (!automationId) throw new Error("run-x-automation: missing automationId")
    const runId =
      "xrun" +
      crypto
        .createHash("sha256")
        .update(`${automationId}:${scheduledFor}`)
        .digest("hex")
        .slice(0, 32)
    const ownerId = job?.owner_id || payload.ownerId
    if (!ownerId) throw new Error("run-x-automation: missing ownerId")
    const automation = await xAutomationRecord(t, automationId, ownerId)
    const draft = await generateScheduledXDraft(automation, scheduledFor)
    const record = {
      id: runId,
      automationId,
      automationName: automation.name || automationId,
      ...draft,
      reactionMode: "none",
      imageUrls: [],
      status: "draft",
      scheduledFor,
      ownerId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    const publishing = await publishScheduledXDraft(automation, record)
    if (publishing) {
      record.publishing = publishing
      record.status =
        publishing.published > 0
          ? "published"
          : publishing.failed > 0
            ? "failed"
            : "draft"
      record.updatedAt = nowIso()
    }
    try {
      await upsertXOutput(t, record, ownerId)
      await enqueueReminderJob(t, ownerId, {
        event: "generated",
        sourceType: record.platform || "x",
        sourceId: record.id,
        text: `Post generated\n${record.hook || record.automationName}`,
      }).catch(() => undefined)
      for (const publication of publishing?.records || []) {
        if (publication.status !== "scheduled") continue
        await enqueueReminderJob(t, ownerId, {
          event: "scheduled_to_post",
          sourceType: record.platform || "x",
          sourceId: record.id,
          scheduledFor: publication.scheduledAt,
          dedupeSuffix: publication.integrationId,
          text: `Post scheduled\n${record.hook || record.automationName}\nScheduled for ${publication.scheduledAt}`,
        }).catch(() => undefined)
      }
      const recentArchetypes = [
        ...(automation?.usage?.recentArchetypes || []),
        ...(record.plans || []).map((plan) => ({
          id: plan.archetype,
          at: record.createdAt,
        })),
      ].slice(-100)
      const recentHooks = [
        ...(automation?.usage?.recentHooks || []),
        ...(record.plans || []).map((plan) => plan.hookStyle),
      ].slice(-30)
      const recentBodies = [
        ...(automation?.usage?.recentBodies || []),
        ...(record.platform === "threads" && record.posts[0]
          ? [
              {
                body:
                  record.posts[0].text
                    .split(/\n\s*\n/)
                    .slice(1)
                    .join("\n\n") || record.posts[0].text,
                hook: record.posts[0].text.split(/\n/)[0] || record.hook,
                at: record.createdAt,
              },
            ]
          : []),
      ].slice(-100)
      const { _rowId, ...storedAutomation } = automation
      storedAutomation.usage = { recentArchetypes, recentHooks, recentBodies }
      storedAutomation.updatedAt = nowIso()
      await t.updateRow(DB, "x_automations", _rowId, {
        data: JSON.stringify(storedAutomation),
      })
      return {
        runId,
        created: true,
        note: "scheduled X draft generated",
      }
    } catch (cause) {
      if (cause.code === 409)
        return { runId, created: false, note: "run already recorded" }
      throw cause
    }
  },
}

export default async ({ log, error }) => {
  const t = db()
  let processed = 0,
    failed = 0,
    skipped = 0
  try {
    const candidates = await findCandidates(t)
    for (const job of candidates) {
      const leased = await claim(t, job).catch(() => null)
      if (!leased) {
        skipped++
        continue
      }
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
    }
    log(
      `worker ${WID}: processed ${processed}, failed ${failed}, skipped ${skipped}`
    )
    return { ok: true, worker: WID, processed, failed, skipped }
  } catch (e) {
    error(`worker fatal: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, error: String(e) }
  }
}
