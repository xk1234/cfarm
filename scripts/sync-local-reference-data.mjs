/**
 * Copies reference collections, shared media, and user-owned assets from the
 * cloud project into local Appwrite. Full local setup runs this automatically;
 * `pnpm dev` uses setup's lightweight --ensure path and does not re-copy data.
 *
 * The cloud project still uses separate source collection tables while the
 * local app reads the consolidated `permanent_assets` table. Owners are mapped
 * by account email so local rows remain visible to the matching local account.
 */
import crypto from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

import { Client, Query, Storage, TablesDB, Users } from "node-appwrite"
import { InputFile } from "node-appwrite/file"

const root = path.resolve(import.meta.dirname, "..")
const cloudEnv = readEnvironment(path.join(root, ".env"))
const localEnv = readEnvironment(path.join(root, ".env.local"))
const sourceDatabaseId = cloudEnv.APPWRITE_DATABASE_ID || "cfarm"
const targetDatabaseId = localEnv.APPWRITE_DATABASE_ID || "cfarm"
const targetTable = "permanent_assets"
const copyFiles = !process.argv.includes("--rows-only")
const sourceFilter = argumentValue("--source")
const collectionSources = [
  {
    tableId: "image_collections",
    sourceKey: "image_collection",
    fallbackPrefix: "image-collection",
  },
  {
    tableId: "word_collections",
    sourceKey: "word_collection",
    fallbackPrefix: "word-collection",
  },
  {
    tableId: "product_collections",
    sourceKey: "product_collection",
    fallbackPrefix: "product-collection",
  },
]
const assetSources = [
  {
    tableId: "media_library",
    sourceKey: "media_library_asset",
    fallbackPrefix: "media-library-asset",
    public: true,
  },
  {
    tableId: "assets",
    sourceKey: "uploaded_asset",
    fallbackPrefix: "uploaded-asset",
    public: false,
  },
]
const allSources = [...collectionSources, ...assetSources]
const selectedSources = sourceFilter
  ? allSources.filter(
      (source) =>
        source.sourceKey === sourceFilter || source.tableId === sourceFilter
    )
  : allSources
const selectedCollectionSources = collectionSources.filter((source) =>
  selectedSources.includes(source)
)
const selectedAssetSources = assetSources.filter((source) =>
  selectedSources.includes(source)
)

if (sourceFilter && selectedSources.length === 0) {
  throw new Error(
    `Unknown source ${sourceFilter}. Expected one of: ${allSources.map((source) => source.sourceKey).join(", ")}.`
  )
}

requireEnvironment(cloudEnv, ".env")
requireEnvironment(localEnv, ".env.local")

if (
  cloudEnv.APPWRITE_ENDPOINT === localEnv.APPWRITE_ENDPOINT &&
  cloudEnv.APPWRITE_PROJECT_ID === localEnv.APPWRITE_PROJECT_ID
) {
  throw new Error(
    "Cloud and local Appwrite targets must be different projects."
  )
}

const cloud = services(cloudEnv)
const local = services(localEnv)

const [cloudUsers, localUsers, sourceRowsByTable] = await Promise.all([
  listAllUsers(cloud.users),
  listAllUsers(local.users),
  Promise.all(
    selectedSources.map(async (source) => [
      source.tableId,
      await listAllRows(cloud.tables, sourceDatabaseId, source.tableId),
    ])
  ),
])
const sourceRows = new Map(sourceRowsByTable)
const localUsersByEmail = new Map(
  localUsers.map((user) => [user.email.trim().toLowerCase(), user])
)
const cloudUsersById = new Map(cloudUsers.map((user) => [user.$id, user]))
const ownerMap = new Map()

