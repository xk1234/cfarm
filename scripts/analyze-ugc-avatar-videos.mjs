/**
 * Analyze the local ReelFarm UGC avatar clips, upload them to Appwrite, and
 * publish action-based video collections for the selected LumenClip user.
 *
 * The clips are short, so the vision model receives a five-frame temporal
 * contact sheet rather than a single thumbnail. Analysis is checkpointed and
 * resumable; successful records are not billed twice on a rerun.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node scripts/analyze-ugc-avatar-videos.mjs
 */
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { Client, Query, Storage, TablesDB, Users } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

const execFileAsync = promisify(execFile)
const ROOT = process.cwd()
const VIDEO_DIR = path.join(ROOT, "data", "ugc_avatar_videos")
const SOURCE_FILE = process.env.UGC_VIDEO_SOURCE_FILE || "/tmp/reelfarm-ugc-avatar-videos.json"
const ANALYSIS_FILE = path.join(ROOT, "data", "ugc-avatar-video-analysis.json")
const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const TABLE = "image_collections"
const BUCKET = "ugc_videos"
const MODEL = process.env.UGC_VIDEO_ANALYSIS_MODEL || "google/gemini-2.5-flash"
const TARGET_EMAIL = process.env.UGC_COLLECTION_OWNER_EMAIL || "yexinkang1234@gmail.com"
const ANALYSIS_CONCURRENCY = positiveIntegerArg("--concurrency", 5)
const UPLOAD_CONCURRENCY = positiveIntegerArg("--upload-concurrency", 3)
const ANALYZE_ONLY = process.argv.includes("--analyze-only")
const PUBLISH_ONLY = process.argv.includes("--publish-only")
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let checkpointSequence = 0

const CATEGORIES = {
  speaking_explaining: "Talking & Explaining",
  pointing_cta: "Pointing & Calls to Action",
  surprise_shock: "Surprise & Shock",
  positive_celebration: "Positive & Celebratory",
  skeptical_concerned: "Skeptical & Concerned",
  lifestyle_pose: "Lifestyle & Posing",
  movement_reveal: "Scene Reveals & Movement",
  character_costume: "Characters & Costumes",
  other_reaction: "Other Reactions",
}

validateEnvironment()

const videoFiles = (await readdir(VIDEO_DIR))
  .filter((fileName) => /\.(mp4|mov|webm)$/i.test(fileName))
  .sort()
if (videoFiles.length === 0) throw new Error(`No videos found in ${VIDEO_DIR}`)

const sourceRows = await readJson(SOURCE_FILE, [])
const sourceByFile = new Map(
  (Array.isArray(sourceRows) ? sourceRows : []).map((row) => [row.videoFileName, row])
)
const checkpoint = await readJson(ANALYSIS_FILE, null)
const manifest = {
  version: 1,
  model: MODEL,
  createdAt: checkpoint?.createdAt || new Date().toISOString(),
  updatedAt: checkpoint?.updatedAt || new Date().toISOString(),
  taxonomy: CATEGORIES,
  videos: checkpoint?.videos && typeof checkpoint.videos === "object" ? checkpoint.videos : {},
}

if (!PUBLISH_ONLY) {
  await analyzeVideos()
}

const failed = videoFiles.filter((fileName) => manifest.videos[fileName]?.status !== "complete")
if (failed.length > 0) {
  throw new Error(`${failed.length} videos are still missing successful analysis; rerun to retry them.`)
}

if (!ANALYZE_ONLY) {
  const client = appwriteClient()
  const storage = new Storage(client)
  const tables = new TablesDB(client)
  const users = new Users(client)
  const ownerId = await userIdForEmail(users, TARGET_EMAIL)
  await uploadVideos(storage)
  await publishCollections(tables, ownerId)
}

const populatedCategoryCount = new Set(
  videoFiles.map((fileName) => manifest.videos[fileName]?.primaryCategory).filter(Boolean)
).size
console.log(`DONE: ${videoFiles.length} videos analyzed across ${populatedCategoryCount} populated categories.`)

