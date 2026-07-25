/**
 * Copy project data between two already-provisioned Appwrite projects.
 *
 * The schema must be cloned first with clone-appwrite-schema.mjs. This script
 * preserves user, row, and file IDs so references embedded in stored JSON keep
 * working. Existing target records are updated/skipped, making the migration
 * safe to resume.
 *
 * Required environment:
 *   SRC_APPWRITE_ENDPOINT, SRC_APPWRITE_PROJECT_ID, SRC_APPWRITE_API_KEY
 *   APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY
 *
 * Optional:
 *   SRC_APPWRITE_DATABASE_ID, APPWRITE_DATABASE_ID (both default to "cfarm")
 */
import { Client, Query, Storage, TablesDB, Users } from "node-appwrite"

const sourceDatabaseId =
  process.env.SRC_APPWRITE_DATABASE_ID ||
  process.env.APPWRITE_DATABASE_ID ||
  "cfarm"
const targetDatabaseId = process.env.APPWRITE_DATABASE_ID || "cfarm"
const filesOnly = process.argv.includes("--files-only")
const bucketFilter = argumentValue("--bucket")
const excludedAutomationName = argumentValue("--exclude-automation-name")
const uploadChunkSize = 5 * 1024 * 1024
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const requiredEnvironment = [
  "SRC_APPWRITE_ENDPOINT",
  "SRC_APPWRITE_PROJECT_ID",
  "SRC_APPWRITE_API_KEY",
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
]

const missing = requiredEnvironment.filter(
  (key) => !String(process.env[key] || "").trim()
)
if (missing.length > 0) {
  throw new Error(`Missing required environment: ${missing.join(", ")}`)
}
if (
  process.env.SRC_APPWRITE_ENDPOINT === process.env.APPWRITE_ENDPOINT &&
  process.env.SRC_APPWRITE_PROJECT_ID === process.env.APPWRITE_PROJECT_ID
) {
  throw new Error("Source and target Appwrite projects must be different.")
}

const source = services("SRC_APPWRITE")
const target = services("APPWRITE")
const fallback =
  process.env.FALLBACK_APPWRITE_ENDPOINT &&
  process.env.FALLBACK_APPWRITE_PROJECT_ID &&
  process.env.FALLBACK_APPWRITE_API_KEY
    ? services("FALLBACK_APPWRITE")
    : null

if (!filesOnly) {
  await migrateUsers()
  await migrateRows()
}
await migrateFiles()

console.log("\nAppwrite data migration complete.")

function services(prefix) {
  const client = new Client()
    .setEndpoint(process.env[`${prefix}_ENDPOINT`])
    .setProject(process.env[`${prefix}_PROJECT_ID`])
    .setKey(process.env[`${prefix}_API_KEY`])
  return {
    users: new Users(client),
    tables: new TablesDB(client),
    storage: new Storage(client),
  }
}

async function migrateUsers() {
  const users = await listAll("users", (queries) =>
    source.users.list({ queries, total: false })
  )
  console.log(`Migrating ${users.length} users...`)
  for (const user of users) {
    let exists = true
    try {
      await target.users.get({ userId: user.$id })
    } catch (error) {
      if (Number(error?.code) !== 404) throw error
      exists = false
    }

    if (!exists) {
      await createUserWithPreservedPassword(user)
    }
    await target.users.updateName({
      userId: user.$id,
      name: user.name || "",
    })
    await target.users.updateLabels({
      userId: user.$id,
      labels: user.labels || [],
    })
    await target.users.updatePrefs({
      userId: user.$id,
      prefs: user.prefs || {},
    })
    await target.users.updateStatus({
      userId: user.$id,
      status: Boolean(user.status),
    })
    await target.users.updateEmailVerification({
      userId: user.$id,
      emailVerification: Boolean(user.emailVerification),
    })
    if (user.phone) {
      await target.users.updatePhoneVerification({
        userId: user.$id,
        phoneVerification: Boolean(user.phoneVerification),
      })
    }
    console.log(`  user ${user.$id}: ${exists ? "updated" : "created"}`)
  }
}

