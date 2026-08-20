import "server-only"

import path from "node:path"

import type { InputFile } from "node-appwrite/file"

import { getRailwayDatabase } from "@/lib/railway/database"
import {
  deleteRailwayObject,
  putRailwayObject,
  railwayObjectExists,
  railwayObjectKey,
  readRailwayObject,
} from "@/lib/railway/object-storage"

type StoredRow = Record<string, unknown> & {
  $id: string
  $createdAt: string
  $updatedAt: string
  $permissions: string[]
}

type ParsedQuery = {
  method: string
  attribute?: string
  values?: unknown[]
}

type JsonValue =
  | null
  | string
  | number
  | boolean
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined }

export class RailwayRecordStore {
  async listRows(_databaseId: string, tableId: string, queries: string[] = []) {
    const sql = getRailwayDatabase()
    const parsed = queries.map(parseQuery).filter(Boolean) as ParsedQuery[]
    const ownerIds = equalTextValues(parsed, "owner_id")
    const sourceKeys = equalTextValues(parsed, "source_key")
    const recordIds = equalTextValues(parsed, "rid")
    const statuses = equalTextValues(parsed, "status")
    const rows = await sql<Array<{ source_row: StoredRow; row_id: string }>>`
      SELECT source_row, row_id
      FROM domain_records
      WHERE table_name = ${tableId}
        ${ownerIds.length ? sql`AND owner_id IN ${sql(ownerIds)}` : sql``}
        ${sourceKeys.length ? sql`AND source_key IN ${sql(sourceKeys)}` : sql``}
        ${recordIds.length ? sql`AND rid IN ${sql(recordIds)}` : sql``}
        ${statuses.length ? sql`AND status IN ${sql(statuses)}` : sql``}
    `
    let filtered = rows.map((row) =>
      normalizeStoredRow(row.source_row, row.row_id)
    )

    for (const query of parsed) {
      if (
        query.method === "equal" ||
        query.method === "notEqual" ||
        query.method === "lessThan" ||
        query.method === "lessThanEqual"
      ) {
        filtered = filtered.filter((row) => matches(row, query))
      }
    }

    const orderQueries = parsed.filter(
      (query) => query.method === "orderAsc" || query.method === "orderDesc"
    )
    if (orderQueries.length > 0) {
      filtered.sort((left, right) => compareRows(left, right, orderQueries))
    } else {
      filtered.sort((left, right) => left.$id.localeCompare(right.$id))
    }

    const cursorAfter = parsed.find((query) => query.method === "cursorAfter")
      ?.values?.[0]
    if (cursorAfter) {
      const cursorIndex = filtered.findIndex(
        (row) => row.$id === String(cursorAfter)
      )
      if (cursorIndex >= 0) filtered = filtered.slice(cursorIndex + 1)
    }

    const total = filtered.length
    const offset = numberQuery(parsed, "offset", 0)
    const limit = numberQuery(parsed, "limit", 25)
    return {
      total,
      rows: filtered.slice(offset, offset + limit),
    }
  }

  async getRow(_databaseId: string, tableId: string, rowId: string) {
    const sql = getRailwayDatabase()
    const [row] = await sql<Array<{ source_row: StoredRow }>>`
      SELECT source_row
      FROM domain_records
      WHERE table_name = ${tableId} AND row_id = ${rowId}
    `
    if (!row) throw compatError(404, `Row ${tableId}/${rowId} was not found.`)
    return normalizeStoredRow(row.source_row, rowId)
  }

  async createRow(
    _databaseId: string,
    tableId: string,
    rowId: string,
    data: Record<string, unknown>,
    permissions: string[] = []
  ) {
    const sql = getRailwayDatabase()
    const [existing] = await sql<{ present: boolean }[]>`
      SELECT true AS present FROM domain_records
      WHERE table_name = ${tableId} AND row_id = ${rowId}
    `
    if (existing) throw compatError(409, `Row ${tableId}/${rowId} exists.`)
    return this.persist(tableId, rowId, data, permissions, null)
  }

