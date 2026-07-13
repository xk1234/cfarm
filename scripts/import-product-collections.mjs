import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"

import { Client, Query, Storage, TablesDB } from "node-appwrite"
import { InputFile } from "node-appwrite/file"
import sharp from "sharp"

const execFileAsync = promisify(execFile)
const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const TABLE = "product_collections"
const BUCKET = "product_images"
const OWNER = process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim()
const SOURCE = process.argv[2] || "/tmp/lumenclip-product-source.json"
const HIGGSFIELD = "higgsfield"
const DISCLAIMER = "Prices and estimated commissions were captured from Amazon.sg on 13 July 2026. Marketplace prices and programme rates can change; commission is only earned on qualifying dispatched purchases."
const COMMISSION_SOURCE = "https://affiliate-program.amazon.sg/help/node/topic/RXPHT8U84RAYDXZ"

if (!OWNER) throw new Error("LUMENCLIP_SYSTEM_OWNER_ID is required")

const client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT)
  .setProject(process.env.APPWRITE_PROJECT_ID)
  .setKey(process.env.APPWRITE_API_KEY)
const tables = new TablesDB(client)
const storage = new Storage(client)
const source = JSON.parse(await readFile(SOURCE, "utf8"))
if (!Array.isArray(source) || source.length !== 5) {
  throw new Error(`Expected five product collections, received ${source?.length ?? 0}`)
}

const existing = await existingCollections()
for (const [collectionIndex, sourceCollection] of source.entries()) {
  const previous = existing.get(sourceCollection.id)
  const completed = new Map((previous?.items ?? []).map((item) => [item.id, item]))
  const items = []
  for (const [itemIndex, sourceItem] of sourceCollection.items.entries()) {
    const cached = completed.get(sourceItem.asin)
    if (cached?.storeImageUrl && cached?.generatedImageUrl) {
      items.push(cached)
      console.log(`[${collectionIndex + 1}/5 ${itemIndex + 1}/10] skip ${sourceItem.asin}`)
      continue
    }

    const storeBytes = await fetchBytes(sourceItem.image)
    const storeWebp = await sharp(storeBytes)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer()
    const storePath = `product-collections/store/${sourceItem.asin}.webp`
    await uploadAsset(storePath, storeWebp)

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), "lumenclip-product-"))
    const referencePath = path.join(tmpDir, `${sourceItem.asin}.webp`)
    await writeFile(referencePath, storeWebp)
    let generatedUrl
    try {
      generatedUrl = await generateLifestyleImage(referencePath, sourceItem.generationPrompt)
    } finally {
      await rm(tmpDir, { recursive: true, force: true })
    }
    const generatedBytes = await fetchBytes(generatedUrl)
    const generatedWebp = await sharp(generatedBytes)
      .rotate()
      .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88 })
      .toBuffer()
    const generatedPath = `product-collections/generated/${sourceItem.asin}.webp`
    await uploadAsset(generatedPath, generatedWebp)

    items.push({
      id: sourceItem.asin,
      marketplace: "amazon",
      marketplaceUrl: sourceItem.href,
      name: sourceItem.title,
      currency: "SGD",
      price: numberFromPrice(sourceItem.price),
      priceLabel: sourceItem.price,
      commissionRate: sourceItem.commissionRate,
      estimatedCommission: sourceItem.estimatedCommission,
      storeImageUrl: localAssetUrl(storePath),
      generatedImageUrl: localAssetUrl(generatedPath),
      useCase: sourceItem.useCase,
      sourcedAt: "2026-07-13T00:00:00.000+08:00",
    })
    await upsertCollection(sourceCollection, items, collectionIndex)
    console.log(`[${collectionIndex + 1}/5 ${itemIndex + 1}/10] generated ${sourceItem.asin}`)
  }
  await upsertCollection(sourceCollection, items, collectionIndex)
}

console.log("DONE: 5 product collections, 50 products, 50 generated lifestyle images")

async function existingCollections() {
  const response = await tables.listRows(DB, TABLE, [
    Query.equal("owner_id", [OWNER]),
    Query.limit(100),
  ])
  return new Map(response.rows.flatMap((row) => {
    try {
      const record = JSON.parse(row.data)
      return record?.id ? [[record.id, record]] : []
    } catch {
      return []
    }
  }))
}

async function upsertCollection(sourceCollection, items, ord) {
  const now = new Date().toISOString()
  const record = {
    ownerId: OWNER,
    id: sourceCollection.id,
    name: sourceCollection.name,
    description: sourceCollection.description,
    items,
    createdAt: existing.get(sourceCollection.id)?.createdAt || now,
    updatedAt: now,
    commissionDisclaimer: DISCLAIMER,
    commissionSourceUrl: COMMISSION_SOURCE,
  }
  await tables.upsertRow(DB, TABLE, ownedRowId(sourceCollection.id), {
    rid: sourceCollection.id,
    name: sourceCollection.name,
    status: items.length === 10 ? "ready" : "generating",
    created_raw: record.createdAt,
    owner_id: OWNER,
    ord,
    data: JSON.stringify(record),
  })
}

async function generateLifestyleImage(referencePath, prompt) {
  const startedAt = Date.now() / 1000
  let generationError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await execFileAsync(HIGGSFIELD, [
        "generate", "create", "nano_banana_2",
        "--image", referencePath,
        "--prompt", prompt,
        "--aspect_ratio", "4:5",
        "--resolution", "2k",
        "--wait",
        "--wait-timeout", "20m",
      ], { maxBuffer: 4 * 1024 * 1024 })
      generationError = undefined
      break
    } catch (error) {
      generationError = error
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2_000 * 2 ** attempt))
    }
  }
  if (generationError) throw generationError
  const { stdout } = await execFileAsync(HIGGSFIELD, ["generate", "list", "--json"], {
    maxBuffer: 8 * 1024 * 1024,
  })
  const job = JSON.parse(stdout).find(
    (item) =>
      item.job_set_type === "nano_banana_2" &&
      item.status === "completed" &&
      item.created_at >= startedAt - 2 &&
      item.params?.prompt === prompt &&
      item.result_url
  )
  if (!job?.result_url) throw new Error("Nano Banana Pro completed without an image URL")
  return job.result_url
}

async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`Could not download product image (${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}

async function uploadAsset(relativePath, bytes) {
  const fileId = createHash("sha256").update(relativePath).digest("hex").slice(0, 36)
  const input = InputFile.fromBuffer(bytes, path.basename(relativePath))
  try {
    await storage.createFile(BUCKET, fileId, input, [])
  } catch (error) {
    if (error?.code !== 409) throw error
    await storage.deleteFile(BUCKET, fileId).catch(() => undefined)
    await storage.createFile(BUCKET, fileId, input, [])
  }
}

function ownedRowId(id) {
  return `u${createHash("sha256").update(`${TABLE}:${OWNER}:${id}`).digest("hex").slice(0, 35)}`
}

function localAssetUrl(relativePath) {
  return `/api/local-assets/${relativePath.split("/").map(encodeURIComponent).join("/")}`
}

function numberFromPrice(value) {
  return Number(String(value).replace(/[^0-9.]/g, ""))
}
