/**
 * One-time cloud-media catalog migration. Provisions the public media_library
 * table and indexes the existing Storage-backed files from their logical paths.
 * Run before removing the legacy local media tree.
 */
import crypto from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import { Client, TablesDB } from "node-appwrite"

const DB = process.env.APPWRITE_DATABASE_ID || "cfarm"
const TABLE = "media_library"
const DATA_ROOT = path.join(process.cwd(), "data")
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const ignoreConflict = (error) => {
  if (error?.code !== 409) throw error
}

const definitions = [
  {
    folder: "music",
    extensions: [".mp3", ".wav"],
    kind: "audio",
    collection: "music",
  },
  {
    folder: "ugc_avatar_videos",
    extensions: [".mp4", ".webm", ".mov"],
    kind: "video",
    collection: "ugc_avatar_videos",
  },
  {
    folder: "assets/demos",
    extensions: [".mp4", ".webm", ".mov"],
    kind: "video",
    collection: "demo_videos",
  },
  {
    folder: "greenscreen_memes",
    extensions: [".mp4", ".webm", ".mov"],
    kind: "video",
    collection: "greenscreen_memes",
  },
  { folder: "ctas", extensions: [".txt"], kind: "text", collection: "ctas" },
]

const tables = new TablesDB(
  new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
)

await tables.createTable(DB, TABLE, "Media library").catch(ignoreConflict)
for (const [key, size] of [
  ["rid", 1024],
  ["name", 2048],
  ["status", 255],
  ["created_raw", 64],
]) {
  await tables
    .createStringColumn(DB, TABLE, key, size, false)
    .catch(ignoreConflict)
}
await tables.createIntegerColumn(DB, TABLE, "ord", false).catch(ignoreConflict)
await tables
  .createStringColumn(DB, TABLE, "data", 1_000_000, true)
  .catch(ignoreConflict)
for (;;) {
  const columns = await tables.listColumns(DB, TABLE)
  if (columns.columns.every((column) => column.status === "available")) break
  await sleep(500)
}
await tables
  .createIndex(DB, TABLE, "idx_ord", "key", ["ord"], ["ASC"])
  .catch(ignoreConflict)

const assets = []
const usedIds = new Set()
for (const definition of definitions) {
  const root = path.join(DATA_ROOT, definition.folder)
  const allowed = new Set(definition.extensions)
  for (const filePath of await walkFiles(root)) {
    if (!allowed.has(path.extname(filePath).toLowerCase())) continue
    const relativePath = path
      .relative(DATA_ROOT, filePath)
      .split(path.sep)
      .join("/")
    const baseId = slugify(relativePath)
    const id = usedIds.has(baseId)
      ? `${baseId}-${crypto.createHash("sha256").update(relativePath).digest("hex").slice(0, 8)}`
      : baseId
    usedIds.add(id)
    const record = {
      id,
      name: titleFromFilename(relativePath),
      path: relativePath,
      url: `/api/local-assets/${relativePath.split("/").map(encodeURIComponent).join("/")}`,
      kind: definition.kind,
      collection: definition.collection,
      ...(definition.kind === "text"
        ? { text: (await readFile(filePath, "utf8")).trim() }
        : {}),
    }
    assets.push(record)
  }
}

for (const [index, record] of assets.entries()) {
  await tables.upsertRow(DB, TABLE, rowIdFor(record.id), {
    rid: record.id,
    name: record.name,
    status: null,
    created_raw: null,
    ord: index,
    data: JSON.stringify(record),
  })
  if ((index + 1) % 50 === 0)
    console.log(`indexed ${index + 1}/${assets.length}`)
}

console.log(`ready: ${DB}/${TABLE} (${assets.length} assets)`)

async function walkFiles(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const children = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory()
        ? walkFiles(entryPath)
        : entry.isFile()
          ? [entryPath]
          : []
    })
  )
  return children.flat()
}

function rowIdFor(rid) {
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(rid)) return rid
  return `r${crypto.createHash("sha256").update(`${TABLE}:${rid}`).digest("hex").slice(0, 35)}`
}

function titleFromFilename(filePath) {
  return path
    .basename(filePath, path.extname(filePath))
    .replace(/^copy of /i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