  async upsertRow(
    _databaseId: string,
    tableId: string,
    rowId: string,
    data: Record<string, unknown>,
    permissions: string[] = []
  ) {
    const sql = getRailwayDatabase()
    const [existing] = await sql<Array<{ source_row: StoredRow }>>`
      SELECT source_row FROM domain_records
      WHERE table_name = ${tableId} AND row_id = ${rowId}
    `
    if (!existing) return this.persist(tableId, rowId, data, permissions, null)
    const current = normalizeStoredRow(existing.source_row, rowId)
    const systemKeys = new Set([
      "$id",
      "$createdAt",
      "$updatedAt",
      "$permissions",
    ])
    const fields = Object.fromEntries(
      Object.entries(current).filter(([key]) => !systemKeys.has(key))
    )
    return this.persist(
      tableId,
      rowId,
      { ...fields, ...data },
      permissions.length > 0 ? permissions : current.$permissions,
      current.$createdAt
    )
  }

  async updateRow(
    _databaseId: string,
    tableId: string,
    rowId: string,
    data: Record<string, unknown>
  ) {
    const current = await this.getRow(_databaseId, tableId, rowId)
    const systemKeys = new Set([
      "$id",
      "$createdAt",
      "$updatedAt",
      "$permissions",
    ])
    const fields = Object.fromEntries(
      Object.entries(current).filter(([key]) => !systemKeys.has(key))
    )
    return this.persist(
      tableId,
      rowId,
      { ...fields, ...data },
      current.$permissions,
      current.$createdAt
    )
  }

  async deleteRow(_databaseId: string, tableId: string, rowId: string) {
    const sql = getRailwayDatabase()
    const deleted = await sql`
      DELETE FROM domain_records
      WHERE table_name = ${tableId} AND row_id = ${rowId}
      RETURNING row_id
    `
    if (deleted.length === 0) {
      throw compatError(404, `Row ${tableId}/${rowId} was not found.`)
    }
    return {}
  }

  private async persist(
    tableId: string,
    rowId: string,
    data: Record<string, unknown>,
    permissions: string[],
    createdAt: string | null
  ) {
    const sql = getRailwayDatabase()
    const now = new Date().toISOString()
    const sourceRow: StoredRow = {
      $id: rowId,
      $createdAt: createdAt ?? now,
      $updatedAt: now,
      $permissions: permissions,
      ...data,
    }
    const payload = decodePayload(data.data, sourceRow)
    await sql`
      INSERT INTO domain_records (
        table_name, row_id, owner_id, source_key, rid, name, status, ord,
        payload, source_row, permissions, appwrite_created_at,
        appwrite_updated_at, migrated_at
      ) VALUES (
        ${tableId}, ${rowId}, ${text(data.owner_id)}, ${text(data.source_key)},
        ${text(data.rid)}, ${text(data.name)}, ${text(data.status)},
        ${integer(data.ord)}, ${sql.json(serializable(payload))},
        ${sql.json(serializable(sourceRow))}, ${sql.json(permissions)},
        ${sourceRow.$createdAt}, ${now}, now()
      )
      ON CONFLICT (table_name, row_id) DO UPDATE SET
        owner_id = excluded.owner_id,
        source_key = excluded.source_key,
        rid = excluded.rid,
        name = excluded.name,
        status = excluded.status,
        ord = excluded.ord,
        payload = excluded.payload,
        source_row = excluded.source_row,
        permissions = excluded.permissions,
        appwrite_updated_at = excluded.appwrite_updated_at,
        migrated_at = now()
    `
    return sourceRow
  }
}

