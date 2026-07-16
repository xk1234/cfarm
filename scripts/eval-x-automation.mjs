/**
 * Full astrology quality gate for X and Threads.
 * Requires a logged-in app session cookie because it exercises production APIs.
 *
 * BASE_URL=http://localhost:3000 \
 * LUMENCLIP_SESSION_COOKIE='cookie-name=value' \
 * node --env-file=.env scripts/eval-x-automation.mjs
 */
import { mkdir, writeFile } from "node:fs/promises"

const BASE = process.env.BASE_URL || "http://localhost:3000"
const COOKIE = process.env.LUMENCLIP_SESSION_COOKIE || ""
const GENERATIONS = Number(process.env.X_EVAL_GENERATIONS || 20)
if (!COOKIE) throw new Error("LUMENCLIP_SESSION_COOKIE is required")
if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required")

const reports = []
for (const platform of ["x", "threads"]) {
  const automation = await fixture(platform)
  const runs = []
  for (let index = 0; index < GENERATIONS; index += 1) {
    const { run } = await api("/api/x-automations/generate", {
      method: "POST",
      body: JSON.stringify({ automationId: automation.id }),
    })
    runs.push(run)
    console.log(`${platform} ${index + 1}/${GENERATIONS}: ${run.archetype}${run.needsReview ? " HARD FAIL" : ""}`)
  }
  const { corpus, generated } = await api("/api/x-benchmarks")
  const grades = generated.filter((grade) => runs.some((run) => run.id === grade.runId))
  const references = corpus.filter((item) => item.platform === platform && item.niche.toLowerCase().includes("astrolog") && item.grade)
  const hardFails = runs.filter((run) => run.needsReview)
  const overall = grades.map((item) => item.grade.scores.overall)
  const dimensions = platform === "x"
    ? ["hookStopPower", "valueDensity", "voiceFormatFit", "replyBait"]
    : ["hookLabelPower", "scannability", "identityPolarity", "replyBait"]
  const dimensionMedians = Object.fromEntries(dimensions.map((key) => [key, median(grades.map((item) => item.grade.scores[key]))]))
  const referenceMedian = median(references.map((item) => item.grade.scores.overall))
  const pairwise = await pairwiseTest(platform, grades, references)
  const report = {
    platform,
    generated: runs.length,
    graded: grades.length,
    hardFails: hardFails.map((run) => ({ id: run.id, archetype: run.archetype })),
    medianOverall: median(overall),
    dimensionMedians,
    referenceMedian,
    pairwise,
    gate: {
      medianOverall: median(overall) >= 7.5,
      dimensions: Object.values(dimensionMedians).every((score) => score >= 6.5),
      corpusParity: median(overall) >= referenceMedian - 0.5,
      zeroHardFails: hardFails.length === 0,
      pairwise: pairwise.generatedPreferenceRate >= 0.4,
    },
    runs: runs.map((run) => ({ id: run.id, archetype: run.archetype, text: run.posts.map((post) => post.text).join("\n\n---\n\n"), needsReview: run.needsReview })),
  }
  report.gate.passed = Object.values(report.gate).every(Boolean)
  reports.push(report)
}

await mkdir("tmp", { recursive: true })
const file = `tmp/x-automation-eval-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
await writeFile(file, JSON.stringify({ createdAt: new Date().toISOString(), reports }, null, 2))
console.log(JSON.stringify(reports.map(({ platform, medianOverall, referenceMedian, pairwise, gate }) => ({ platform, medianOverall, referenceMedian, pairwise: pairwise.generatedPreferenceRate, gate })), null, 2))
console.log(`report: ${file}`)
if (reports.some((report) => !report.gate.passed)) process.exitCode = 1

async function fixture(platform) {
  const listed = await api("/api/x-automations")
  let automation = listed.automations.find((item) => item.platform === platform && item.name === `Eval · Astrology · ${platform}`)
  if (!automation) {
    const created = await api("/api/x-automations", {
      method: "POST",
      body: JSON.stringify({ platform, name: `Eval · Astrology · ${platform}` }),
    })
    automation = created.automation
  }
  automation.niche.label = "astrology"
  automation.brief = {
    audience: "astrology followers who use signs to understand relationships and private emotional patterns",
    promise: "emotionally specific identity insights that make each sign feel seen",
    pillars: [
      { label: "dating and attachment by sign", weight: 30 },
      { label: "conflict and hidden feelings", weight: 20 },
      { label: "texting and communication", weight: 15 },
      { label: "sign comparisons", weight: 10 },
      { label: "zodiac hot takes", weight: 5 },
    ],
    keywords: ["astrology", "zodiac", "signs", "relationships"],
    painPoints: ["feeling misunderstood", "mixed signals", "relationship uncertainty"],
    derivedAt: new Date().toISOString(),
  }
  automation.status = "paused"
  automation.publishing.autoPost = false
  automation.media.mode = "none"
  const saved = await api("/api/x-automations", {
    method: "PATCH",
    body: JSON.stringify({ automation }),
  })
  return saved.automation
}

async function pairwiseTest(platform, generated, references) {
  const pairs = []
  const count = Math.min(20, generated.length, Math.max(0, references.length))
  for (let index = 0; index < count; index += 1) {
    const generatedText = generated[index % generated.length].text
    const reference = references[index % references.length]
    const referenceText = reference.text || reference.texts?.join("\n\n") || ""
    const swapped = index % 2 === 1
    const a = swapped ? referenceText : generatedText
    const b = swapped ? generatedText : referenceText
    const result = await pairwiseVerdict(platform, a, b)
    const generatedWon = result.winner === "tie" ? 0.5 : (swapped ? result.winner === "B" : result.winner === "A") ? 1 : 0
    pairs.push({ generatedWon, winner: result.winner })
  }
  return {
    pairs,
    generatedPreferenceRate: pairs.length ? pairs.reduce((sum, pair) => sum + pair.generatedWon, 0) / pairs.length : 0,
  }
}

async function pairwiseVerdict(platform, a, b) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `Blindly choose which ${platform === "threads" ? "Threads" : "X"} post an astrology follower would more likely engage with. Ignore claimed metrics. Return only A, B, or tie.` },
          { role: "user", content: `POST A\n${a}\n\nPOST B\n${b}` },
        ],
        response_format: { type: "json_schema", json_schema: { name: "pairwise", strict: true, schema: { type: "object", additionalProperties: false, required: ["winner"], properties: { winner: { type: "string", enum: ["A", "B", "tie"] } } } } },
      }),
      signal: AbortSignal.timeout(90_000),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload?.error?.message || `Pairwise judge ${response.status}`)
    const parsed = parseJsonObject(payload.choices?.[0]?.message?.content)
    if (["A", "B", "tie"].includes(parsed?.winner)) return parsed
  }
  throw new Error("Pairwise judge returned invalid JSON twice")
}

function parseJsonObject(raw) {
  if (raw && typeof raw === "object") return raw
  if (typeof raw !== "string") return null
  try {
    const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim())
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

async function api(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Cookie: COOKIE, "Content-Type": "application/json", ...init.headers },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || `${path} failed (${response.status})`)
  return payload
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
