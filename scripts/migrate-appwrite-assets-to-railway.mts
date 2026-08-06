import { createHash, randomUUID } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { parseEnv } from "node:util"

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { Client, Query, Storage } from "node-appwrite"
import postgres, { type Sql } from "postgres"

type SourceFile = {
  $id: string
  $createdAt?: string
  $updatedAt?: string
  name: string
  mimeType?: string
  sizeOriginal?: number
  signature?: string
}

const argv = process.argv.slice(2)
const args = new Set(argv)
const apply = args.has("--apply")
const restart = args.has("--restart")
const verifyExisting = args.has("--verify-existing")
const sourceEnvPath = path.resolve(valueArg("source-env") || ".env")
const batchSize = boundedNumber(valueArg("batch-size"), 100, 1, 100)
const concurrency = boundedNumber(valueArg("concurrency"), 8, 1, 16)
const operationTimeoutMs = boundedNumber(
  valueArg("timeout-ms"),
  60_000,
  5_000,
  300_000
)
const onlyBuckets = valueArg("only")
  ?.split(",")
  .map((value) => value.trim())
  .filter(Boolean)

loadSourceEnvironment(sourceEnvPath)

const sourceProjectId = required("APPWRITE_PROJECT_ID")
const source = new Client()
  .setEndpoint(required("APPWRITE_ENDPOINT"))
  .setProject(sourceProjectId)
  .setKey(required("APPWRITE_API_KEY"))
const storage = new Storage(source)
const buckets = onlyBuckets
  ? onlyBuckets.map((bucketId) => ({ $id: bucketId, name: bucketId }))
  : await listBuckets()
const inventory: Array<{ bucket: string; name: string; files: number }> = []

for (const bucket of buckets) {
  inventory.push({
    bucket: bucket.$id,
    name: bucket.name,
    files: await countBucketFiles(bucket.$id),
  })
}

if (!apply) {
  console.log(
    JSON.stringify(
      {
        mode: "inventory",
        sourceProjectId,
        buckets: inventory,
        totalFiles: inventory.reduce((sum, item) => sum + item.files, 0),
        next: "Run with --apply and Railway DATABASE_URL plus bucket credentials.",
      },
      null,
      2
    )
  )
  process.exit(0)
}

const sql = postgres(required("DATABASE_URL"), { max: 5, prepare: false })
const s3 = new S3Client({
  endpoint: requiredAny(
    "RAILWAY_BUCKET_ENDPOINT",
    "AWS_ENDPOINT_URL",
    "ENDPOINT"
  ),
  region:
    valueAny("RAILWAY_BUCKET_REGION", "AWS_DEFAULT_REGION", "REGION") || "auto",
  forcePathStyle:
    (valueAny("AWS_S3_URL_STYLE", "RAILWAY_BUCKET_URL_STYLE") || "virtual") ===
    "path",
  credentials: {
    accessKeyId: requiredAny(
      "RAILWAY_BUCKET_ACCESS_KEY_ID",
      "AWS_ACCESS_KEY_ID",
      "ACCESS_KEY_ID"
    ),
    secretAccessKey: requiredAny(
      "RAILWAY_BUCKET_SECRET_ACCESS_KEY",
      "AWS_SECRET_ACCESS_KEY",
      "SECRET_ACCESS_KEY"
    ),
  },
})
const targetBucket = requiredAny(
  "RAILWAY_BUCKET_NAME",
  "AWS_S3_BUCKET_NAME",
  "BUCKET"
)
const runId = `assets-${randomUUID()}`
let migratedCount = 0
let skippedCount = 0
let failedCount = 0

