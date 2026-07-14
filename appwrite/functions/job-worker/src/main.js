// Appwrite Function: job-worker (cron every minute)
// Runs IN Appwrite. Drains the `jobs` queue: claims queued (and lease-expired)
// jobs, dispatches them to handlers, and marks completed / retried / dead-lettered.
//
// Variables: APPWRITE_API_KEY (full-access key), APPWRITE_DATABASE_ID (default "cfarm"),
//            BATCH (default 10), LEASE_MS (default 120000).
import crypto from "node:crypto"
import { Client, TablesDB, Storage, Query } from "node-appwrite"
import pdf from "pdf-parse"
import { fal } from "@fal-ai/client"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const BATCH = Number(process.env.BATCH || 10)
// Must outlive the function timeout so another cron execution cannot reclaim a
// legitimately slow Apify/transcription job while it is still running.
const LEASE_MS = Number(process.env.LEASE_MS || 360000)
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
  const message = (err instanceof Error ? err.message : String(err)).slice(
    0,
    4000
  )
  if (attempts >= max) {
    await t.updateRow(DB, "jobs", job.$id, {
      status: "dead",
      error: message,
      updated_at: nowIso(),
    })
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

// ---------- knowledge-base ingestion + recurring refresh ----------
const KB_TABLE = "knowledge_bases"
const EXPIRY_MS = {
  "0m": 0,
  "1h": 3600000,
  "24h": 86400000,
  "1w": 604800000,
  "1mo": 2592000000,
  "1y": 31536000000,
}
const stripHtml = (value) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim()
const safeJson = (value) => {
  try {
    return JSON.parse(value || "null")
  } catch {
    return null
  }
}
const jobId = (key) =>
  "j" + crypto.createHash("sha256").update(key).digest("hex").slice(0, 35)

async function scheduleDueKnowledgeSources(t) {
  let rows
  try {
    rows = (await t.listRows(DB, KB_TABLE, [Query.limit(100)])).rows
  } catch (e) {
    if (e.code === 404) return 0
    throw e
  }
  let enqueued = 0
  const now = Date.now()
  for (const row of rows) {
    const kb = safeJson(row.data)
    if (!kb?.sources) continue
    for (const source of kb.sources.filter(
      (item) =>
        item.mode === "realtime" &&
        item.enabled !== false &&
        item.status !== "queued" &&
        item.status !== "processing"
    )) {
      const ttl = EXPIRY_MS[source.expiry] ?? EXPIRY_MS["24h"]
      const last = source.lastScrapedAt ? Date.parse(source.lastScrapedAt) : 0
      if (last && ttl > 0 && now - last < ttl) continue
      const slot = ttl > 0 ? Math.floor(now / ttl) : Math.floor(now / 60000)
      const dedupe = `knowledge-source:${kb.id}:${source.id}:scheduled:${slot}`
      try {
        const iso = nowIso()
        await t.createRow(DB, "jobs", jobId(dedupe), {
          type: "refresh-knowledge-source",
          status: "queued",
          payload: JSON.stringify({
            knowledgeBaseId: kb.id,
            sourceId: source.id,
            requestedAt: iso,
          }),
          priority: 0,
          attempts: 0,
          max_attempts: 3,
          available_at: iso,
          dedupe_key: dedupe,
          created_at: iso,
          updated_at: iso,
          owner_id: row.owner_id || kb.ownerId || null,
        })
        enqueued++
      } catch (e) {
        if (e.code !== 409) throw e
      }
    }
  }
  return enqueued
}

async function apifyItems(actor, input, timeoutSecs = 180) {
  const token = process.env.APIFY_KEY || process.env.APIFY_TOKEN
  if (!token) throw new Error("APIFY_KEY is not configured")
  const id = actor.replace("/", "~")
  const response = await fetch(
    `https://api.apify.com/v2/acts/${id}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=${timeoutSecs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((timeoutSecs + 10) * 1000),
    }
  )
  if (!response.ok)
    throw new Error(
      `Apify ${actor} failed (${response.status}): ${(await response.text()).slice(0, 500)}`
    )
  return await response.json()
}

async function scrapeRss(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "CfarmKnowledgeBot/1.0" },
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`RSS request failed (${response.status})`)
  const xml = await response.text()
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .slice(0, 25)
    .map((match) => {
      const item = match[0]
      const field = (name) =>
        stripHtml(
          item
            .match(
              new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i")
            )?.[1]
            ?.replace(/<!\[CDATA\[|\]\]>/g, "")
        )
      return {
        title: field("title"),
        link: field("link"),
        publishedAt: field("pubDate"),
        description: field("description"),
      }
    })
  if (!items.length) throw new Error("RSS feed contained no items")
  return items
    .map(
      (item) =>
        `${item.title}\n${item.publishedAt}\n${item.description}\n${item.link}`
    )
    .join("\n\n")
}

async function dataForSeo(query) {
  const login = process.env.DATAFORSEO_LOGIN,
    password = process.env.DATAFORSEO_PASSWORD
  if (!login || !password)
    throw new Error(
      "DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required for Google search"
    )
  const response = await fetch(
    "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          keyword: query,
          location_name: "Singapore",
          language_code: "en",
          depth: 20,
        },
      ]),
      signal: AbortSignal.timeout(60000),
    }
  )
  if (!response.ok) throw new Error(`DataForSEO failed (${response.status})`)
  return JSON.stringify(
    (await response.json()).tasks?.[0]?.result?.[0]?.items ?? []
  )
}

async function uploadedFileText(source) {
  const bytes = Buffer.from(
    await storage().getFileView("knowledge_base_files", source.storageFileId)
  )
  if (
    source.mimeType === "application/pdf" ||
    /\.pdf$/i.test(source.fileName || "")
  )
    return (await pdf(bytes)).text
  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY
  if (falKey) {
    fal.config({ credentials: falKey })
    const file = new File([bytes], source.fileName || "audio.mp3", {
      type: source.mimeType || "audio/mpeg",
    })
    const audioUrl = await fal.storage.upload(file)
    const request = fal.subscribe(
      process.env.FAL_WHISPER_MODEL || "fal-ai/whisper",
      {
        input: { audio_url: audioUrl, task: "transcribe" },
      }
    )
    const result = await Promise.race([
      request,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("fal Whisper transcription timed out")),
          180000
        )
      ),
    ])
    const text = result?.data?.text
    if (!text) throw new Error("fal Whisper returned an empty transcription")
    return text
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey)
    throw new Error(
      "FAL_KEY (preferred) or OPENAI_API_KEY is required to transcribe uploaded audio"
    )
  const form = new FormData()
  form.append(
    "model",
    process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe"
  )
  form.append(
    "file",
    new Blob([bytes], { type: source.mimeType || "audio/mpeg" }),
    source.fileName || "audio.mp3"
  )
  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(240000),
    }
  )
  if (!response.ok)
    throw new Error(
      `Audio transcription failed (${response.status}): ${(await response.text()).slice(0, 400)}`
    )
  return (await response.json()).text
}

async function scrapeSource(source) {
  if (source.kind === "rss") return scrapeRss(source.value)
  if (source.kind === "google") return dataForSeo(source.value)
  if (source.kind === "file") return uploadedFileText(source)
  if (source.kind === "youtube")
    return JSON.stringify(
      await apifyItems(
        process.env.APIFY_YOUTUBE_ACTOR ||
          "pintostudio/youtube-transcript-scraper",
        { videoUrl: source.value, targetLanguage: "en" }
      )
    )
  if (source.kind === "link") {
    const fast = await apifyItems("apify/rag-web-browser", {
      query: source.value,
      maxResults: 1,
      outputFormats: ["text"],
      requestTimeoutSecs: 45,
      requestTimeoutContentCrawlSecs: 45,
      proxyConfiguration: { useApifyProxy: true },
    })
    const fastText = JSON.stringify(fast)
    if (
      fastText.length >= 500 &&
      !/(403|forbidden|access denied|currently inaccessible|could not access|no textual|no usable|no data|no content|returned no)/i.test(
        fastText
      )
    ) {
      return fastText
    }
    return JSON.stringify(
      await apifyItems(
        "apify/website-content-crawler",
        {
          startUrls: [{ url: source.value }],
          crawlerType: "playwright:adaptive",
          maxCrawlDepth: 0,
          maxCrawlPages: 1,
          outputFormats: ["markdown"],
          proxyConfiguration: { useApifyProxy: true },
        },
        240
      )
    )
  }
  if (source.kind === "reddit")
    return JSON.stringify(
      await apifyItems(
        process.env.APIFY_REDDIT_ACTOR || "trudax/reddit-scraper-lite",
        {
          searches: [source.value],
          searchPosts: true,
          skipComments: true,
          sort: "relevance",
          time: "year",
          maxItems: 5,
        }
      )
    )
  if (source.kind === "twitter")
    return JSON.stringify(
      await apifyItems(
        process.env.APIFY_TWITTER_ACTOR || "apidojo/tweet-scraper",
        {
          searchTerms: [source.value],
          sort: "Latest",
          tweetLanguage: "en",
          maxItems: 5,
        }
      )
    )
  if (source.kind === "tiktok")
    return JSON.stringify(
      await apifyItems(
        process.env.APIFY_TIKTOK_ACTOR || "clockworks/tiktok-scraper",
        {
          searchQueries: [source.value],
          searchSection: "/video",
          videoSearchSorting: "LATEST",
          resultsPerPage: 5,
        }
      )
    )
  throw new Error(`Unsupported source kind: ${source.kind}`)
}

async function compressText(source, raw) {
  const text = String(raw || "").slice(0, 120000)
  if (!text.trim()) throw new Error("Source returned no usable text")
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return text.slice(0, 30000)
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.KNOWLEDGE_SUMMARY_MODEL || "openai/gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "Compress source material into a dense, factual knowledge chunk for a downstream model. Preserve dates, figures, names, links, disagreements, and provenance. Remove navigation, repetition, and promotional copy. Never invent facts.",
          },
          {
            role: "user",
            content: `Source: ${source.label}\nType: ${source.kind}\nURL/query: ${source.value}\n\n${text}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
      signal: AbortSignal.timeout(60000),
    }
  )
  if (!response.ok)
    throw new Error(
      `Knowledge compression failed (${response.status}): ${(await response.text()).slice(0, 400)}`
    )
  const payload = await response.json()
  const compressed =
    payload.choices?.[0]?.message?.content?.trim() || text.slice(0, 30000)
  if (
    /^no (?:available )?(?:relevant )?data\b|^no data (?:was )?found\b|no factual details|no text or data|content (?:from the link )?is empty|cannot be extracted/i.test(
      compressed
    )
  ) {
    throw new Error("Source returned no relevant data for this query")
  }
  return compressed
}

