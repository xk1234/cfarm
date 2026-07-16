/**
 * Grade a generated automation video against the organic-reel rubric.
 * See docs/video-automation-quality-plan.md (Phase 3).
 *
 * The video is graded from a 12-frame chronological contact sheet plus the
 * export record's copy. Judge: google/gemini-3-flash-preview via OpenRouter —
 * a different model family from the generator (claude-sonnet-5) on purpose.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node scripts/grade-video.mjs <videoUrl | export-id | local-file> [--json out.json]
 *   node scripts/grade-video.mjs --calibrate <local-file> [--json out.json]
 *     (--calibrate: grade a reference reel with no export record)
 */
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { Client, Query, Storage, TablesDB } from "node-appwrite"

const execFileAsync = promisify(execFile)

export const VIDEO_RUBRIC_VERSION = 1
export const JUDGE_MODEL = process.env.VIDEO_BENCHMARK_JUDGE_MODEL || "google/gemini-3-flash-preview"

export const VIDEO_RUBRIC_PROMPT = `You are a blind judge of short-form vertical videos (TikTok/IG Reels) for organic growth accounts. You are given a chronological 12-frame contact sheet from one video (read frames left-to-right, top-to-bottom), plus the post's title, caption, and hashtags. First transcribe every distinct on-screen text overlay you can read, in order. Then score four dimensions as integers 0-10:

1. hookStopPower — do the FIRST overlay + first clip stop the scroll?
   10 = arresting and specific, an identity grab or open loop you cannot skip. 8 = strong specific hook. 5 = readable but skippable. 3 = generic topic label ("astrology facts"). 0 = no hook text visible.
2. storyArcCoherence — do the overlays in sequence tell ONE believable story with a payoff, or land ONE clear claim?
   10 = every caption advances a single arc (discovery -> action -> result -> CTA) or one razor-sharp claim. 8 = clear arc with a weak beat. 5 = related but interchangeable captions. 3 = disconnected fragments. 0 = contradictory or unreadable.
3. nativeAuthenticity — does it read/look like a real person's reel?
   10 = casual specific voice, overlay style and clip mood match, zero ad-smell. 8 = native with minor polish issues. 5 = slightly templated or clip/text mismatch. 3 = corporate phrasing, obvious template, hashtags inside overlays. 0 = looks like a spam ad.
4. ctaEngagementPull — does it end with a comment-gate or genuine curiosity gap that would drive comments, re-pitched in the caption?
   10 = single memorable trigger word, obvious value exchange, caption re-pitches it. 8 = clear CTA, minor friction. 5 = soft/vague CTA ("what do you think?"). 3 = "follow for more" or nothing actionable. 0 = no ending at all.

Judge only what is visible/supplied. Do not reward length. Penalize invented-sounding numeric proof (revenue, percentages, follower counts) under nativeAuthenticity. Return strict JSON only.`

const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "video_grade",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["overlayTranscript", "dimensions", "notes"],
      properties: {
        overlayTranscript: {
          type: "array",
          items: { type: "string" },
          description: "Every distinct on-screen overlay text, in chronological order",
        },
        dimensions: {
          type: "object",
          additionalProperties: false,
          required: ["hookStopPower", "storyArcCoherence", "nativeAuthenticity", "ctaEngagementPull"],
          properties: Object.fromEntries(
            ["hookStopPower", "storyArcCoherence", "nativeAuthenticity", "ctaEngagementPull"].map((k) => [
              k,
              {
                type: "object",
                additionalProperties: false,
                required: ["score", "reason"],
                properties: {
                  score: { type: "integer", minimum: 0, maximum: 10 },
                  reason: { type: "string" },
                },
              },
            ])
          ),
        },
        notes: { type: "string", description: "One-paragraph overall verdict with the single biggest improvement" },
      },
    },
  },
}

// ---------- deterministic hard-fail checks ----------