async function createUserWithPreservedPassword(user) {
  const common = {
    userId: user.$id,
    email: user.email || undefined,
    name: user.name || undefined,
  }
  if (!user.password || !user.hash) {
    await target.users.create({
      ...common,
      phone: user.phone || undefined,
    })
    return
  }

  switch (String(user.hash).toLowerCase()) {
    case "argon2":
      await target.users.createArgon2User({
        ...common,
        password: user.password,
      })
      return
    case "bcrypt":
      await target.users.createBcryptUser({
        ...common,
        password: user.password,
      })
      return
    case "md5":
      await target.users.createMD5User({
        ...common,
        password: user.password,
      })
      return
    case "phpass":
      await target.users.createPHPassUser({
        ...common,
        password: user.password,
      })
      return
    default:
      throw new Error(
        `Cannot preserve unsupported password hash "${user.hash}" for user ${user.$id}.`
      )
  }
}

async function migrateRows() {
  const tables = await listAll("tables", (queries) =>
    source.tables.listTables({
      databaseId: sourceDatabaseId,
      queries,
      total: false,
    })
  )
  console.log(`\nMigrating rows from ${tables.length} tables...`)
  for (const table of tables) {
    let rows = await listAll("rows", (queries) =>
      source.tables.listRows({
        databaseId: sourceDatabaseId,
        tableId: table.$id,
        queries,
        total: false,
      })
    )
    if (table.$id === "automations" && excludedAutomationName) {
      const before = rows.length
      rows = rows.filter(
        (row) => automationRowName(row) !== excludedAutomationName
      )
      if (rows.length !== before) {
        console.log(
          `  automations: excluded ${before - rows.length} row named ` +
            `"${excludedAutomationName}"`
        )
      }
    }
    let completed = 0
    await runPool(rows, 8, async (row) => {
      const data = Object.fromEntries(
        Object.entries(row).filter(([key]) => !key.startsWith("$"))
      )
      await target.tables.upsertRow({
        databaseId: targetDatabaseId,
        tableId: table.$id,
        rowId: row.$id,
        data,
        permissions: row.$permissions || [],
      })
      completed += 1
      if (completed % 250 === 0) {
        console.log(`  ${table.$id}: ${completed}/${rows.length}`)
      }
    })
    console.log(`  ${table.$id}: ${rows.length}`)
  }
}

async function migrateFiles() {
  const buckets = await listAll("buckets", (queries) =>
    source.storage.listBuckets({ queries, total: false })
  )
  const selectedBuckets = bucketFilter
    ? buckets.filter((bucket) => bucket.$id === bucketFilter)
    : buckets
  if (bucketFilter && selectedBuckets.length === 0) {
    throw new Error(`Source bucket "${bucketFilter}" does not exist.`)
  }
  console.log(`\nMigrating files from ${selectedBuckets.length} buckets...`)
  for (const bucket of selectedBuckets) {
    const files = await listAll("files", (queries) =>
      source.storage.listFiles({
        bucketId: bucket.$id,
        queries,
        total: false,
      })
    )
    let copied = 0
    let skipped = 0
    let completed = 0
    await runPool(files, 3, async (file) => {
      const result = await ensureFile(bucket.$id, file)
      if (result === "skipped") {
        skipped += 1
      } else {
        copied += 1
      }
      completed += 1
      if (completed % 100 === 0) {
        console.log(
          `  ${bucket.$id}: ${completed}/${files.length} (${copied} copied, ${skipped} existing)`
        )
      }
    })
    console.log(
      `  ${bucket.$id}: ${files.length} (${copied} copied, ${skipped} existing)`
    )
  }
}