async function knowledgeBaseRow(t, knowledgeBaseId, ownerId) {
  try {
    return await t.getRow(DB, KB_TABLE, knowledgeBaseId)
  } catch (e) {
    if (e.code !== 404) throw e
  }
  const queries = [Query.equal("rid", [knowledgeBaseId]), Query.limit(2)]
  if (ownerId) queries.unshift(Query.equal("owner_id", [ownerId]))
  const rows = (await t.listRows(DB, KB_TABLE, queries)).rows
  if (rows.length !== 1) {
    throw new Error(`Knowledge base ${knowledgeBaseId} could not be resolved`)
  }
  return rows[0]
}

async function updateKnowledgeSource(
  t,
  knowledgeBaseId,
  sourceId,
  mutate,
  ownerId
) {
  const row = await knowledgeBaseRow(t, knowledgeBaseId, ownerId)
  const kb = safeJson(row.data)
  if (!kb) throw new Error(`Knowledge base ${knowledgeBaseId} is invalid`)
  const index = kb.sources?.findIndex((item) => item.id === sourceId) ?? -1
  if (index < 0) throw new Error(`Knowledge source ${sourceId} not found`)
  kb.sources[index] = mutate(kb.sources[index])
  const active = kb.sources.some(
    (item) => item.status === "queued" || item.status === "processing"
  )
  kb.status = active
    ? "refreshing"
    : kb.sources.some((item) => item.status === "ready")
      ? "ready"
      : kb.sources.some((item) => item.status === "error")
        ? "error"
        : "idle"
  kb.compiledText = kb.sources
    .flatMap((item) =>
      (item.chunks || []).map(
        (chunk) =>
          `## ${chunk.title || item.label}\n${chunk.text}\nSource: ${chunk.url || item.value}`
      )
    )
    .join("\n\n")
  kb.updatedAt = nowIso()
  if (!active) kb.lastRefreshedAt = nowIso()
  await t.updateRow(DB, KB_TABLE, row.$id, {
    status: kb.status,
    data: JSON.stringify(kb),
  })
  return kb.sources[index]
}