try {
  await assertMigrationSchema(sql)
  if (restart) {
    await sql`
      DELETE FROM migration_checkpoints
      WHERE migration_kind = 'appwrite-assets'
        AND source_scope IN ${sql(inventory.map((item) => item.bucket))}
    `
  }
  await sql`
    INSERT INTO migration_runs (
      id, migration_kind, source_project_id, status, source_count, details
    ) VALUES (
      ${runId}, 'appwrite-assets', ${sourceProjectId}, 'running',
      ${inventory.reduce((sum, item) => sum + item.files, 0)},
      ${sql.json({ targetBucket, buckets: inventory })}
    )
  `

  for (const item of inventory) {
    const result = await migrateBucket(item.bucket, sql)
    migratedCount += result.migrated
    skippedCount += result.skipped
    failedCount += result.failed
  }

  const verification = await verifyCounts(sql)
  const sourceCovered = verification.every((item) => item.sourceCovered)
  const status =
    failedCount > 0
      ? "completed_with_failures"
      : sourceCovered
        ? "succeeded"
        : "completed_with_mismatch"
  await sql`
    UPDATE migration_runs
    SET status = ${status}, completed_at = now(),
        migrated_count = ${migratedCount}, skipped_count = ${skippedCount},
        failed_count = ${failedCount},
        details = details || ${sql.json({ verification })}
    WHERE id = ${runId}
  `
  console.log(
    JSON.stringify(
      { status, runId, migratedCount, skippedCount, failedCount, verification },
      null,
      2
    )
  )
  if (failedCount > 0 || !sourceCovered) process.exitCode = 1
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  await sql`
    UPDATE migration_runs
    SET status = 'failed', completed_at = now(),
        migrated_count = ${migratedCount}, skipped_count = ${skippedCount},
        failed_count = ${failedCount + 1},
        details = details || ${sql.json({ fatalError: message })}
    WHERE id = ${runId}
  `.catch(() => undefined)
  throw error
} finally {
  await sql.end({ timeout: 5 })
}

