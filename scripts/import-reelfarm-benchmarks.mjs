/**
 * Import and grade the 100-record ReelFarm benchmark extract created from the
 * authenticated database page.
 *
 * Usage:
 *   set -a; source .env; set +a
 *   node scripts/provision-benchmarks.mjs
 *   node scripts/import-reelfarm-benchmarks.mjs /tmp/reelfarm-benchmark-source.json
 */
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { Client, Query, Storage, TablesDB } from "node-appwrite"
import { InputFile } from "node-appwrite/file"
import sharp from "sharp"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const TABLE = "benchmark_corpus"
const BUCKET = "benchmark_images"
const MODEL = "google/gemini-2.5-flash"
const SOURCE_FILE = process.argv[2] || "/tmp/reelfarm-benchmark-source.json"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)
const tables = new TablesDB(client)
const storage = new Storage(client)

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required")
}

const source = JSON.parse(await readFile(SOURCE_FILE, "utf8"))
const decodedImageFiles = await readFile(
  "/tmp/reelfarm-decoded-map.json",
  "utf8"
)
  .then(JSON.parse)
  .catch(() => ({}))
if (!Array.isArray(source) || source.length !== 100) {
  throw new Error(`Expected exactly 100 source slideshows, received ${source?.length ?? 0}`)
}

const existing = await existingRecords()
let completed = 0
for (const [index, item] of source.entries()) {
  const existingRecord = existing.get(item.sourceId)
  if (existingRecord?.scores && existingRecord?.slides?.length === item.originalImageUrls.length) {
    if (!Array.isArray(existingRecord.creator?.audienceRegions)) {
      const repaired = { ...existingRecord, creator: item.creator, stats: item.stats }
      await retryAppwrite(() => tables.upsertRow(DB, TABLE, rowId(item.sourceId), {
        rid: item.sourceId,
        name: `@${item.creator.username}`,
        status: "graded",
        created_raw: repaired.createdAt,
        ord: index,
        data: JSON.stringify(repaired),
      }))
    }
    completed += 1
    console.log(`[${completed}/100] skip ${item.sourceId}`)
    continue
  }

  const slides = []
  for (const [slideIndex, originalImageUrl] of item.originalImageUrls.entries()) {
    slides.push(await storeSlide(item.sourceId, originalImageUrl, slideIndex))
  }
  const icp = [
    item.creator.niche,
    item.creator.productMedium,
    item.creator.product,
  ]
    .filter(Boolean)
    .join(" · ")
  const grade = await gradeSlideshow({
    title: `@${item.creator.username} ReelFarm slideshow`,
    icp,
    imageUrls: await Promise.all(item.originalImageUrls.map(gradingImageUrl)),
  })
  const now = new Date().toISOString()
  const record = {
    id: item.sourceId,
    source: "reelfarm",
    sourceUrl: "https://reel.farm/dashboard/database?view=browse",
    creator: item.creator,
    stats: item.stats,
    slides,
    prompt: item.prompt || "",
    icp,
    ...grade,
    model: MODEL,
    createdAt: now,
    gradedAt: now,
  }
  await retryAppwrite(() => tables.upsertRow(DB, TABLE, rowId(item.sourceId), {
    rid: item.sourceId,
    name: `@${item.creator.username}`,
    status: "graded",
    created_raw: now,
    ord: index,
    data: JSON.stringify(record),
  }))
  completed += 1
  console.log(
    `[${completed}/100] ${item.sourceId} overall=${record.scores.overall} slides=${slides.length}`
  )
  await sleep(180)
}

await cleanupCorpus(new Set(source.map((item) => item.sourceId)))
console.log(`DONE: ${completed} benchmark slideshows`)

async function existingRecords() {
  const records = new Map()
  let cursor
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await tables.listRows(DB, TABLE, queries)
    for (const row of response.rows) {
      try {
        const record = JSON.parse(row.data)
        if (record?.id) records.set(record.id, record)
      } catch {}
    }
    if (response.rows.length < 100) break
    cursor = response.rows.at(-1)?.$id
  }
  return records
}