export class RailwayObjectStore {
  async createFile(
    bucketOrInput:
      | string
      | {
          bucketId: string
          fileId: string
          file: InputFile
          permissions?: string[]
        },
    fileIdInput?: string,
    fileInput?: InputFile,
    permissionsInput: string[] = []
  ) {
    const input =
      typeof bucketOrInput === "object"
        ? bucketOrInput
        : {
            bucketId: bucketOrInput,
            fileId: String(fileIdInput),
            file: fileInput as InputFile,
            permissions: permissionsInput,
          }
    const key = railwayObjectKey(input.bucketId, input.fileId)
    if (await railwayObjectExists(key)) {
      throw compatError(409, `File ${input.bucketId}/${input.fileId} exists.`)
    }
    const size = await input.file.size()
    const bytes = Buffer.from(await input.file.slice(0, size))
    const now = new Date().toISOString()
    const mimeType = mimeTypeFor(input.file.filename)
    await putRailwayObject({ key, body: bytes, contentType: mimeType })

    const sql = getRailwayDatabase()
    const metadata = fileMetadata({
      bucketId: input.bucketId,
      fileId: input.fileId,
      name: input.file.filename,
      mimeType,
      size,
      createdAt: now,
      updatedAt: now,
      permissions: input.permissions ?? [],
    })
    await sql`
      INSERT INTO object_manifest (
        source_bucket_id, source_file_id, object_key, name, mime_type,
        size_bytes, appwrite_created_at, appwrite_updated_at, migrated_at,
        verified_at, source_file
      ) VALUES (
        ${input.bucketId}, ${input.fileId}, ${key}, ${input.file.filename},
        ${mimeType}, ${size}, ${now}, ${now}, now(), now(),
        ${sql.json(metadata)}
      )
      ON CONFLICT (source_bucket_id, source_file_id) DO UPDATE SET
        object_key = excluded.object_key,
        name = excluded.name,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        appwrite_updated_at = excluded.appwrite_updated_at,
        migrated_at = now(), verified_at = now(), source_file = excluded.source_file
    `
    return metadata
  }

  async getFile(
    bucketOrInput: string | { bucketId: string; fileId: string },
    fileIdInput?: string
  ) {
    const { bucketId, fileId } = storageIdentity(bucketOrInput, fileIdInput)
    const sql = getRailwayDatabase()
    const [row] = await sql<Array<{ source_file: Record<string, unknown> }>>`
      SELECT source_file FROM object_manifest
      WHERE source_bucket_id = ${bucketId} AND source_file_id = ${fileId}
    `
    if (
      !row ||
      !(await railwayObjectExists(railwayObjectKey(bucketId, fileId)))
    ) {
      throw compatError(404, `File ${bucketId}/${fileId} was not found.`)
    }
    return row.source_file
  }

  async getFileView(
    bucketOrInput: string | { bucketId: string; fileId: string },
    fileIdInput?: string
  ) {
    const { bucketId, fileId } = storageIdentity(bucketOrInput, fileIdInput)
    try {
      return await readRailwayObject(railwayObjectKey(bucketId, fileId))
    } catch (error) {
      if (status(error) === 404) {
        throw compatError(404, `File ${bucketId}/${fileId} was not found.`)
      }
      throw error
    }
  }

  async deleteFile(
    bucketOrInput: string | { bucketId: string; fileId: string },
    fileIdInput?: string
  ) {
    const { bucketId, fileId } = storageIdentity(bucketOrInput, fileIdInput)
    const key = railwayObjectKey(bucketId, fileId)
    if (!(await railwayObjectExists(key))) {
      throw compatError(404, `File ${bucketId}/${fileId} was not found.`)
    }
    await deleteRailwayObject(key)
    const sql = getRailwayDatabase()
    await sql`
      DELETE FROM object_manifest
      WHERE source_bucket_id = ${bucketId} AND source_file_id = ${fileId}
    `
    return {}
  }
}

// Kept for migration scripts and rollback code while Appwrite imports remain.
export const RailwayTablesCompat = RailwayRecordStore
export const RailwayStorageCompat = RailwayObjectStore

function parseQuery(query: string): ParsedQuery | null {
  try {
    const parsed = JSON.parse(query) as ParsedQuery
    return parsed && typeof parsed.method === "string" ? parsed : null
  } catch {
    return null
  }
}