async function migrateBucket(bucketId: string, sqlClient: Sql) {
  let cursor = restart ? null : await checkpoint(sqlClient, bucketId)
  let migrated = 0
  let skipped = 0
  let failed = 0

  for (;;) {
    const previousCursor = cursor
    const queries = [Query.limit(batchSize)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await retrySource(() =>
      storage.listFiles({ bucketId, queries, total: true })
    )
    const files = page.files as SourceFile[]
    if (files.length === 0) break

    const outcomes = await mapPool(files, concurrency, async (file) => {
      const fileId = String(file.$id || "")
      const key = objectKey(bucketId, fileId || "missing-id")
      try {
        if (!fileId) throw new Error("Appwrite returned a file without an id.")
        const known = await manifestMatchesSource(
          sqlClient,
          bucketId,
          fileId,
          file
        )
        const present = known && (!verifyExisting || (await objectExists(key)))
        if (present) {
          return "skipped" as const
        } else {
          const bytes = Buffer.from(
            await retrySource(() =>
              storage.getFileDownload({ bucketId, fileId })
            )
          )
          const checksum = createHash("sha256").update(bytes).digest("hex")
          await retryOperation(() =>
            s3.send(
              new PutObjectCommand({
                Bucket: targetBucket,
                Key: key,
                Body: bytes,
                ContentType: file.mimeType,
                Metadata: {
                  "appwrite-bucket-id": bucketId,
                  "appwrite-file-id": fileId,
                  sha256: checksum,
                },
              })
            )
          )
          await sqlClient`
            INSERT INTO object_manifest (
              source_bucket_id, source_file_id, object_key, name, mime_type,
              size_bytes, checksum, appwrite_created_at, appwrite_updated_at,
              migrated_at, verified_at, source_file
            ) VALUES (
              ${bucketId}, ${fileId}, ${key}, ${file.name || fileId},
              ${file.mimeType ?? null}, ${file.sizeOriginal ?? bytes.length},
              ${checksum}, ${timestamp(file.$createdAt)},
              ${timestamp(file.$updatedAt)}, now(), now(),
              ${sqlClient.json(serializable(file))}
            )
            ON CONFLICT (source_bucket_id, source_file_id) DO UPDATE SET
              object_key = excluded.object_key,
              name = excluded.name,
              mime_type = excluded.mime_type,
              size_bytes = excluded.size_bytes,
              checksum = excluded.checksum,
              appwrite_created_at = excluded.appwrite_created_at,
              appwrite_updated_at = excluded.appwrite_updated_at,
              migrated_at = now(), verified_at = now(),
              source_file = excluded.source_file
          `
          return "migrated" as const
        }
      } catch (error) {
        const message = errorMessage(error)
        await sqlClient`
          INSERT INTO migration_failures (
            migration_run_id, source_scope, source_id, message, details
          ) VALUES (
            ${runId}, ${bucketId}, ${fileId || null}, ${message},
            ${sqlClient.json({ name: file.name || fileId || "unknown", objectKey: key })}
          )
        `
        return "failed" as const
      }
    })

    const batchMigrated = outcomes.filter(
      (outcome) => outcome === "migrated"
    ).length
    const batchSkipped = outcomes.filter(
      (outcome) => outcome === "skipped"
    ).length
    const batchFailed = outcomes.filter(
      (outcome) => outcome === "failed"
    ).length
    migrated += batchMigrated
    skipped += batchSkipped
    failed += batchFailed
    const firstFailure = outcomes.findIndex((outcome) => outcome === "failed")
    cursor =
      firstFailure < 0
        ? (files.at(-1)?.$id ?? cursor)
        : firstFailure === 0
          ? previousCursor
          : (files[firstFailure - 1]?.$id ?? previousCursor)

    await writeCheckpoint(
      sqlClient,
      bucketId,
      cursor,
      page.total,
      batchMigrated + batchSkipped
    )
    console.log(
      `bucket ${bucketId}: ${migrated} migrated, ${skipped} skipped, ${failed} failed`
    )
    if (batchFailed > 0) break
    if (files.length < batchSize) break
  }
  return { migrated, skipped, failed }
}

async function manifestMatchesSource(
  sqlClient: Sql,
  bucketId: string,
  fileId: string,
  sourceFile: SourceFile
): Promise<boolean> {
  const [row] = await sqlClient<
    Array<{
      migrated: boolean
      signature: string | null
      updated_at: Date | null
      size_bytes: string | null
    }>
  >`
    SELECT migrated_at IS NOT NULL AS migrated,
      source_file ->> 'signature' AS signature,
      appwrite_updated_at AS updated_at,
      size_bytes::text AS size_bytes
    FROM object_manifest
    WHERE source_bucket_id = ${bucketId} AND source_file_id = ${fileId}
  `
  if (!row?.migrated) return false
  if (sourceFile.signature && row.signature !== sourceFile.signature) {
    return false
  }
  if (
    sourceFile.$updatedAt &&
    row.updated_at?.toISOString() !==
      timestamp(sourceFile.$updatedAt)?.toISOString()
  ) {
    return false
  }
  if (
    sourceFile.sizeOriginal != null &&
    Number(row.size_bytes) !== sourceFile.sizeOriginal
  ) {
    return false
  }
  return true
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: targetBucket, Key: key }))
    return true
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode
    if (status === 404) return false
    throw error
  }
}

async function checkpoint(sqlClient: Sql, scope: string) {
  const [row] = await sqlClient<{ last_source_id: string | null }[]>`
    SELECT last_source_id FROM migration_checkpoints
    WHERE migration_kind = 'appwrite-assets' AND source_scope = ${scope}
  `
  return row?.last_source_id ?? null
}

async function writeCheckpoint(
  sqlClient: Sql,
  scope: string,
  cursor: string | null,
  sourceCount: number,
  migratedDelta: number
) {
  await sqlClient`
    INSERT INTO migration_checkpoints (
      migration_kind, source_scope, last_source_id, source_count,
      migrated_count, updated_at
    ) VALUES (
      'appwrite-assets', ${scope}, ${cursor}, ${sourceCount},
      ${migratedDelta}, now()
    )
    ON CONFLICT (migration_kind, source_scope) DO UPDATE SET
      last_source_id = excluded.last_source_id,
      source_count = excluded.source_count,
      migrated_count = migration_checkpoints.migrated_count + excluded.migrated_count,
      updated_at = now()
  `
}

