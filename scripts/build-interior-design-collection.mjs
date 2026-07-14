import { createHash } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { Client, Query, Storage, TablesDB } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

const previousCollectionName = "Pinterest - curtains"
const collectionName = "Interior Design — Editorial Rooms"
const collectionCreatedAt = "2026-07-14T05:30:00.000Z"
const targetSize = 110
const rejectedPhotoIds = new Set([
  "5942741",
  "15743363",
  "18738893",
  "36789868",
  "37886752",
  "19416998",
  "29100031",
  "32854954",
  "17994860",
  "36260586",
  "13722842",
  "17994856",
  "13722884",
  "15945558",
  "7303767",
  "10117703",
  "7303732",
  "8175336",
  "28080317",
  "8286625",
  "27623999",
  "9616216",
  "11538892",
  "29962512",
  "10140604",
  "6310320",
  "30628740",
  "11403827",
  "31374154",
  "1002745",
  "13637669",
  "4819822",
  "29080564",
  "9869373",
  "34950109",
  "7746907",
  "19353452",
  "5940231",
  "28297763",
  "37793333",
])
const queries = [
  ["warm modern living room interior design", "living room"],
  ["neutral luxury living room interior", "living room"],
  ["small stylish living room apartment", "living room"],
  ["cozy layered living room decor", "living room"],
  ["warm modern bedroom interior design", "bedroom"],
  ["neutral luxury bedroom interior", "bedroom"],
  ["small stylish bedroom decor", "bedroom"],
  ["warm modern kitchen interior design", "kitchen"],
  ["small stylish kitchen interior", "kitchen"],
  ["warm modern bathroom interior design", "bathroom"],
  ["small luxury bathroom interior", "bathroom"],
  ["warm modern dining room interior", "dining room"],
  ["small stylish dining room decor", "dining room"],
  ["warm minimalist apartment interior", "apartment"],
  ["small apartment interior design", "apartment"],
  ["stylish home entryway interior", "entryway"],
]
const root = process.cwd()
const databasePath = path.join(root, "data", "image-collections.json")
const filesDirectory = path.join(root, "data", "image-collections", "files")
const publicPrefix = "/api/local-assets/image-collections/files"

if (!process.env.PEXELS_KEY) {
  throw new Error("PEXELS_KEY is required")
}

const database = JSON.parse(await readFile(databasePath, "utf8"))
const collections = Array.isArray(database) ? database : database.collections
const collection = collections.find(
  (item) => item.name === collectionName || item.name === previousCollectionName
)
if (!collection) {
  throw new Error(
    `Collection not found: ${collectionName} or ${previousCollectionName}`
  )
}
if (collection.name === previousCollectionName) collection.images = []
collection.name = collectionName
collection.created_at = collectionCreatedAt
collection.images = collection.images.filter((image) => {
  const photoId = image.image_link.match(/pexels-interior-(\d+)/)?.[1]
  return !photoId || !rejectedPhotoIds.has(photoId)
})

const candidates = []
for (const [query, category] of queries) {
  const url = new URL("https://api.pexels.com/v1/search")
  url.searchParams.set("query", query)
  url.searchParams.set("per_page", "30")
  url.searchParams.set("orientation", "portrait")
  const response = await fetch(url, {
    headers: { Authorization: process.env.PEXELS_KEY },
  })
  if (!response.ok) {
    throw new Error(`Pexels search failed with ${response.status}`)
  }
  const payload = await response.json()
  candidates.push(
    ...(Array.isArray(payload.photos)
      ? payload.photos.map((photo) => ({ ...photo, category }))
      : [])
  )
}

const existingHashes = new Set(
  collection.images.map((image) => image.hash).filter(Boolean)
)
const existingLinks = new Set(
  collection.images.map((image) => image.image_link)
)
const seenIds = new Set(
  collection.images
    .map((image) => image.image_link.match(/pexels-interior-(\d+)/)?.[1])
    .filter(Boolean)
)
const categoryCounts = new Map()
for (const image of collection.images) {
  const category = image.caption.split(" — ")[0].toLowerCase()
  categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1)
}
const curated = candidates.filter((photo) => {
  const description = `${photo.alt ?? ""}`
  const relevant =
    /(interior|living room|bedroom|kitchen|bathroom|dining room|apartment|home|entryway|hallway|room)/i.test(
      description
    )
  const excluded =
    /(exterior|facade|outdoor|patio|terrace|balcony|restaurant|cafe|coffee shop|hotel|lobby|store|office building|workspace|person|people|woman|women|man|men|child|children|cat|dog|real estate agent)/i.test(
      description
    )
  const portrait = Number(photo.height) > Number(photo.width)
  const categoryCount = categoryCounts.get(photo.category) || 0
  const categoryLimit = photo.category === "living room" ? 30 : 20
  if (
    !relevant ||
    excluded ||
    !portrait ||
    seenIds.has(String(photo.id)) ||
    rejectedPhotoIds.has(String(photo.id)) ||
    categoryCount >= categoryLimit
  ) {
    return false
  }
  seenIds.add(String(photo.id))
  categoryCounts.set(photo.category, categoryCount + 1)
  return true
})