function matches(row: StoredRow, query: ParsedQuery) {
  const actual = valueAt(row, query.attribute ?? "")
  const expected = query.values ?? []
  if (query.method === "equal") {
    return expected.some((value) => comparable(actual) === comparable(value))
  }
  if (query.method === "notEqual") {
    return expected.every((value) => comparable(actual) !== comparable(value))
  }
  const right = expected[0]
  if (query.method === "lessThan") return comparable(actual) < comparable(right)
  if (query.method === "lessThanEqual") {
    return comparable(actual) <= comparable(right)
  }
  return true
}

function compareRows(
  left: StoredRow,
  right: StoredRow,
  queries: ParsedQuery[]
) {
  for (const query of queries) {
    const leftValue = comparable(valueAt(left, query.attribute ?? ""))
    const rightValue = comparable(valueAt(right, query.attribute ?? ""))
    const result = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
    if (result !== 0) return query.method === "orderDesc" ? -result : result
  }
  return left.$id.localeCompare(right.$id)
}

function valueAt(row: StoredRow, attribute: string) {
  return attribute === "$id" ? row.$id : row[attribute]
}

function comparable(value: unknown): string | number {
  if (typeof value === "number") return value
  if (typeof value === "boolean") return value ? 1 : 0
  return String(value ?? "")
}

function numberQuery(queries: ParsedQuery[], method: string, fallback: number) {
  const value = Number(
    queries.find((query) => query.method === method)?.values?.[0]
  )
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function equalTextValues(queries: ParsedQuery[], attribute: string) {
  const query = queries.find(
    (candidate) =>
      candidate.method === "equal" && candidate.attribute === attribute
  )
  return (query?.values ?? [])
    .filter((value) => value != null && value !== "")
    .map(String)
}

function normalizeStoredRow(row: StoredRow, rowId: string): StoredRow {
  return {
    ...row,
    $id: String(row.$id || rowId),
    $createdAt: String(row.$createdAt || new Date(0).toISOString()),
    $updatedAt: String(
      row.$updatedAt || row.$createdAt || new Date(0).toISOString()
    ),
    $permissions: Array.isArray(row.$permissions) ? row.$permissions : [],
  }
}

function decodePayload(value: unknown, fallback: unknown) {
  if (typeof value !== "string") return value ?? fallback
  try {
    return JSON.parse(value) ?? fallback
  } catch {
    return { value }
  }
}

function text(value: unknown) {
  return value == null || value === "" ? null : String(value)
}

function integer(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

function serializable(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function compatError(code: number, message: string) {
  return Object.assign(new Error(message), { code, type: "railway_compat" })
}

function status(error: unknown) {
  return Number(
    (error as { $metadata?: { httpStatusCode?: number }; code?: number })
      .$metadata?.httpStatusCode ?? (error as { code?: number }).code
  )
}

function storageIdentity(
  bucketOrInput: string | { bucketId: string; fileId: string },
  fileIdInput?: string
) {
  return typeof bucketOrInput === "object"
    ? bucketOrInput
    : { bucketId: bucketOrInput, fileId: String(fileIdInput) }
}

function fileMetadata(input: {
  bucketId: string
  fileId: string
  name: string
  mimeType: string
  size: number
  createdAt: string
  updatedAt: string
  permissions: string[]
}) {
  return {
    $id: input.fileId,
    bucketId: input.bucketId,
    $createdAt: input.createdAt,
    $updatedAt: input.updatedAt,
    $permissions: input.permissions,
    name: input.name,
    signature: "",
    mimeType: input.mimeType,
    sizeOriginal: input.size,
    chunksTotal: 1,
    chunksUploaded: 1,
  }
}

function mimeTypeFor(filename: string) {
  const extension = path.extname(filename).toLowerCase()
  return (
    {
      ".gif": "image/gif",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".json": "application/json",
      ".mov": "video/quicktime",
      ".mp3": "audio/mpeg",
      ".mp4": "video/mp4",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".wav": "audio/wav",
      ".webm": "video/webm",
      ".webp": "image/webp",
      ".zip": "application/zip",
    }[extension] ?? "application/octet-stream"
  )
}
