/**
 * Eval loop driver: render N videos from a named automation, grade each with
 * scripts/grade-video.mjs, append results to tmp/video-eval-runs.jsonl, and
 * print a scoreboard. See docs/video-automation-quality-plan.md (Phase 4).
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node scripts/eval-video-automation.mjs --automation "Astro Aesthetic" --count 5 [--label "iter-3"]
 *   node scripts/eval-video-automation.mjs --grade-existing <exportId,...> [--label baseline]
 *
 * Requires the dev server at localhost:3000. Renders are sequential and
 * real-time (a 25s video records for ~25s) — budget ~1-2 min per video.
 */
import { appendFile, mkdir } from "node:fs/promises"
import path from "node:path"

import { chromium } from "@playwright/test"
import { Client, Users } from "node-appwrite"

import { gradeVideo } from "./grade-video.mjs"

const USER_ID = process.env.LUMENCLIP_SYSTEM_OWNER_ID || "6a5206ff00287e1fe617"
const APP = "http://localhost:3000"
const RUNS_FILE = path.join(process.cwd(), "tmp", "video-eval-runs.jsonl")

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}

const automationName = arg("--automation")
const count = Number.parseInt(arg("--count", "5"), 10)
const label = arg("--label", new Date().toISOString().slice(0, 16))
const gradeExisting = arg("--grade-existing")

async function listExports(cookie) {
  const res = await fetch(`${APP}/api/generated-videos?type=template_video`, {
    headers: { cookie },
  })
  if (!res.ok) throw new Error(`list exports failed: ${res.status}`)
  const body = await res.json()
  return body.exports ?? body.records ?? body
}

async function mintCookie() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
  const session = await new Users(client).createSession(USER_ID)
  return { header: `lumenclip-session=${session.secret}`, secret: session.secret }
}

async function renderOne(page, name) {
  try {
    await page.goto(`${APP}/app`, { waitUntil: "networkidle" })
    await page.getByRole("button", { name: "Automations" }).click()
    await page.waitForTimeout(1500)
    const editButton = page
      .locator(`text=${name}`)
      .locator("xpath=ancestor::*[.//button[contains(., 'Edit')]][1]")
      .locator("button", { hasText: "Edit" })
      .first()
    await editButton.click()
    await page.waitForTimeout(1200)
    // The drawer sidebar has a single "Generate" button (hidden on the format tab).
    const generateButton = page.getByRole("button", { name: /^Generate( another)?$/ })
    await generateButton.waitFor({ timeout: 20000 })
    await generateButton.click()
  } catch (error) {
    const shot = path.join(process.cwd(), "tmp", "eval-driver-failure.png")
    await page.screenshot({ path: shot, fullPage: true }).catch(() => {})
    throw new Error(`${error.message} (screenshot: ${shot})`)
  }
}

async function waitForNewExport(cookie, knownIds, timeoutMs = 360_000) {
  const start = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000))
    const exports = await listExports(cookie)
    const fresh = exports.filter((e) => !knownIds.has(e.id))
    const ready = fresh.find((e) => e.status === "ready" && e.videoUrl)
    if (ready) return ready
    const failed = fresh.find((e) => e.status === "failed")
    if (failed) throw new Error(`render failed: ${failed.id} ${failed.error ?? ""}`)
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for render")
  }
}

function median(values) {
  const s = [...values].sort((a, b) => a - b)
  return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0
}

function nearDuplicateHooks(grades) {
  const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim()
  const hooks = grades.map((g) => norm(g.overlayTranscript?.[0]))
  const dupes = []
  for (let i = 0; i < hooks.length; i++)
    for (let j = i + 1; j < hooks.length; j++) {
      if (!hooks[i] || !hooks[j]) continue
      const a = new Set(hooks[i].split(" "))
      const b = new Set(hooks[j].split(" "))
      const overlap = [...a].filter((w) => b.has(w)).length / Math.max(a.size, b.size)
      if (overlap > 0.7) dupes.push([grades[i].exportId, grades[j].exportId])
    }
  return dupes
}

function scoreboard(grades, runLabel) {
  const dims = ["hookStopPower", "storyArcCoherence", "nativeAuthenticity", "ctaEngagementPull"]
  console.log(`\n===== SCOREBOARD [${runLabel}] (${grades.length} videos) =====`)
  for (const dim of dims) {
    console.log(`${dim.padEnd(20)} median ${median(grades.map((g) => g.scores[dim])).toFixed(1)}`)
  }
  const overallMedian = median(grades.map((g) => g.overall))
  console.log(`${"OVERALL".padEnd(20)} median ${overallMedian.toFixed(1)}`)
  const fails = grades.flatMap((g) => g.hardFails.map((f) => `${g.exportId?.slice(0, 8)}: ${f}`))
  console.log(`hard-fails: ${fails.length ? "\n  " + fails.join("\n  ") : "none"}`)
  const dupes = nearDuplicateHooks(grades)
  console.log(`near-duplicate hooks: ${dupes.length ? JSON.stringify(dupes) : "none"}`)
  console.log("\nper-video:")
  for (const g of grades) {
    console.log(
      `  ${String(g.overall).padStart(4)}  [${g.template}] ${(g.overlayTranscript?.[0] || g.title || "").slice(0, 70)}` +
        (g.hardFails.length ? `  ⚠ ${g.hardFails.length} hard-fail(s)` : "")
    )
  }
  const gate =
    overallMedian >= 7.5 &&
    dims.every((d) => median(grades.map((g) => g.scores[d])) >= 6.5) &&
    fails.length === 0 &&
    dupes.length === 0
  console.log(`\nGATE (this batch): ${gate ? "PASS ✅" : "not yet ❌"}  (full gate needs ≥8 videos across ≥2 runs)`)
}

async function persist(grades, runLabel) {
  await mkdir(path.dirname(RUNS_FILE), { recursive: true })
  for (const g of grades) {
    await appendFile(RUNS_FILE, JSON.stringify({ run: runLabel, at: new Date().toISOString(), ...g }) + "\n")
  }
  console.log(`appended ${grades.length} grades to ${RUNS_FILE}`)
}

// ---------- main ----------

if (gradeExisting) {
  const ids = gradeExisting.split(",").map((s) => s.trim()).filter(Boolean)
  const grades = []
  for (const id of ids) {
    console.log(`grading ${id}…`)
    try {
      grades.push(await gradeVideo(id))
    } catch (error) {
      console.error(`grade failed for ${id}: ${error.message}`)
    }
  }
  await persist(grades, label)
  scoreboard(grades, label)
  process.exit(0)
}

if (!automationName) {
  console.error("usage: --automation <name> --count N  |  --grade-existing id,id,…")
  process.exit(1)
}

const cookie = await mintCookie()
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--autoplay-policy=no-user-gesture-required"],
})
const context = await browser.newContext({ viewport: { width: 1500, height: 950 } })
await context.addCookies([
  { name: "lumenclip-session", value: cookie.secret, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
])
const page = await context.newPage()

const grades = []
try {
  for (let i = 0; i < count; i++) {
    const known = new Set((await listExports(cookie.header)).map((e) => e.id))
    console.log(`\n[${i + 1}/${count}] rendering "${automationName}"…`)
    await renderOne(page, automationName)
    const exp = await waitForNewExport(cookie.header, known)
    console.log(`  ready: ${exp.id} → grading…`)
    const grade = await gradeVideo(exp.id)
    console.log(`  overall ${grade.overall} ${JSON.stringify(grade.scores)}`)
    grades.push(grade)
  }
} finally {
  await browser.close()
}

await persist(grades, label)
scoreboard(grades, label)