async function ensureFile(bucketId, file) {
  const existing = await getTargetFile(bucketId, file.$id)
  if (isCompleteFile(existing)) {
    return "skipped"
  }

  let download
  try {
    download = await retryCall(() =>
      source.storage.getFileDownload({
        bucketId,
        fileId: file.$id,
      })
    )
  } catch (error) {
    if (Number(error?.code) !== 404 || !fallback) throw error
    download = await retryCall(() =>
      fallback.storage.getFileDownload({
        bucketId,
        fileId: file.$id,
      })
    )
    console.log(`  ${bucketId}/${file.$id}: recovered from fallback storage`)
  }
  const bytes = Buffer.from(download)
  await uploadFileSequential(bucketId, file, bytes, existing)
  return "copied"
}

async function uploadFileSequential(bucketId, file, bytes, existing) {
  const totalChunks = Math.ceil(bytes.length / uploadChunkSize)
  let nextChunk = existing ? Number(existing.chunksUploaded) : 0

  while (nextChunk < totalChunks) {
    const start = nextChunk * uploadChunkSize
    const end = Math.min(start + uploadChunkSize, bytes.length)
    const form = new FormData()
    form.append("fileId", file.$id)
    form.append(
      "file",
      new File([bytes.subarray(start, end)], file.name, {
        type: file.mimeType || "application/octet-stream",
      })
    )
    for (const permission of file.$permissions || []) {
      form.append("permissions[]", permission)
    }

    await retryCall(
      async () => {
        const response = await fetch(
          `${process.env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/storage/buckets/${encodeURIComponent(bucketId)}/files`,
          {
            method: "POST",
            headers: {
              "X-Appwrite-Project": process.env.APPWRITE_PROJECT_ID,
              "X-Appwrite-Key": process.env.APPWRITE_API_KEY,
              "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}`,
              ...(nextChunk > 0 ? { "X-Appwrite-ID": file.$id } : {}),
            },
            body: form,
          }
        )
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          const error = new Error(
            body.message || `Upload failed with HTTP ${response.status}.`
          )
          error.code = response.status
          throw error
        }
      },
      async () => {
        const current = await getTargetFile(bucketId, file.$id).catch(
          () => null
        )
        return Number(current?.chunksUploaded) > nextChunk
      }
    )
    nextChunk += 1
  }

  const completed = await getTargetFile(bucketId, file.$id)
  if (!isCompleteFile(completed)) {
    throw new Error(
      `Upload remained incomplete for ${bucketId}/${file.$id}: ` +
        `${completed?.chunksUploaded || 0}/${completed?.chunksTotal || totalChunks} chunks.`
    )
  }
}

async function getTargetFile(bucketId, fileId) {
  try {
    return await target.storage.getFile({ bucketId, fileId })
  } catch (error) {
    if (Number(error?.code) === 404) return null
    throw error
  }
}

function isRetryable(error) {
  const code = Number(error?.code)
  return (
    !Number.isFinite(code) ||
    code === 408 ||
    code === 409 ||
    code === 429 ||
    code >= 500
  )
}

function isCompleteFile(file) {
  return (
    file &&
    Number(file.chunksUploaded) === Number(file.chunksTotal) &&
    Number(file.chunksTotal) > 0
  )
}

async function retryCall(task, succeededAfterError = async () => false) {
  let lastError
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (await succeededAfterError()) return
      if (attempt === 6 || !isRetryable(error)) throw error
      await sleep(Math.min(15_000, 750 * 2 ** (attempt - 1)))
    }
  }
  throw lastError
}

async function listAll(field, fetchPage) {
  const records = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await fetchPage(queries)
    const items = page[field] || []
    records.push(...items)
    if (items.length < 100) return records
    cursor = items.at(-1).$id
  }
}

async function runPool(items, concurrency, task) {
  let index = 0
  async function worker() {
    for (;;) {
      const current = index
      index += 1
      if (current >= items.length) return
      await task(items[current])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  )
}

function argumentValue(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return ""
  const value = String(process.argv[index + 1] || "").trim()
  if (!value) throw new Error(`${name} requires a value.`)
  return value
}

function automationRowName(row) {
  if (typeof row?.name === "string") return row.name
  try {
    const data =
      typeof row?.data === "string" ? JSON.parse(row.data) : row?.data
    return typeof data?.name === "string" ? data.name : ""
  } catch {
    return ""
  }
}
