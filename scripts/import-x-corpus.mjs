/**
 * Seed and grade the X/Threads astrology benchmark corpus.
 *
 * Safe default imports only ten hand-authored playbook instantiations.
 * Scraping is deliberately gated because the implementation guide requires
 * explicit approval of the account list:
 *   node --env-file=.env scripts/import-x-corpus.mjs --templates-only
 *   node --env-file=.env scripts/import-x-corpus.mjs --approve-x account1,account2 --approve-threads account3,account4
 */
import { createHash } from "node:crypto"

import { Client, TablesDB } from "node-appwrite"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const TABLE = "x_benchmark_corpus"
const MODEL = "google/gemini-2.5-flash"
const approvedX = approvedList("--approve-x")
const approvedThreads = approvedList("--approve-threads")

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)
const tables = new TablesDB(client)

const seeds = [
  x("pattern-drop", "the 3 signs that text back first:\n\ncancer checks if you're okay. gemini already has a second thought. leo refuses to look uninterested.\n\nwhich one always replies before you put your phone down?", "pattern_drop"),
  x("comparison", "dating a leo vs dating a scorpio:\n\nleo wants love you can see.\nscorpio wants loyalty nobody else can access.\n\none asks for applause. the other asks for your secrets. which feels safer to you?", "comparison"),
  x("contrarian", "unpopular opinion: geminis aren't inconsistent.\n\nthey notice the version of you that changed, then adjust before you admit anything happened.\n\nis that mixed energy—or uncomfortable accuracy?", "contrarian_take"),
  x("numbered", "5 signs that go quiet before they leave:\n\n1. taurus stops explaining\n2. cancer stops checking in\n3. virgo stops correcting you\n4. scorpio stops asking\n5. capricorn stops making time\n\nwhich silence hurts most?", "numbered_list"),
  x("opinion", "my take on pisces:\n\n→ they remember the feeling, not the wording\n→ they forgive before they trust again\n→ they disappear emotionally before they leave physically\n\nbottom line: softness is not the same as access. agree?", "opinion_framework"),
  threads("label", "UNPOPULAR OPINION\n\nScorpios don't hold grudges. They remember exactly who felt safe before you changed the rules.", "label_take"),
  threads("callout", "Leos, this is your reminder:\n\nYou don't miss the person. You miss who you got to be when they were watching.", "audience_callout"),
  threads("question", "Which sign made you feel completely understood—and then used that information against you?", "question_bait"),
  threads("analogy", "Dating a Virgo is like handing someone your rough draft.\n\nThey see what you meant, what you missed, and whether you're willing to revise.", "analogy_reframe"),
  threads("polemic", "REALITY CHECK\n\nBeing compatible on paper means nothing if one sign needs reassurance and the other treats silence like peace.", "provocative_polemic"),
]

for (const [index, record] of seeds.entries()) {
  record.grade = await grade(record)
  await upsert(record, index)
  console.log(`[${index + 1}/${seeds.length}] ${record.id} overall=${record.grade.scores.overall}`)
}

if (approvedX.length || approvedThreads.length) {
  if (!process.env.APIFY_KEY) throw new Error("APIFY_KEY is required for approved account scraping")
  const scraped = [
    ...(approvedX.length ? await scrapeApproved("x", approvedX) : []),
    ...(approvedThreads.length ? await scrapeApproved("threads", approvedThreads) : []),
  ]
  for (const [offset, record] of scraped.entries()) {
    record.grade = await grade(record)
    await upsert(record, seeds.length + offset)
    console.log(`[scraped ${offset + 1}/${scraped.length}] ${record.platform} @${record.author} lift=${record.lift.toFixed(2)} overall=${record.grade.scores.overall}`)
  }
}

function approvedList(flag) {
  const index = process.argv.indexOf(flag)
  const raw = index >= 0 ? process.argv[index + 1] : process.argv.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1)
  return (raw || "").split(",").map((item) => item.trim().replace(/^@/, "")).filter(Boolean)
}

async function scrapeApproved(platform, accounts) {
  const actor = platform === "x"
    ? (process.env.APIFY_TWITTER_ACTOR || "apidojo~twitter-scraper-lite").replace("/", "~")
    : (process.env.APIFY_THREADS_ACTOR || "automation-lab~threads-scraper").replace("/", "~")
  const input = platform === "x"
    ? { searchTerms: accounts.map((account) => `from:${account}`), maxItems: Math.max(50, accounts.length * 30), sort: "Latest + Top" }
    : { mode: "posts", usernames: accounts, maxPosts: 30, includeProfile: true }
  const response = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(process.env.APIFY_KEY)}&format=json&clean=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(5 * 60_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error?.message || `${platform} corpus scrape failed (${response.status})`)
  const rows = (Array.isArray(payload) ? payload : []).flatMap((row, index) => normalizeScraped(platform, row, index))
  const medians = new Map(accounts.map((account) => {
    const likes = rows.filter((row) => row.author.toLowerCase() === account.toLowerCase()).map((row) => row.metrics.likes).filter(Number.isFinite)
    return [account.toLowerCase(), median(likes)]
  }))
  return rows
    .map((row) => ({ ...row, lift: row.metrics.likes / Math.max(1, medians.get(row.author.toLowerCase()) || 1) }))
    .sort((a, b) => b.lift - a.lift || b.metrics.replies - a.metrics.replies)
    .slice(0, 15)
}