async function xAutomationRecord(t, automationId, ownerId) {
  const response = await t.listRows(DB, "x_automations", [
    Query.equal("rid", [automationId]),
    Query.equal("owner_id", [ownerId]),
    Query.limit(1),
  ])
  const automation = safeJson(response.rows[0]?.data)
  if (!automation) throw new Error("run-x-automation: automation not found")
  return automation
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
  const pillars = xStringList(automation?.niche?.pillars)
  const seed = crypto
    .createHash("sha256")
    .update(`${automation.id}:${scheduledFor}`)
    .digest()
  const topic =
    pillars[seed[0] % Math.max(1, pillars.length)] || automation.niche?.label
  const model = automation?.generation?.model || "google/gemini-3.1-flash-lite"
  const shared = [
    `Write native social content for ${(automation?.output?.platforms || ["x"]).join(" and ")}.`,
    `Niche: ${automation?.niche?.label || ""}.`,
    `Audience: ${automation?.niche?.audience || ""}.`,
    `Account promise: ${automation?.niche?.promise || ""}.`,
    `Topic: ${topic}.`,
    `Voice: ${automation?.generation?.voice || "specific and tactical"}.`,
    "Never invent metrics, testimonials, personal experience, studies, or product-version claims.",
  ].join("\n")
  const hookPayload = await openRouterObject({
    model,
    system: `${shared}\nYou are the hook writer only. ${automation?.generation?.hookPrompt || ""}`,
    user: 'Return {"candidates":[...],"selected":"..."} with five hooks and one selection.',
  })
  const hook =
    String(hookPayload.selected || "").trim() ||
    xStringList(hookPayload.candidates)[0]
  if (!hook) throw new Error("Scheduled hook generation returned no hook")
  const contentType = automation?.output?.contentType || "thread"
  const minPosts = Math.max(
    1,
    Number(automation?.output?.threadPostCount?.min || 7) - 2
  )
  const maxPosts = Math.max(
    minPosts,
    Number(automation?.output?.threadPostCount?.max || 10) - 2
  )
  const contentPayload = await openRouterObject({
    model,
    system: `${shared}\nYou are the body writer only. ${automation?.generation?.contentPrompt || ""}`,
    user:
      contentType === "thread"
        ? `Hook: ${hook}\nReturn {"sections":[...]} with ${minPosts}-${maxPosts} body posts under ${automation?.output?.maxCharacters || 280} characters each.`
        : contentType === "article"
          ? `Hook: ${hook}\nReturn {"title":"...","sections":[...]} for an ${automation?.output?.articleWordCount?.min || 800}-${automation?.output?.articleWordCount?.max || 1200} word article.`
          : `Hook: ${hook}\nReturn {"sections":["..."]} for a single post that leaves room for the hook and CTA within ${automation?.output?.maxCharacters || 280} characters.`,
  })
  const content = xStringList(
    contentPayload.sections || contentPayload.posts || contentPayload.paragraphs
  )
  if (!content.length)
    throw new Error("Scheduled content generation returned no body")
  const ctaPayload = await openRouterObject({
    model,
    system: `${shared}\nYou are the CTA writer only. ${automation?.generation?.ctaPrompt || ""}`,
    user: `Hook: ${hook}\nContent: ${content.join("\n\n")}\nReturn {"options":[...],"selected":"..."}.`,
  })
  const cta =
    String(ctaPayload.selected || "").trim() ||
    xStringList(ctaPayload.options)[0]
  const rawPosts =
    contentType === "thread"
      ? [hook, ...content, cta].filter(Boolean)
      : [[hook, ...content, cta].filter(Boolean).join("\n\n")]
  const posts = rawPosts.map((text, index) => ({
    id: `post-${index + 1}`,
    text,
    characterCount: text.length,
    role:
      contentType !== "thread"
        ? "content"
        : index === 0
          ? "hook"
          : index === rawPosts.length - 1
            ? "cta"
            : "content",
  }))
  const maxCharacters = Number(automation?.output?.maxCharacters || 280)
  const overflows = posts.filter((post) => post.characterCount > maxCharacters)
  const formatFit = Math.max(0, 100 - overflows.length * 25)
  return {
    topic,
    contentType,
    platforms: automation?.output?.platforms || ["x"],
    hook,
    content,
    cta,
    posts,
    articleTitle: contentPayload.title,
    articleBody:
      contentType === "article"
        ? [hook, ...content, cta].filter(Boolean).join("\n\n")
        : undefined,
    imagePrompt:
      automation?.media?.mode === "generate"
        ? `${automation.media.prompt || "Editorial social visual"}\nTopic: ${topic}\nCore idea: ${hook}`
        : undefined,
    benchmark: {
      total: Math.round(
        (formatFit + (hook.length <= maxCharacters ? 90 : 40)) / 2
      ),
      hook: hook.length <= maxCharacters ? 90 : 40,
      specificity: 75,
      readability: 80,
      cta: cta ? 85 : 20,
      formatFit,
      notes: overflows.length
        ? [`${overflows.length} post(s) exceed the character limit.`]
        : [],
    },
  }
}

