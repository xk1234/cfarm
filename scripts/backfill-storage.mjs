/**
 * One-time, resumable backfill: upload every existing media file under `data/`
 * into its Appwrite Storage bucket, so the disk-serve fallback can be removed.
 *
 * Resumable: files already present in Storage (409) are skipped, so re-running
 * only uploads what's missing. Record-store JSONs and junk are skipped.
 *
 * Run:  set -a; . ./.env; set +a; node scripts/backfill-storage.mjs [--dry]
 */
import { createHash } from "node:crypto"
import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

import { Client, Storage, Query } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

const DATA_ROOT = path.join(process.cwd(), "data")

const MEDIA_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg",
  ".mp4", ".mov", ".webm", ".mp3", ".wav", ".txt",
])

// Record-store JSON files live in TablesDB, not Storage — never upload them.
const SKIP_STORES = new Set([
  "image-collections.json", "characters.json", "characters/images.json",
  "assets/assets.json", "automations/automations.json", "automations/runs.json",
  "automation-templates/templates.json", "automation-templates/example-runs.json",
  "results/results.json", "slideshows/slideshows.json", "usage-ledger.json",
  "word-collections/word-collections.json", "postfast-posts.json",
  "swipes/swipes.json", "generated-videos/exports.json",
])

function bucketForPath(rel) {
  switch (rel.split("/")[0]) {
    case "music": return "music"
    case "image-collections": return "image_collections"
    case "greenscreen_memes": return "greenscreen"
    case "characters": return "characters"
    case "slideshows": return "slideshows"
    case "ugc_avatar_videos": return "ugc_videos"
    case "backgrounds": return "backgrounds"
    case "assets": return "assets"
    default: return "misc"
  }
}

function fileIdForPath(rel) {
  return createHash("sha256").update(rel).digest("hex").slice(0, 36)
}

function isMedia(rel) {
  if (SKIP_STORES.has(rel)) return false
  if (rel.endsWith(".bak") || rel.endsWith(".tmp")) return false
  if (path.basename(rel).startsWith(".")) return false
  return MEDIA_EXT.has(path.extname(rel).toLowerCase())
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(abs)
    else if (entry.isFile()) yield abs
  }
}

async function main() {
  const dry = process.argv.includes("--dry")
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
  const storage = new Storage(client)

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

  const files = []
  for await (const abs of walk(DATA_ROOT)) {
    const rel = path.relative(DATA_ROOT, abs).split(path.sep).join("/")
    if (isMedia(rel)) files.push({ abs, rel, bucket: bucketForPath(rel), fileId: fileIdForPath(rel) })
  }
  console.log(`found ${files.length} media files`)
  if (dry) {
    const byBucket = {}
    for (const f of files) byBucket[f.bucket] = (byBucket[f.bucket] || 0) + 1
    console.log("by bucket:", JSON.stringify(byBucket))
    return
  }

  // 1) List existing file ids per bucket (cheap, paginated) so we only upload gaps.
  const buckets = [...new Set(files.map((f) => f.bucket))]
  const existing = new Set()
  for (const bucket of buckets) {
    let cursor = null, page = 0
    for (;;) {
      const q = [Query.limit(100)]
      if (cursor) q.push(Query.cursorAfter(cursor))
      let res
      try { res = await storage.listFiles(bucket, q) }
      catch (e) { console.error(`listFiles ${bucket}: ${e?.code || ""} ${e?.message}`); break }
      for (const f of res.files) existing.add(`${bucket}/${f.$id}`)
      page += res.files.length
      if (res.files.length < 100) break
      cursor = res.files[res.files.length - 1].$id
      await sleep(80)
    }
    console.log(`bucket ${bucket}: ${page} existing files`)
  }

  const missing = files.filter((f) => !existing.has(`${f.bucket}/${f.fileId}`))
  console.log(`missing (need upload): ${missing.length} of ${files.length}`)

  let uploaded = 0, failed = 0, done = 0
  const CONCURRENCY = 3
  const REQ_TIMEOUT_MS = 45_000
  const withTimeout = (p, ms) =>
    Promise.race([p, sleep(ms).then(() => { throw new Error("timeout") })])

  let idx = 0
  async function uploadOne({ abs, rel, bucket, fileId }) {
    const buf = await readFile(abs)
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await withTimeout(
          storage.createFile(bucket, fileId, InputFile.fromBuffer(buf, path.basename(rel)), []),
          REQ_TIMEOUT_MS
        )
        return "uploaded"
      } catch (e) {
        if (e?.code === 409) return "uploaded" // already there (race) — fine
        if (attempt === 4) { console.error(`FAIL ${rel}: ${e?.code || ""} ${e?.message || e}`); return "failed" }
        await sleep(1000 * attempt) // backoff on throttle/timeout
      }
    }
    return "failed"
  }
  async function worker() {
    while (idx < missing.length) {
      const r = await uploadOne(missing[idx++])
      if (r === "uploaded") uploaded++
      else failed++
      done++
      if (done % 25 === 0) console.log(`upload ${done}/${missing.length} (ok=${uploaded} fail=${failed})`)
      await sleep(120) // gentle pacing to respect rate limits
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  console.log(`DONE uploaded=${uploaded} failed=${failed} missing=${missing.length} total=${files.length}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