function normalizeScraped(platform, row, index) {
  if (!row || typeof row !== "object") return []
  const text = stringValue(row.text || row.fullText || row.caption)
  const author = stringValue(row.username || row.author?.userName || row.author?.username || row.authorName || row.author)
  const sourceUrl = stringValue(row.url || row.tweetUrl || row.postUrl)
  if (!text || !author || !sourceUrl) return []
  return [{
    id: `scraped-${platform}-${stringValue(row.id || row.tweetId || row.postId || row.code) || index}`,
    platform,
    niche: "astrology",
    author,
    sourceUrl,
    text,
    metrics: {
      likes: numberValue(row.likeCount ?? row.favoriteCount ?? row.likes),
      replies: numberValue(row.replyCount ?? row.replies),
      reposts: numberValue(row.repostCount ?? row.retweetCount ?? row.retweets),
      views: numberValue(row.viewCount ?? row.views),
    },
    lift: 0,
    notes: ["Public post imported from an explicitly approved benchmark account."],
    createdAt: new Date().toISOString(),
  }]
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : ""
}

function numberValue(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function median(values) {
  const sorted = values.sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function x(id, text, archetype) {
  return base(`template-x-${id}`, "x", text, archetype)
}
function threads(id, text, archetype) {
  return base(`template-threads-${id}`, "threads", text, archetype)
}
function base(id, platform, text, archetype) {
  return {
    id,
    platform,
    niche: "astrology",
    author: "Playbook template",
    text,
    archetype,
    metrics: {},
    notes: ["Hand-authored playbook instantiation used as a format anchor, not performance proof."],
    createdAt: new Date().toISOString(),
  }
}

async function grade(record) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required")
  const keys = record.platform === "x"
    ? ["hookStopPower", "valueDensity", "voiceFormatFit", "replyBait"]
    : ["hookLabelPower", "scannability", "identityPolarity", "replyBait"]
  const rubric = record.platform === "x"
    ? "Grade X copy 0-10 on hookStopPower, valueDensity, voiceFormatFit, replyBait. 9-10 is exceptionally specific and native; 5 is readable but skippable; <=3 is generic."
    : "Grade Threads copy 0-10 on hookLabelPower, scannability, identityPolarity, replyBait. 9-10 is instantly readable, polarizing, and identity-specific; 5 is readable but skippable; <=3 is generic."
  let parsed
  let repair = ""
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: rubric }, { role: "user", content: `Niche: astrology\n\n${record.text}${repair}` }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: `${record.platform}_benchmark_grade`, strict: true,
          schema: {
            type: "object", additionalProperties: false, required: ["scores", "rationales"],
            properties: {
              scores: { type: "object", additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map((key) => [key, { type: "integer", minimum: 0, maximum: 10 }])) },
              rationales: { type: "object", additionalProperties: false, required: keys, properties: Object.fromEntries(keys.map((key) => [key, { type: "string" }])) },
            },
          },
        },
      },
      }),
      signal: AbortSignal.timeout(90_000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter ${response.status}`)
    const raw = payload.choices?.[0]?.message?.content
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw
      break
    } catch {
      repair = "\n\nYour prior response was truncated or invalid JSON. Return compact valid JSON with one short sentence per rationale."
    }
  }
  if (!parsed) throw new Error("Benchmark judge returned invalid JSON twice")
  const overall = Math.round((keys.reduce((sum, key) => sum + Number(parsed.scores[key] || 0), 0) / keys.length) * 10) / 10
  return {
    scores: { hookStopPower: 0, valueDensity: 0, voiceFormatFit: 0, hookLabelPower: 0, scannability: 0, identityPolarity: 0, replyBait: 0, ...parsed.scores, overall },
    rationales: parsed.rationales,
    model: MODEL,
    inputHash: createHash("sha256").update(JSON.stringify({ rubricVersion: 1, model: MODEL, platform: record.platform, text: record.text })).digest("hex"),
    gradedAt: new Date().toISOString(),
  }
}

async function upsert(record, index) {
  const rowId = `r${createHash("sha256").update(`${TABLE}:${record.id}`).digest("hex").slice(0, 35)}`
  await tables.upsertRow(DB, TABLE, rowId, {
    rid: record.id,
    name: record.author,
    status: "graded",
    created_raw: record.createdAt,
    ord: index,
    data: JSON.stringify(record),
  })
}