// ---------- handlers ----------
const handlers = {
  // verification handler
  async echo(payload) {
    return { echoed: payload }
  },

  async ["refresh-knowledge-source"](payload, t, job) {
    const { knowledgeBaseId, sourceId, requestedAt } = payload || {}
    if (!knowledgeBaseId || !sourceId)
      throw new Error("refresh-knowledge-source: missing ids")
    const sourceBeforeRefresh = safeJson(
      (await knowledgeBaseRow(t, knowledgeBaseId, job?.owner_id)).data
    )?.sources?.find((item) => item.id === sourceId)
    if (sourceBeforeRefresh?.mode !== "realtime") {
      return {
        knowledgeBaseId,
        sourceId,
        skipped: true,
        reason: "research sources are static",
      }
    }
    if (requestedAt) {
      const current = sourceBeforeRefresh
      if (
        current?.lastScrapedAt &&
        Date.parse(current.lastScrapedAt) >= Date.parse(requestedAt)
      ) {
        return {
          knowledgeBaseId,
          sourceId,
          skipped: true,
          reason: "newer refresh already completed",
        }
      }
    }
    const source = await updateKnowledgeSource(
      t,
      knowledgeBaseId,
      sourceId,
      (item) => ({ ...item, status: "processing", error: null }),
      job?.owner_id
    )
    try {
      const raw = await scrapeSource(source)
      const text = await compressText(source, raw)
      const scrapedAt = nowIso()
      const ttl = EXPIRY_MS[source.expiry] ?? EXPIRY_MS["24h"]
      await updateKnowledgeSource(
        t,
        knowledgeBaseId,
        sourceId,
        (item) => ({
          ...item,
          status: "ready",
          error: null,
          lastScrapedAt: scrapedAt,
          nextRefreshAt: ttl
            ? new Date(Date.now() + ttl).toISOString()
            : scrapedAt,
          chunks: [
            {
              id: crypto.randomUUID(),
              sourceId,
              text,
              title: item.label,
              url: item.value,
              generatedAt: scrapedAt,
            },
          ],
        }),
        job?.owner_id
      )
      return { knowledgeBaseId, sourceId, characters: text.length }
    } catch (e) {
      if (requestedAt) {
        const current = safeJson(
          (await knowledgeBaseRow(t, knowledgeBaseId, job?.owner_id)).data
        )?.sources?.find((item) => item.id === sourceId)
        if (
          current?.lastScrapedAt &&
          Date.parse(current.lastScrapedAt) >= Date.parse(requestedAt) &&
          current?.chunks?.length
        ) {
          // A concurrent/older attempt may fail after a newer attempt already
          // persisted good content. Never downgrade that successful source.
          await updateKnowledgeSource(
            t,
            knowledgeBaseId,
            sourceId,
            (item) => ({
              ...item,
              status: "ready",
              error: null,
            }),
            job?.owner_id
          )
          return {
            knowledgeBaseId,
            sourceId,
            skipped: true,
            reason: "newer refresh already completed",
          }
        }
      }
      await updateKnowledgeSource(
        t,
        knowledgeBaseId,
        sourceId,
        (item) => ({
          ...item,
          status: "error",
          error: (e instanceof Error ? e.message : String(e)).slice(0, 1000),
        }),
        job?.owner_id
      )
      throw e
    }
  },

  // Integration point for the automation pipeline. Runs in Appwrite: records a
  // durable run row (deduped) in `automation_runs`. The heavy media generation
  // (LLM copy -> image/video via OpenRouter/KIE, assembly via Rendi -> Storage,
  // then social posting) plugs in here as cloud HTTP calls using function vars
  // for the provider keys. Kept as an explicit, honest boundary rather than faked.
  async ["run-automation"](payload, t, job) {
    const { automationId, scheduledFor } = payload || {}
    if (!automationId) throw new Error("run-automation: missing automationId")
    const runId =
      "run" +
      crypto
        .createHash("sha256")
        .update(`${automationId}:${scheduledFor}`)
        .digest("hex")
        .slice(0, 33)
    const ownerId = job?.owner_id || payload.ownerId
    if (!ownerId) throw new Error("run-automation: missing ownerId")
    const record = {
      id: runId,
      automationId,
      scheduledFor,
      ownerId,
      status: "accepted", // -> "generating" -> "posted" once the pipeline is wired
      claimedAt: nowIso(),
      claimedBy: "job-worker",
    }
    try {
      await t.createRow(DB, "automation_runs", runId, {
        rid: runId,
        name: automationId,
        status: record.status,
        created_raw: record.claimedAt,
        source_key: "runs",
        ord: Math.floor(Date.now() / 1000),
        data: JSON.stringify(record),
        owner_id: ownerId,
      })
      return {
        runId,
        created: true,
        note: "run recorded; media-generation pipeline is the next handler step",
      }
    } catch (e) {
      if (e.code === 409)
        return { runId, created: false, note: "run already recorded (dedup)" }
      throw e
    }
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
    try {
      await t.createRow(DB, "x_automation_runs", runId, {
        rid: runId,
        name: automationId,
        status: record.status,
        created_raw: record.createdAt,
        ord: Math.floor(Date.now() / 1000),
        data: JSON.stringify(record),
        owner_id: ownerId,
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
    const scheduled = await scheduleDueKnowledgeSources(t)
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
      `worker ${WID}: scheduled ${scheduled}, processed ${processed}, failed ${failed}, skipped ${skipped}`
    )
    return { ok: true, worker: WID, scheduled, processed, failed, skipped }
  } catch (e) {
    error(`worker fatal: ${e instanceof Error ? e.message : String(e)}`)
    return { ok: false, error: String(e) }
  }
}