export function hardFailChecks({ durationSeconds, overlays, caption, template }) {
  const failures = []
  if (durationSeconds != null && (durationSeconds < 7 || durationSeconds > 45)) {
    failures.push(`duration ${durationSeconds.toFixed(1)}s outside 7-45s`)
  }
  for (const overlay of overlays) {
    const words = overlay.trim().split(/\s+/).filter(Boolean)
    if (words.length > 20) failures.push(`overlay >20 words: "${overlay.slice(0, 60)}…"`)
    if (/#\w/.test(overlay)) failures.push(`hashtag inside overlay: "${overlay.slice(0, 60)}"`)
  }
  const commentGateTemplates = new Set(["story_over_broll", "faceless_reel"])
  if (commentGateTemplates.has(template)) {
    const trigger = /comment\s+["'“”]?([A-Za-z]{2,20})["'“”]?/i
    const inOverlay = overlays.some((o) => trigger.test(o))
    const inCaption = trigger.test(caption || "")
    if (!inOverlay || !inCaption) {
      failures.push(`comment-gate template missing trigger word (overlay: ${inOverlay}, caption: ${inCaption})`)
    }
  }
  // numeric proof smell: $ amounts, follower counts, percentages presented as results
  const proofSmell = /\$\s?\d[\d,.]*k?|(\d[\d,.]*k?\s*(followers|per day|a day|in \d+ days))|\d{2,}%/i
  for (const text of [...overlays, caption || ""]) {
    if (proofSmell.test(text)) failures.push(`numeric proof claim needs config-backed source: "${text.slice(0, 60)}"`)
  }
  return failures
}

// ---------- media handling ----------

async function fetchVideoBytes(input, ctx) {
  if (existsSync(input)) return { bytes: await readFile(input), record: null }
  // export id or app videoUrl -> Appwrite
  let record = null
  if (!input.startsWith("/api/")) {
    record = await findExport(ctx, (r) => r.id === input)
    if (!record) throw new Error(`No export record with id ${input}`)
    input = record.videoUrl
  } else {
    record = await findExport(ctx, (r) => r.videoUrl === input)
  }
  const relPath = decodeURIComponent(input.replace(/^\/api\/local-assets\//, "").split(/[?#]/)[0])
  const bucket = relPath.split("/")[0] === "assets" ? "assets" : "misc"
  const fileId = createHash("sha256").update(relPath).digest("hex").slice(0, 36)
  const view = await ctx.storage.getFileView(bucket, fileId)
  return { bytes: Buffer.from(view), record }
}

async function findExport(ctx, predicate) {
  let cursor = null
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const res = await ctx.tables.listRows(ctx.db, "generated_video_exports", queries)
    for (const row of res.rows) {
      const rec = JSON.parse(row.data)
      if (predicate(rec)) return rec
    }
    if (res.rows.length < 100) return null
    cursor = String(res.rows[res.rows.length - 1].$id)
  }
}

async function contactSheet(videoPath, tmpDir) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", videoPath,
  ])
  const duration = Number.parseFloat(stdout.trim())
  const sheetPath = path.join(tmpDir, "sheet.jpg")
  // 12 evenly spaced frames, 4x3 grid, each frame 270x480
  const fps = 12 / Math.max(duration, 1)
  await execFileAsync("ffmpeg", [
    "-y", "-i", videoPath,
    "-vf", `fps=${fps.toFixed(4)},scale=270:480,tile=4x3`,
    "-frames:v", "1", "-q:v", "4", sheetPath,
  ])
  const sheet = await readFile(sheetPath)
  return { duration, sheetDataUrl: `data:image/jpeg;base64,${sheet.toString("base64")}` }
}

// ---------- judge ----------

async function judge({ sheetDataUrl, record, duration }) {
  const meta = record
    ? `Title: ${record.title || "(none)"}\nCaption: ${record.caption || record.description || "(none)"}\nHashtags: ${(record.hashtags || []).join(" ") || "(none)"}\nTemplate: ${record.sourceConfig?.template || "unknown"}\nConfigured hook: ${record.sourceConfig?.hook || "(none)"}`
    : "No post copy available (reference calibration video) — score ctaEngagementPull from on-screen text alone."
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      temperature: 0,
      response_format: RESPONSE_FORMAT,
      messages: [
        { role: "system", content: VIDEO_RUBRIC_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: `Video duration: ${duration.toFixed(1)}s\n${meta}` },
            { type: "image_url", image_url: { url: sheetDataUrl } },
          ],
        },
      ],
    }),
  })
  if (!response.ok) throw new Error(`Judge call failed: ${response.status} ${await response.text()}`)
  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  return JSON.parse(content)
}

// ---------- main ----------

export async function gradeVideo(input, { calibrate = false } = {}) {
  const ctx = appwriteCtx()
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "grade-video-"))
  try {
    const { bytes, record } = calibrate
      ? { bytes: await readFile(input), record: null }
      : await fetchVideoBytes(input, ctx)
    const videoPath = path.join(tmpDir, "video" + (input.endsWith(".mov") ? ".mov" : ".webm"))
    await writeFile(videoPath, bytes)
    const { duration, sheetDataUrl } = await contactSheet(videoPath, tmpDir)
    const grade = await judge({ sheetDataUrl, record, duration })
    const overlays = grade.overlayTranscript || []
    const hardFails = calibrate
      ? []
      : hardFailChecks({
          durationSeconds: duration,
          overlays,
          caption: record?.caption || record?.description || "",
          template: record?.sourceConfig?.template,
        })
    const scores = Object.fromEntries(
      Object.entries(grade.dimensions).map(([k, v]) => [k, v.score])
    )
    const overall = Number(
      (Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length).toFixed(1)
    )
    return {
      rubricVersion: VIDEO_RUBRIC_VERSION,
      judgeModel: JUDGE_MODEL,
      input,
      exportId: record?.id ?? null,
      template: record?.sourceConfig?.template ?? null,
      title: record?.title ?? null,
      durationSeconds: Number(duration.toFixed(1)),
      overlayTranscript: overlays,
      scores,
      overall,
      hardFails,
      reasons: Object.fromEntries(Object.entries(grade.dimensions).map(([k, v]) => [k, v.reason])),
      notes: grade.notes,
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

function appwriteCtx() {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
  return {
    storage: new Storage(client),
    tables: new TablesDB(client),
    db: process.env.APPWRITE_DATABASE_ID,
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))
if (isMain) {
  const args = process.argv.slice(2)
  const calibrate = args.includes("--calibrate")
  const jsonIdx = args.indexOf("--json")
  const outFile = jsonIdx >= 0 ? args[jsonIdx + 1] : null
  const input = args.filter((a) => !a.startsWith("--") && a !== outFile)[0]
  if (!input) {
    console.error("usage: node scripts/grade-video.mjs <videoUrl|export-id|file> [--calibrate] [--json out.json]")
    process.exit(1)
  }
  const result = await gradeVideo(input, { calibrate })
  if (outFile) await writeFile(outFile, JSON.stringify(result, null, 2) + "\n")
  console.log(JSON.stringify(result, null, 2))
}