async function verifyCounts(sqlClient: Sql) {
  const rows = await sqlClient<
    Array<{ source_bucket_id: string; count: string }>
  >`
    SELECT source_bucket_id, count(*)::text AS count
    FROM object_manifest WHERE migrated_at IS NOT NULL
    GROUP BY source_bucket_id
  `
  const targets = new Map(
    rows.map((row) => [row.source_bucket_id, Number(row.count)])
  )
  return inventory.map((item) => ({
    bucket: item.bucket,
    source: item.files,
    target: targets.get(item.bucket) ?? 0,
    matches: item.files === (targets.get(item.bucket) ?? 0),
    sourceCovered: item.files <= (targets.get(item.bucket) ?? 0),
  }))
}

async function assertMigrationSchema(sqlClient: Sql) {
  const [row] = await sqlClient<{ present: boolean }[]>`
    SELECT to_regclass('public.object_manifest') IS NOT NULL AS present
  `
  if (!row?.present) {
    throw new Error(
      "Railway schema is missing. Run pnpm railway:db:migrate first."
    )
  }
}

async function listBuckets() {
  const output: Array<{ $id: string; name: string }> = []
  let cursor: string | null = null
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await retrySource(() => storage.listBuckets(queries))
    output.push(
      ...page.buckets.map((bucket) => ({ $id: bucket.$id, name: bucket.name }))
    )
    if (page.buckets.length < 100) break
    cursor = page.buckets.at(-1)?.$id ?? null
  }
  return output
}

async function countBucketFiles(bucketId: string) {
  let count = 0
  let cursor: string | null = null
  for (;;) {
    const queries = [Query.limit(batchSize)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await retrySource(() =>
      storage.listFiles({ bucketId, queries, total: false })
    )
    count += page.files.length
    if (page.files.length < batchSize) return count
    cursor = page.files.at(-1)?.$id ?? null
    if (!cursor) return count
  }
}

function objectKey(bucketId: string, fileId: string) {
  return `appwrite/${encodeURIComponent(bucketId)}/${encodeURIComponent(fileId)}`
}

function serializable(value: unknown) {
  return JSON.parse(JSON.stringify(value))
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name || "Error"
  return String(error ?? "Unknown migration error")
}

async function mapPool<T, R>(
  items: T[],
  workerCount: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: Math.min(workerCount, items.length) }, async () => {
      for (;;) {
        const index = nextIndex
        nextIndex += 1
        if (index >= items.length) return
        results[index] = await work(items[index])
      }
    })
  )
  return results
}

function valueArg(name: string) {
  return argv.find((value) => value.startsWith(`--${name}=`))?.split("=", 2)[1]
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = Number(value ?? fallback)
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed)))
    : fallback
}

function timestamp(value: unknown) {
  if (!value) return null
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function valueAny(...names: string[]) {
  for (const name of names) {
    if (process.env[name]) return process.env[name]
  }
  return undefined
}

function requiredAny(...names: string[]) {
  const value = valueAny(...names)
  if (!value) throw new Error(`${names.join(" or ")} is required.`)
  return value
}

function loadSourceEnvironment(filePath: string) {
  if (!existsSync(filePath)) return
  const values = parseEnv(readFileSync(filePath, "utf8"))
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] == null) process.env[key] = value
  }
}

async function retrySource<T>(work: () => Promise<T>): Promise<T> {
  return retryOperation(work)
}

async function retryOperation<T>(work: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await withTimeout(work(), operationTimeoutMs)
    } catch (error) {
      lastError = error
      const code = Number((error as { code?: number }).code)
      if (code > 0 && code < 429) throw error
      if (attempt < 4) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(4_000, 250 * 2 ** attempt))
        )
      }
    }
  }
  throw lastError
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms.`)),
          timeoutMs
        )
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