for (const source of selectedSources.filter((item) => !item.public)) {
  const rows = sourceRows.get(source.tableId) || []
  for (const row of rows) {
    const record = parseCollectionRecord(row)
    const cloudOwnerId = clean(row.owner_id || record.ownerId)
    const cloudOwner = cloudUsersById.get(cloudOwnerId)
    const localOwner = cloudOwner
      ? localUsersByEmail.get(cloudOwner.email.trim().toLowerCase())
      : null
    if (!cloudOwner || !localOwner) {
      throw new Error(
        `Cannot map ${source.sourceKey} owner ${cloudOwnerId || "(missing)"} to a local account. Sign into the local app with the same email first.`
      )
    }
    ownerMap.set(cloudOwner.$id, localOwner.$id)
  }
}

const collections = []
for (const source of selectedCollectionSources) {
  const rows = sourceRows.get(source.tableId) || []
  for (const [index, row] of rows.entries()) {
    const record = parseCollectionRecord(row)
    const localOwnerId = ownerMap.get(clean(row.owner_id || record.ownerId))
    const rid =
      clean(row.rid) || clean(record.id) || `${source.fallbackPrefix}-${index}`
    const localRecord = {
      ...record,
      ...(source.sourceKey === "image_collection"
        ? {
            id:
              clean(record.id) ||
              slugify(clean(record.name || row.name)) ||
              rid,
          }
        : {}),
      ownerId: localOwnerId,
    }
    const rowId = ownedRowId(
      `${targetTable}:${source.sourceKey}`,
      localOwnerId,
      rid,
      index
    )
    await local.tables.upsertRow({
      databaseId: targetDatabaseId,
      tableId: targetTable,
      rowId,
      data: {
        rid: rid.slice(0, 1024),
        ...(localOwnerId ? { owner_id: localOwnerId } : {}),
        source_key: source.sourceKey,
        name: clean(record.name || row.name).slice(0, 2048) || null,
        status: clean(record.status || row.status).slice(0, 255) || null,
        created_raw:
          clean(record.createdAt || record.created_at || row.created_raw).slice(
            0,
            64
          ) || null,
        data: JSON.stringify(localRecord),
        ord: Number.isFinite(Number(row.ord)) ? Number(row.ord) : index,
        visibility: "private",
        asset_type: source.sourceKey,
        kind: "collection",
        description: clean(record.description).slice(0, 100000) || null,
        updated_at:
          clean(record.updatedAt || record.updated_at).slice(0, 64) || null,
        migration_source: `cloud:${source.tableId}`,
      },
      permissions: [],
    })
    collections.push(localRecord)
  }
  console.log(`Synced ${rows.length} ${source.sourceKey} rows.`)
}

const assets = []
for (const source of selectedAssetSources) {
  const rows = sourceRows.get(source.tableId) || []
  for (const [index, row] of rows.entries()) {
    const record = parseCollectionRecord(row)
    const cloudOwnerId = clean(row.owner_id || record.ownerId)
    const localOwnerId = source.public ? null : ownerMap.get(cloudOwnerId)
    const rid =
      clean(row.rid) || clean(record.id) || `${source.fallbackPrefix}-${index}`
    const localRecord = localOwnerId
      ? { ...record, ownerId: localOwnerId }
      : record
    const rowId = localOwnerId
      ? ownedRowId(
          `${targetTable}:${source.sourceKey}`,
          localOwnerId,
          rid,
          index
        )
      : publicRowId(`${targetTable}:${source.sourceKey}`, rid, index)
    const storage = storageReference(localRecord)
    await local.tables.upsertRow({
      databaseId: targetDatabaseId,
      tableId: targetTable,
      rowId,
      data: {
        rid: rid.slice(0, 1024),
        owner_id: localOwnerId,
        source_key: source.sourceKey,
        name: clean(record.name || row.name).slice(0, 2048) || null,
        status: clean(record.status || row.status).slice(0, 255) || null,
        created_raw:
          clean(record.createdAt || record.created_at || row.created_raw).slice(
            0,
            64
          ) || null,
        data: JSON.stringify(localRecord),
        ord: Number.isFinite(Number(row.ord)) ? Number(row.ord) : index,
        visibility: source.public ? "public" : "private",
        asset_type: source.sourceKey,
        kind: clean(record.kind).slice(0, 255) || source.sourceKey,
        description:
          clean(record.description || record.caption).slice(0, 100000) || null,
        text:
          clean(record.text || record.content || record.prompt).slice(
            0,
            100000
          ) || null,
        storage_bucket: storage?.bucketId || null,
        storage_file_id: storage?.fileId || null,
        storage_path: storage?.relativePath || null,
        url: storage?.url || null,
        mime_type:
          clean(record.mimeType || record.mime_type).slice(0, 255) || null,
        updated_at:
          clean(record.updatedAt || record.updated_at).slice(0, 64) || null,
        migration_source: `cloud:${source.tableId}`,
      },
      permissions: [],
    })
    assets.push(localRecord)
  }
  console.log(`Synced ${rows.length} ${source.sourceKey} rows.`)
}