await mkdir(filesDirectory, { recursive: true })
const imported = []
for (const photo of curated) {
  if (collection.images.length + imported.length >= targetSize) break
  const imageUrl = photo.src?.large || photo.src?.large2x || photo.src?.original
  if (!imageUrl) continue

  const response = await fetch(imageUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      Referer: photo.url || "https://www.pexels.com/",
      "User-Agent": "cfarm-interior-collection/1.0",
    },
  })
  if (!response.ok) continue
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.startsWith("image/")) continue

  const bytes = Buffer.from(await response.arrayBuffer())
  const hash = createHash("sha256").update(bytes).digest("hex")
  if (existingHashes.has(hash)) continue
  existingHashes.add(hash)

  const extension = contentType.includes("webp")
    ? ".webp"
    : contentType.includes("png")
      ? ".png"
      : ".jpg"
  const fileName = `pexels-interior-${photo.id}${extension}`
  const publicUrl = `${publicPrefix}/${fileName}`
  if (existingLinks.has(publicUrl)) continue
  existingLinks.add(publicUrl)
  await writeFile(path.join(filesDirectory, fileName), bytes)
  imported.push({
    image_link: publicUrl,
    caption: editorialCaption(photo),
    hash,
  })
}

collection.images = [...collection.images, ...imported]
collection.pinned = true
const temporaryPath = `${databasePath}.tmp`
await writeFile(temporaryPath, `${JSON.stringify(database, null, 2)}\n`)
await rename(temporaryPath, databasePath)

const synced = await syncToAppwrite(collection)

console.log(
  JSON.stringify({
    collection: collectionName,
    imported: imported.length,
    total: collection.images.length,
    synced,
  })
)

async function syncToAppwrite(nextCollection) {
  const endpoint = process.env.APPWRITE_ENDPOINT
  const projectId = process.env.APPWRITE_PROJECT_ID
  const apiKey = process.env.APPWRITE_API_KEY
  const ownerId = process.env.LUMENCLIP_SYSTEM_OWNER_ID
  const databaseId = process.env.APPWRITE_DATABASE_ID || "cfarm"
  if (!endpoint || !projectId || !apiKey || !ownerId) return false

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey)
  const tables = new TablesDB(client)
  const storage = new Storage(client)

  for (const image of nextCollection.images) {
    const fileName = decodeURIComponent(image.image_link.split("/").at(-1))
    const relativePath = `image-collections/files/${fileName}`
    const bytes = await readFile(path.join(filesDirectory, fileName))
    const fileId = createHash("sha256")
      .update(relativePath)
      .digest("hex")
      .slice(0, 36)
    await storage
      .createFile(
        "image_collections",
        fileId,
        InputFile.fromBuffer(bytes, fileName),
        []
      )
      .catch((error) => {
        if (error?.code !== 409) throw error
      })
  }

  await updateOwnedJsonRow({
    tables,
    databaseId,
    tableId: "image_collections",
    ownerId,
    matches: (value) =>
      value.name === collectionName || value.name === previousCollectionName,
    value: { ...nextCollection, ownerId },
  })

  const automationDatabase = JSON.parse(
    await readFile(
      path.join(root, "data", "automations", "automations.json"),
      "utf8"
    )
  )
  const automation = automationDatabase.automations.find(
    (item) => item.id === "automation-curtains-renter-glowup"
  )
  if (!automation) throw new Error("Interior design automation not found")
  await updateOwnedJsonRow({
    tables,
    databaseId,
    tableId: "automations",
    ownerId,
    matches: (value) => value.id === automation.id,
    value: { ...automation, ownerId },
  })
  return true
}

function editorialCaption(photo) {
  const raw = String(photo.alt || "")
    .trim()
    .replace(/\s+/g, " ")
  const detail = raw
    ? raw.replace(/[.]+$/, "")
    : `Polished ${photo.category} with a cohesive residential design`
  const attribution = photo.photographer
    ? ` Photo by ${photo.photographer} on Pexels.`
    : ""
  return `${capitalize(photo.category)} — ${detail}.${attribution}`
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

async function updateOwnedJsonRow({
  tables,
  databaseId,
  tableId,
  ownerId,
  matches,
  value,
}) {
  const response = await tables.listRows(databaseId, tableId, [
    Query.equal("owner_id", [ownerId]),
    Query.limit(100),
  ])
  const row = response.rows.find((candidate) => {
    try {
      return matches(JSON.parse(candidate.data))
    } catch {
      return false
    }
  })
  if (!row) throw new Error(`Appwrite row not found in ${tableId}`)
  await tables.updateRow(databaseId, tableId, row.$id, {
    name: value.name,
    ...(value.status ? { status: value.status } : {}),
    data: JSON.stringify(value),
  })
}