async function analyzeVideos() {
  const pending = videoFiles.filter((fileName) => manifest.videos[fileName]?.status !== "complete")
  console.log(`analysis: ${videoFiles.length - pending.length} cached, ${pending.length} pending; model=${MODEL}`)
  if (pending.length === 0) return

  const workDir = await mkdir(path.join(os.tmpdir(), "lumenclip-ugc-analysis"), { recursive: true }).then(
    () => path.join(os.tmpdir(), "lumenclip-ugc-analysis")
  )
  let next = 0
  let completed = videoFiles.length - pending.length
  let failures = 0

  async function worker() {
    while (next < pending.length) {
      const fileName = pending[next++]
      const source = sourceByFile.get(fileName) || {}
      const sheetPath = path.join(workDir, `${path.parse(fileName).name}.jpg`)
      try {
        await createContactSheet(path.join(VIDEO_DIR, fileName), sheetPath)
        const analysis = await analyzeContactSheet(sheetPath)
        manifest.videos[fileName] = {
          status: "complete",
          fileName,
          imageLink: `/api/local-assets/ugc_avatar_videos/${encodeURIComponent(fileName)}`,
          sourcePage: source.page || null,
          sourceIndex: Number.isInteger(source.index) ? source.index : null,
          sourceAccountId: source.sourceAccountId || null,
          sourceVideoUrl: source.videoUrl || null,
          analyzedAt: new Date().toISOString(),
          ...analysis,
        }
        completed += 1
        console.log(`[analysis ${completed}/${videoFiles.length}] ${fileName} -> ${CATEGORIES[analysis.primaryCategory]}`)
      } catch (error) {
        failures += 1
        manifest.videos[fileName] = {
          status: "failed",
          fileName,
          error: error instanceof Error ? error.message : String(error),
          analyzedAt: new Date().toISOString(),
        }
        console.error(`[analysis failed] ${fileName}: ${manifest.videos[fileName].error}`)
      } finally {
        await rm(sheetPath, { force: true }).catch(() => undefined)
        await saveManifest()
        await sleep(120)
      }
    }
  }

  await Promise.all(Array.from({ length: ANALYSIS_CONCURRENCY }, worker))
  await rm(workDir, { recursive: true, force: true }).catch(() => undefined)
  console.log(`analysis complete: ok=${completed} failed=${failures}`)
}

async function createContactSheet(videoPath, outputPath) {
  await execFileAsync(
    "ffmpeg",
    [
      "-loglevel",
      "error",
      "-y",
      "-i",
      videoPath,
      "-vf",
      "fps=1,scale=180:-2,tile=5x1:padding=6:margin=6:color=white",
      "-frames:v",
      "1",
      "-q:v",
      "4",
      outputPath,
    ],
    { timeout: 45_000, maxBuffer: 1024 * 1024 }
  )
}

async function analyzeContactSheet(sheetPath) {
  const image = await readFile(sheetPath)
  const dataUrl = `data:image/jpeg;base64,${image.toString("base64")}`
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "LumenClip UGC Video Analyzer",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "You analyze short UGC avatar videos for a reusable creative library. The supplied image is a chronological five-frame contact sheet from one 5-second clip. Describe only visible facts and motion across the sequence. Do not identify the person, guess ethnicity, or infer sensitive traits. Choose the single most useful action category for an editor. Return strict JSON only.",
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Write a concise factual caption under 24 words that states the creator's main action, setting, framing, and usable mood. Classify the clip into exactly one primary category. Categories:\n${Object.entries(CATEGORIES)
                    .map(([key, label]) => `- ${key}: ${label}`)
                    .join("\n")}\nAlso return short reusable visual tags.`,
                },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: analysisResponseFormat(),
        }),
        signal: AbortSignal.timeout(90_000),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter ${response.status}`)
      const raw = payload.choices?.[0]?.message?.content
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
      if (!parsed || !CATEGORIES[parsed.primaryCategory]) {
        throw new Error("Vision model returned an invalid category")
      }
      const caption = String(parsed.caption || "").replace(/\s+/g, " ").trim()
      if (!caption || caption.split(/\s+/).length > 24) {
        throw new Error("Vision model returned a caption longer than 24 words")
      }
      return {
        caption,
        primaryCategory: parsed.primaryCategory,
        action: String(parsed.action || "").trim(),
        setting: String(parsed.setting || "").trim(),
        framing: parsed.framing,
        energy: parsed.energy,
        tags: Array.isArray(parsed.tags)
          ? [...new Set(parsed.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 8)
          : [],
      }
    } catch (error) {
      lastError = error
      if (attempt < 4) await sleep(attempt * 1_500)
    }
  }
  throw lastError
}