if (copyFiles) {
  const files = uniqueReferencedFiles([...collections, ...assets])
  console.log(
    `Checking ${files.length} referenced files (${formatBucketCounts(files)})...`
  )
  await ensureTargetBucketLimits(files)
  let copied = 0
  let skipped = 0
  let completed = 0
  const failures = []

  await runPool(files, 8, async ({ bucketId, fileId, name }) => {
    try {
      await local.storage.getFile({ bucketId, fileId })
      skipped += 1
    } catch (error) {
      if (Number(error?.code) !== 404) throw error
      try {
        const bytes = await cloud.storage.getFileDownload({
          bucketId,
          fileId,
        })
        await local.storage.createFile({
          bucketId,
          fileId,
          file: InputFile.fromBuffer(Buffer.from(bytes), name),
          permissions: [],
        })
        copied += 1
      } catch (copyError) {
        failures.push(`${name}: ${copyError?.message || copyError}`)
      }
    } finally {
      completed += 1
      if (completed % 100 === 0 || completed === files.length) {
        console.log(
          `Referenced files ${completed}/${files.length} (${copied} copied, ${skipped} already local)`
        )
      }
    }
  })

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} referenced files failed to copy:\n${failures.slice(0, 20).join("\n")}`
    )
  }
  console.log(`Verified all ${files.length} referenced files.`)
}

async function ensureTargetBucketLimits(files) {
  const bucketIds = [...new Set(files.map((file) => file.bucketId))]
  for (const bucketId of bucketIds) {
    const [sourceBucket, targetBucket] = await Promise.all([
      cloud.storage.getBucket({ bucketId }),
      local.storage.getBucket({ bucketId }),
    ])
    const sourceLimit = Number(sourceBucket.maximumFileSize) || 30_000_000
    const targetLimit = Number(targetBucket.maximumFileSize) || 30_000_000
    if (targetLimit >= sourceLimit) continue
    await local.storage.updateBucket({
      bucketId,
      name: targetBucket.name || bucketId,
      maximumFileSize: sourceLimit,
    })
    console.log(
      `Raised ${bucketId} file limit from ${targetLimit} to ${sourceLimit} bytes.`
    )
  }
}

function services(env) {
  const client = new Client()
    .setEndpoint(env.APPWRITE_ENDPOINT)
    .setProject(env.APPWRITE_PROJECT_ID)
    .setKey(env.APPWRITE_API_KEY)
  return {
    storage: new Storage(client),
    tables: new TablesDB(client),
    users: new Users(client),
  }
}

function readEnvironment(filePath) {
  try {
    return parseEnv(readFileSync(filePath, "utf8"))
  } catch {
    return {}
  }
}

function requireEnvironment(env, fileName) {
  const missing = [
    "APPWRITE_ENDPOINT",
    "APPWRITE_PROJECT_ID",
    "APPWRITE_API_KEY",
  ].filter((key) => !clean(env[key]))
  if (missing.length > 0) {
    throw new Error(`${fileName} is missing ${missing.join(", ")}.`)
  }
}

async function listAllRows(tables, databaseId, tableId) {
  const rows = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await tables.listRows({
      databaseId,
      tableId,
      queries,
      total: false,
    })
    rows.push(...page.rows)
    if (page.rows.length < 100) return rows
    cursor = page.rows.at(-1).$id
  }
}

async function listAllUsers(users) {
  const records = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await users.list(queries)
    records.push(...page.users)
    if (page.users.length < 100) return records
    cursor = page.users.at(-1).$id
  }
}

function uniqueReferencedFiles(records) {
  const files = new Map()
  for (const record of records) {
    for (const value of stringValues(record)) {
      const storage = storageReference(value)
      if (!storage) continue
      files.set(`${storage.bucketId}:${storage.fileId}`, {
        bucketId: storage.bucketId,
        fileId: storage.fileId,
        name: path.posix.basename(storage.relativePath),
      })
    }
  }
  return [...files.values()]
}

function storageReference(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return storageReference(
      value.fileUrl ||
        value.url ||
        value.imageUrl ||
        value.videoUrl ||
        value.audioUrl
    )
  }
  if (typeof value !== "string") return null
  let pathname = ""
  try {
    pathname = new URL(value, "http://local").pathname
  } catch {
    return null
  }
  const prefix = "/api/local-assets/"
  if (!pathname.startsWith(prefix)) return null
  let relativePath = ""
  try {
    relativePath = pathname
      .slice(prefix.length)
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part))
      .join("/")
  } catch {
    return null
  }
  if (!relativePath || relativePath.split("/").includes("..")) return null
  const bucketId = bucketForRelativePath(relativePath)
  const fileId = crypto
    .createHash("sha256")
    .update(relativePath)
    .digest("hex")
    .slice(0, 36)
  return { bucketId, fileId, relativePath, url: value }
}

function stringValues(value, output = []) {
  if (typeof value === "string") {
    output.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) stringValues(item, output)
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) stringValues(item, output)
  }
  return output
}

function bucketForRelativePath(relativePath) {
  const top = relativePath.split("/", 1)[0]
  // Keep this mapping aligned with lib/appwrite-stores.ts. Collection rows can
  // contain image or video media, so limiting the sync to the two traditional
  // collection buckets silently leaves valid collection items behind.
  switch (top) {
    case "music":
      return "music"
    case "image-collections":
      return "image_collections"
    case "greenscreen_memes":
      return "greenscreen"
    case "slideshows":
      return "slideshows"
    case "ugc_avatar_videos":
      return "ugc_videos"
    case "backgrounds":
      return "backgrounds"
    case "assets":
      return "assets"
    case "product-collections":
      return "product_images"
    default:
      return "misc"
  }
}

function formatBucketCounts(files) {
  const counts = new Map()
  for (const file of files) {
    counts.set(file.bucketId, (counts.get(file.bucketId) || 0) + 1)
  }
  return [...counts.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([bucketId, count]) => `${bucketId}: ${count}`)
    .join(", ")
}

function parseCollectionRecord(row) {
  try {
    const record = JSON.parse(String(row.data || "null"))
    if (record && typeof record === "object" && !Array.isArray(record)) {
      return record
    }
  } catch {
    // Replaced by the actionable error below.
  }
  throw new Error(`Collection row ${row.$id} has invalid JSON data.`)
}

function ownedRowId(namespace, ownerId, rid, index) {
  const basis = `${namespace}:${ownerId}:${rid || `idx-${index}`}`
  return `u${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)}`
}

function publicRowId(namespace, rid, index) {
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(rid)) return rid
  const basis = `${namespace}:${rid || `idx-${index}`}`
  return `r${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)}`
}

async function runPool(items, concurrency, task) {
  let nextIndex = 0
  async function worker() {
    for (;;) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      await task(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  )
}

function clean(value) {
  return typeof value === "string" ? value.trim() : ""
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return ""
  const value = clean(process.argv[index + 1])
  if (!value) throw new Error(`${name} requires a value.`)
  return value
}