async function storeSlide(sourceId, originalImageUrl, index) {
  const decodedFile = decodedImageFiles[originalImageUrl]
  const original = decodedFile
    ? await readFile(decodedFile)
    : Buffer.from(await (await fetchWithRetry(originalImageUrl)).arrayBuffer())
  let converted = original
  let width
  let height
  let extension = "jpg"
  try {
    const image = sharp(original).rotate()
    const metadata = await image.metadata()
    width = metadata.width
    height = metadata.height
    converted = await image
      .resize({ width: 768, height: 1280, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 })
      .toBuffer()
    extension = "webp"
  } catch {
    // Some ReelFarm .jpg URLs contain the browser-decodable VVIC container.
    // Preserve those source bytes rather than dropping a benchmark slide.
  }
  const fileName = `slide-${String(index + 1).padStart(3, "0")}.${extension}`
  const relative = `benchmarks/reelfarm/${sourceId}/${fileName}`
  const fileId = createHash("sha256").update(relative).digest("hex").slice(0, 36)
  try {
    await retryAppwrite(() => storage.createFile(
      BUCKET,
      fileId,
      InputFile.fromBuffer(converted, path.basename(relative)),
      []
    ))
  } catch (error) {
    if (error?.code !== 409) throw error
  }
  return {
    id: `${sourceId}-slide-${index + 1}`,
    imageUrl: `/api/local-assets/${relative}`,
    originalImageUrl,
    role: index === 0 ? "hook" : "content",
    width,
    height,
    bytes: converted.byteLength,
  }
}

async function cleanupCorpus(desiredIds) {
  let cursor
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await retryAppwrite(() => tables.listRows(DB, TABLE, queries))
    for (const row of response.rows) {
      if (!desiredIds.has(row.rid)) {
        await retryAppwrite(() => tables.deleteRow(DB, TABLE, row.$id))
      }
    }
    if (response.rows.length < 100) break
    cursor = response.rows.at(-1)?.$id
  }
}

async function gradingImageUrl(originalImageUrl) {
  const decodedFile = decodedImageFiles[originalImageUrl]
  if (!decodedFile) return originalImageUrl
  const png = await readFile(decodedFile)
  return `data:image/png;base64,${png.toString("base64")}`
}

async function gradeSlideshow({ title, icp, imageUrls }) {
  const content = [
    {
      type: "text",
      text: `Slideshow title: ${title}\nTarget ICP: ${icp || "Infer from the slideshow"}\nThere are ${imageUrls.length} slides in order.`,
    },
  ]
  imageUrls.forEach((url, index) => {
    content.push({
      type: "text",
      text: `Slide ${index + 1}${index === 0 ? " (HOOK — use only this slide for hook virality)" : ""}`,
    })
    content.push({ type: "image_url", image_url: { url } })
  })
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a strict short-form slideshow creative benchmarker. Grade four independent dimensions from 0 to 10 using integers. Hook virality must use ONLY slide 1. Picture/text fit, usefulness to ICP, and conversation potential must use ALL slides. Judge the rendered pixels, including actual text placement, legibility, image relevance, specificity, narrative progression, and whether the content invites comments or sharing. A 5 is average; 8+ requires unusually strong evidence. Do not reward production polish that does not improve the metric.",
        },
        { role: "user", content },
      ],
      response_format: benchmarkResponseFormat(),
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || `OpenRouter ${response.status}`)
  const raw = payload.choices?.[0]?.message?.content
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
  const scores = Object.fromEntries(
    Object.entries(parsed.scores).map(([key, value]) => [
      key,
      Math.max(0, Math.min(10, Math.round(Number(value) || 0))),
    ])
  )
  scores.overall =
    Math.round(
      ((scores.hookVirality +
        scores.pictureTextFit +
        scores.usefulnessToIcp +
        scores.conversationPotential) /
        4) *
        10
    ) / 10
  return { scores, rationales: parsed.rationales }
}

function benchmarkResponseFormat() {
  const keys = [
    "hookVirality",
    "pictureTextFit",
    "usefulnessToIcp",
    "conversationPotential",
  ]
  return {
    type: "json_schema",
    json_schema: {
      name: "slideshow_benchmark",
      strict: true,
      schema: {
        type: "object",
        properties: {
          scores: {
            type: "object",
            properties: Object.fromEntries(
              keys.map((key) => [key, { type: "integer", minimum: 0, maximum: 10 }])
            ),
            required: keys,
            additionalProperties: false,
          },
          rationales: {
            type: "object",
            properties: Object.fromEntries(keys.map((key) => [key, { type: "string" }])),
            required: keys,
            additionalProperties: false,
          },
        },
        required: ["scores", "rationales"],
        additionalProperties: false,
      },
    },
  }
}

async function fetchWithRetry(url) {
  let error
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
      if (response.ok) return response
      throw new Error(`Image request failed (${response.status})`)
    } catch (caught) {
      error = caught
      if (attempt < 4) await sleep(attempt * 500)
    }
  }
  throw error
}

async function retryAppwrite(task) {
  let error
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await task()
    } catch (caught) {
      error = caught
      if (caught?.code === 409) throw caught
      if (attempt < 5) await sleep(attempt * 500)
    }
  }
  throw error
}

function rowId(id) {
  return `r${createHash("sha256").update(`${TABLE}:${id}`).digest("hex").slice(0, 35)}`
}
