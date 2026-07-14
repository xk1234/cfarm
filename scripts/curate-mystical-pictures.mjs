// Caption + theme-classify every image in the "Mystical Pictures" collection,
// then write back only the on-theme images (and delete pruned storage files).
// Dry-run by default; pass --apply to write.
import { createHash } from "node:crypto"
import { writeFile } from "node:fs/promises"

import { Client, Query, Storage, TablesDB } from "node-appwrite"

const APPLY = process.argv.includes("--apply")
const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const MODEL = "google/gemini-2.5-flash"
const COLLECTION_NAME = "mystical pictures"
const CONCURRENCY = 5
const OUT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "./mystical-verdicts.json"

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)
const tables = new TablesDB(client)
const storage = new Storage(client)

// find the collection row
let row = null
let cursor = null
for (;;) {
  const queries = [Query.limit(100)]
  if (cursor) queries.push(Query.cursorAfter(cursor))
  const res = await tables.listRows(DB, "image_collections", queries)
  for (const r of res.rows) {
    try {
      const rec = JSON.parse(r.data)
      if ((rec.name || "").trim().toLowerCase() === COLLECTION_NAME) row = { $id: r.$id, meta: r, rec }
    } catch {}
  }
  if (res.rows.length < 100) break
  cursor = res.rows.at(-1)?.$id
}
if (!row) throw new Error("Mystical Pictures collection not found")
const images = row.rec.images
console.log(`Collection has ${images.length} images. Mode: ${APPLY ? "APPLY" : "dry-run"}`)

const results = new Array(images.length)
let next = 0
async function worker() {
  for (;;) {
    const i = next++
    if (i >= images.length) return
    const img = images[i]
    try {
      const rel = decodeURIComponent(img.image_link.replace(/^\/api\/local-assets\//, ""))
      const fileId = createHash("sha256").update(rel).digest("hex").slice(0, 36)
      const view = await storage.getFileView("image_collections", fileId)
      const ext = rel.split(".").pop().toLowerCase()
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"
      const dataUrl = `data:${mime};base64,${Buffer.from(view).toString("base64")}`
      results[i] = { index: i, image_link: img.image_link, hash: img.hash, ...(await judge(dataUrl)) }
    } catch (error) {
      results[i] = { index: i, image_link: img.image_link, hash: img.hash, caption: img.caption || "", fit: true, reason: `judge failed, kept: ${error.message}` }
    }
    if ((i + 1) % 25 === 0) console.log(`judged ${i + 1}/${images.length}`)
  }
}

async function judge(dataUrl) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content:
                "You curate a BACKGROUND-image collection for ASTROLOGY TikTok slideshows. Slides overlay white text on these images, so they must read as atmospheric backgrounds, not subjects. FIT: dark, mystical, moody, people-free imagery — night skies, moons, stars, nebulae, clouds at dusk, tarot cards, candles, crystals, runes, altars, smoke, dark forests and fog, gothic or ancient architecture at night, celestial illustrations, dark oceans, abstract auras and light leaks. UNFIT: ANY visible person, face, eye, or body part (a hand is only acceptable if small, shadowy, and incidental), portraits of any kind, bright cheerful daytime lifestyle, food, product/fashion catalog shots, clean modern interiors, memes or text-heavy graphics, clinical/stock-photo look. When in doubt about a person or face being visible, mark unfit. Respond with JSON only.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Caption this image in under 20 words (subject, setting, mood), then judge fit for the theme." },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "curation", strict: true,
              schema: {
                type: "object",
                properties: { caption: { type: "string" }, fit: { type: "boolean" }, reason: { type: "string" } },
                required: ["caption", "fit", "reason"], additionalProperties: false,
              },
            },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error?.message || `OpenRouter ${res.status}`)
      const raw = payload.choices?.[0]?.message?.content
      return typeof raw === "string" ? JSON.parse(raw) : raw
    } catch (error) {
      if (attempt === 4) throw error
      await new Promise((r) => setTimeout(r, attempt * 2000))
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker))
const unfit = results.filter((r) => !r.fit)
console.log(`\nUNFIT ${unfit.length}/${images.length}:`)
for (const u of unfit) console.log(`- [${u.index}] ${u.caption} — ${u.reason}`)
await writeFile(OUT, JSON.stringify(results, null, 1))
console.log(`verdicts saved to ${OUT}`)

if (APPLY) {
  const keep = results.filter((r) => r.fit)
  const keptImages = keep.map((r) => ({ ...images[r.index], caption: r.caption || images[r.index].caption }))
  const nextRec = { ...row.rec, images: keptImages }
  await tables.upsertRow(DB, "image_collections", row.$id, {
    rid: row.meta.rid,
    name: row.meta.name,
    status: row.meta.status,
    created_raw: row.meta.created_raw,
    ord: row.meta.ord,
    ...(row.meta.owner_id ? { owner_id: row.meta.owner_id } : {}),
    data: JSON.stringify(nextRec),
  })
  console.log(`APPLIED: kept ${keptImages.length}, removed ${unfit.length}`)
  for (const u of unfit) {
    try {
      const rel = decodeURIComponent(u.image_link.replace(/^\/api\/local-assets\//, ""))
      const fileId = createHash("sha256").update(rel).digest("hex").slice(0, 36)
      await storage.deleteFile("image_collections", fileId)
    } catch {}
  }
  console.log("pruned storage files deleted")
}