function analysisResponseFormat() {
  return {
    type: "json_schema",
    json_schema: {
      name: "ugc_video_analysis",
      strict: true,
      schema: {
        type: "object",
        properties: {
          caption: { type: "string" },
          primaryCategory: { type: "string", enum: Object.keys(CATEGORIES) },
          action: { type: "string" },
          setting: { type: "string" },
          framing: {
            type: "string",
            enum: ["close-up", "medium", "full-body", "scenic", "mixed"],
          },
          energy: {
            type: "string",
            enum: ["calm", "conversational", "playful", "dramatic", "high-energy"],
          },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["caption", "primaryCategory", "action", "setting", "framing", "energy", "tags"],
        additionalProperties: false,
      },
    },
  }
}

async function uploadVideos(storage) {
  const existing = await existingFileIds(storage)
  const missing = videoFiles.filter((fileName) => !existing.has(storageFileId(fileName)))
  console.log(`storage: ${existing.size} existing, ${missing.length} uploads pending`)
  let next = 0
  let done = 0
  let failed = 0

  async function worker() {
    while (next < missing.length) {
      const fileName = missing[next++]
      const filePath = path.join(VIDEO_DIR, fileName)
      try {
        const bytes = await readFile(filePath)
        await retry(async () => {
          try {
            await storage.createFile(
              BUCKET,
              storageFileId(fileName),
              InputFile.fromBuffer(bytes, fileName),
              []
            )
          } catch (error) {
            if (error?.code !== 409) throw error
          }
        }, 4)
        done += 1
        console.log(`[upload ${done}/${missing.length}] ${fileName}`)
      } catch (error) {
        failed += 1
        console.error(`[upload failed] ${fileName}: ${error?.message || error}`)
      }
      await sleep(120)
    }
  }

  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker))
  if (failed > 0) throw new Error(`${failed} video uploads failed; rerun to retry.`)
}

async function existingFileIds(storage) {
  const ids = new Set()
  let cursor = null
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await storage.listFiles(BUCKET, queries)
    for (const file of response.files) ids.add(file.$id)
    if (response.files.length < 100) break
    cursor = response.files.at(-1).$id
  }
  return ids
}

async function publishCollections(tables, ownerId) {
  const existingRows = await existingCollectionRows(tables, ownerId)
  const existingByRid = new Map(existingRows.map((row) => [row.rid, row]))
  const maxOrd = existingRows.reduce((max, row) => Math.max(max, Number(row.ord) || 0), 0)
  const grouped = Object.fromEntries(Object.keys(CATEGORIES).map((category) => [category, []]))

  for (const fileName of videoFiles) {
    const record = manifest.videos[fileName]
    grouped[record.primaryCategory].push({
      image_link: record.imageLink,
      caption: record.caption,
    })
  }

  let published = 0
  for (const [index, [category, label]] of Object.entries(CATEGORIES).entries()) {
    const rid = `ugc-avatar-${category}`
    const images = grouped[category]
    if (images.length === 0) continue
    const existing = existingByRid.get(rid)
    const collection = {
      ownerId,
      name: `UGC Avatars — ${label}`,
      created_at: existing?.created_raw || manifest.createdAt,
      pinned: false,
      mediaType: "video",
      images,
    }
    await retry(
      () =>
        tables.upsertRow(DB, TABLE, ownedRowId(ownerId, rid), {
          rid,
          name: collection.name,
          status: "ready",
          created_raw: collection.created_at,
          ord: Number(existing?.ord) || maxOrd + index + 1,
          owner_id: ownerId,
          data: JSON.stringify(collection),
        }),
      5
    )
    published += 1
    console.log(`[collection ${published}] ${collection.name}: ${images.length} videos`)
  }
}

async function existingCollectionRows(tables, ownerId) {
  const rows = []
  let cursor = null
  for (;;) {
    const queries = [Query.equal("owner_id", [ownerId]), Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await tables.listRows(DB, TABLE, queries)
    rows.push(...response.rows)
    if (response.rows.length < 100) break
    cursor = response.rows.at(-1).$id
  }
  return rows
}

async function userIdForEmail(users, email) {
  const response = await users.list([Query.equal("email", [email]), Query.limit(2)])
  if (response.users.length !== 1) {
    throw new Error(`Expected exactly one Appwrite user for ${email}; found ${response.users.length}`)
  }
  return response.users[0].$id
}

function appwriteClient() {
  return new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
}

function storageFileId(fileName) {
  return createHash("sha256")
    .update(`ugc_avatar_videos/${fileName}`)
    .digest("hex")
    .slice(0, 36)
}

function ownedRowId(ownerId, rid) {
  return `u${createHash("sha256")
    .update(`${TABLE}:${ownerId}:${rid}`)
    .digest("hex")
    .slice(0, 35)}`
}

async function saveManifest() {
  manifest.updatedAt = new Date().toISOString()
  const temporary = `${ANALYSIS_FILE}.tmp-${process.pid}-${checkpointSequence++}`
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`)
  await rename(temporary, ANALYSIS_FILE)
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch {
    return fallback
  }
}

async function retry(task, attempts) {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(attempt * 750)
    }
  }
  throw lastError
}

function positiveIntegerArg(name, fallback) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function validateEnvironment() {
  const missing = [
    "OPENROUTER_API_KEY",
    "APPWRITE_ENDPOINT",
    "APPWRITE_PROJECT_ID",
    "APPWRITE_API_KEY",
  ].filter((key) => !process.env[key])
  if (missing.length > 0) throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
}
