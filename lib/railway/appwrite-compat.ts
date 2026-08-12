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

export type ParsedQuery = {
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

export class RailwayTablesCompat {
  async listRows(_databaseId: string, tableId: string, queries: string[] = []) {
    const sql = getRailwayDatabase()
    const parsed = queries.map(parseQuery).filter(Boolean) as ParsedQuery[]
    const query = buildListRowsQuery(tableId, parsed)
    const [page] = await sql.unsafe<
      Array<{
        total: number | string
        rows: Array<{ source_row: StoredRow; row_id: string }>
      }>
    >(query.text, query.parameters)
    return {
      total: Number(page?.total ?? 0),
      rows: (page?.rows ?? []).map((row) =>
        normalizeStoredRow(row.source_row, row.row_id)
      ),
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
    const now = new Date().toISOString()
    const fields = mutationData(data)
    const sourceRow = storedRow(rowId, fields, permissions, now)
    const payload = decodePayload(fields.data, sourceRow)
    const inserted = await sql<Array<{ source_row: StoredRow }>>`
      INSERT INTO domain_records (
        table_name, row_id, owner_id, source_key, rid, name, status, ord,
        payload, source_row, permissions, appwrite_created_at,
        appwrite_updated_at, migrated_at
      ) VALUES (
        ${tableId}, ${rowId}, ${text(fields.owner_id)}, ${text(fields.source_key)},
        ${text(fields.rid)}, ${text(fields.name)}, ${text(fields.status)},
        ${integer(fields.ord)}, ${sql.json(serializable(payload))},
        ${sql.json(serializable(sourceRow))}, ${sql.json(permissions)},
        ${now}, ${now}, now()
      )
      ON CONFLICT (table_name, row_id) DO NOTHING
      RETURNING source_row
    `
    if (inserted.length === 0) {
      throw compatError(409, `Row ${tableId}/${rowId} exists.`)
    }
    return normalizeStoredRow(inserted[0].source_row, rowId)
  }

  async upsertRow(
    _databaseId: string,
    tableId: string,
    rowId: string,
    data: Record<string, unknown>,
    permissions: string[] = []
  ) {
    const sql = getRailwayDatabase()
    const now = new Date().toISOString()
    const fields = mutationData(data)
    const sourceRow = storedRow(rowId, fields, permissions, now)
    const patch = {
      ...fields,
      $updatedAt: now,
      ...(permissions.length > 0 ? { $permissions: permissions } : {}),
    }
    const payload = decodePayload(fields.data, sourceRow)
    const hasPayload = Object.hasOwn(fields, "data")
    const [saved] = await sql<Array<{ source_row: StoredRow }>>`
      INSERT INTO domain_records (
        table_name, row_id, owner_id, source_key, rid, name, status, ord,
        payload, source_row, permissions, appwrite_created_at,
        appwrite_updated_at, migrated_at
      ) VALUES (
        ${tableId}, ${rowId}, ${text(fields.owner_id)}, ${text(fields.source_key)},
        ${text(fields.rid)}, ${text(fields.name)}, ${text(fields.status)},
        ${integer(fields.ord)}, ${sql.json(serializable(payload))},
        ${sql.json(serializable(sourceRow))}, ${sql.json(permissions)},
        ${now}, ${now}, now()
      )
      ON CONFLICT (table_name, row_id) DO UPDATE SET
        owner_id = NULLIF((domain_records.source_row || ${sql.json(serializable(patch))}) ->> 'owner_id', ''),
        source_key = NULLIF((domain_records.source_row || ${sql.json(serializable(patch))}) ->> 'source_key', ''),
        rid = NULLIF((domain_records.source_row || ${sql.json(serializable(patch))}) ->> 'rid', ''),
        name = NULLIF((domain_records.source_row || ${sql.json(serializable(patch))}) ->> 'name', ''),
        status = NULLIF((domain_records.source_row || ${sql.json(serializable(patch))}) ->> 'status', ''),
        ord = safe_bigint((domain_records.source_row || ${sql.json(serializable(patch))}) ->> 'ord'),
        payload = CASE WHEN ${hasPayload} THEN ${sql.json(serializable(payload))} ELSE domain_records.payload END,
        source_row = domain_records.source_row || ${sql.json(serializable(patch))},
        permissions = CASE WHEN ${permissions.length > 0} THEN ${sql.json(permissions)} ELSE domain_records.permissions END,
        appwrite_updated_at = ${now},
        migrated_at = now()
      RETURNING source_row
    `
    return normalizeStoredRow(saved.source_row, rowId)
  }

  async updateRow(
    _databaseId: string,
    tableId: string,
    rowId: string,
    data: Record<string, unknown>
  ) {
    const sql = getRailwayDatabase()
    const now = new Date().toISOString()
    const fields = mutationData(data)
    const patch = { ...fields, $updatedAt: now }
    const hasPayload = Object.hasOwn(fields, "data")
    const payload = decodePayload(fields.data, fields)
    const updated = await sql<Array<{ source_row: StoredRow }>>`
      UPDATE domain_records
      SET
        owner_id = NULLIF((source_row || ${sql.json(serializable(patch))}) ->> 'owner_id', ''),
        source_key = NULLIF((source_row || ${sql.json(serializable(patch))}) ->> 'source_key', ''),
        rid = NULLIF((source_row || ${sql.json(serializable(patch))}) ->> 'rid', ''),
        name = NULLIF((source_row || ${sql.json(serializable(patch))}) ->> 'name', ''),
        status = NULLIF((source_row || ${sql.json(serializable(patch))}) ->> 'status', ''),
        ord = safe_bigint((source_row || ${sql.json(serializable(patch))}) ->> 'ord'),
        payload = CASE WHEN ${hasPayload} THEN ${sql.json(serializable(payload))} ELSE payload END,
        source_row = source_row || ${sql.json(serializable(patch))},
        appwrite_updated_at = ${now},
        migrated_at = now()
      WHERE table_name = ${tableId} AND row_id = ${rowId}
      RETURNING source_row
    `
    if (updated.length === 0) {
      throw compatError(404, `Row ${tableId}/${rowId} was not found.`)
    }
    return normalizeStoredRow(updated[0].source_row, rowId)
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

  async claimJobs(input: {
    workerId: string
    limit: number
    leaseUntil: string
    now: string
    includeTypes?: string[]
    excludeTypes?: string[]
  }) {
    const sql = getRailwayDatabase()
    const limit = Math.max(1, Math.min(100, Math.floor(input.limit)))
    const includeTypes = input.includeTypes?.filter(Boolean) ?? []
    const excludeTypes = input.excludeTypes?.filter(Boolean) ?? []
    const includeTypeFilter =
      includeTypes.length > 0
        ? sql`AND source_row ->> 'type' = ANY(${sql.array(includeTypes, 25)})`
        : sql``
    const excludeTypeFilter =
      excludeTypes.length > 0
        ? sql`AND COALESCE(source_row ->> 'type', '') <> ALL(${sql.array(excludeTypes, 25)})`
        : sql``
    const rows = await sql<Array<{ source_row: StoredRow; row_id: string }>>`
      WITH candidates AS (
        SELECT row_id
        FROM domain_records
        WHERE table_name = 'jobs'
          AND (
            (
              status = 'queued'
              AND COALESCE(source_row ->> 'available_at', source_row ->> 'created_at', '1970-01-01T00:00:00.000Z') <= ${input.now}
            ) OR (
              status = 'processing'
              AND COALESCE(source_row ->> 'leased_until', '1970-01-01T00:00:00.000Z') < ${input.now}
            )
          )
          ${includeTypeFilter}
          ${excludeTypeFilter}
        ORDER BY safe_bigint(source_row ->> 'priority') DESC NULLS LAST,
          COALESCE(source_row ->> 'available_at', source_row ->> 'created_at') ASC,
          row_id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      UPDATE domain_records AS jobs
      SET status = 'processing',
          source_row = jobs.source_row || jsonb_build_object(
            'status', 'processing',
            'leased_by', (${input.workerId})::text,
            'leased_until', (${input.leaseUntil})::text,
            'attempts', COALESCE(safe_bigint(jobs.source_row ->> 'attempts'), 0) + 1,
            'updated_at', (${input.now})::text,
            '$updatedAt', (${input.now})::text
          ),
          appwrite_updated_at = ${input.now},
          migrated_at = now()
      FROM candidates
      WHERE jobs.table_name = 'jobs' AND jobs.row_id = candidates.row_id
      RETURNING jobs.source_row, jobs.row_id
    `
    return rows.map((row) => normalizeStoredRow(row.source_row, row.row_id))
  }

  async deleteTerminalJobsBefore(cutoff: string, limit = 500) {
    const sql = getRailwayDatabase()
    const boundedLimit = Math.max(1, Math.min(5_000, Math.floor(limit)))
    const deleted = await sql<Array<{ row_id: string }>>`
      WITH expired AS (
        SELECT row_id
        FROM domain_records
        WHERE table_name = 'jobs'
          AND status IN ('completed', 'dead', 'failed')
          AND COALESCE(source_row ->> 'updated_at', source_row ->> '$updatedAt') < ${cutoff}
        ORDER BY COALESCE(source_row ->> 'updated_at', source_row ->> '$updatedAt') ASC
        LIMIT ${boundedLimit}
      )
      DELETE FROM domain_records AS jobs
      USING expired
      WHERE jobs.table_name = 'jobs' AND jobs.row_id = expired.row_id
      RETURNING jobs.row_id
    `
    return deleted.length
  }

  async replaceRows(input: {
    tableId: string
    parentAttribute: string
    parentValue: string
    rows: Array<{
      rowId: string
      data: Record<string, unknown>
      permissions?: string[]
    }>
  }) {
    if (!/^[A-Za-z0-9_$.-]+$/.test(input.parentAttribute)) {
      throw new Error("Invalid replacement parent attribute")
    }
    const sql = getRailwayDatabase()
    const now = new Date().toISOString()
    await sql.begin(async (tx) => {
      await tx`
        DELETE FROM domain_records
        WHERE table_name = ${input.tableId}
          AND source_row ->> ${input.parentAttribute} = ${input.parentValue}
      `
      for (const row of input.rows) {
        const permissions = row.permissions ?? []
        const sourceRow = storedRow(row.rowId, row.data, permissions, now)
        const payload = decodePayload(row.data.data, sourceRow)
        await tx`
          INSERT INTO domain_records (
            table_name, row_id, owner_id, source_key, rid, name, status, ord,
            payload, source_row, permissions, appwrite_created_at,
            appwrite_updated_at, migrated_at
          ) VALUES (
            ${input.tableId}, ${row.rowId}, ${text(row.data.owner_id)},
            ${text(row.data.source_key)}, ${text(row.data.rid)},
            ${text(row.data.name)}, ${text(row.data.status)},
            ${integer(row.data.ord)}, ${tx.json(serializable(payload))},
            ${tx.json(serializable(sourceRow))}, ${tx.json(permissions)},
            ${now}, ${now}, now()
          )
        `
      }
    })
  }
}

export class RailwayStorageCompat {
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
      const bytes = await readRailwayObject(railwayObjectKey(bucketId, fileId))
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      )
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

function parseQuery(query: string): ParsedQuery | null {
  try {
    const parsed = JSON.parse(query) as ParsedQuery
    return parsed && typeof parsed.method === "string" ? parsed : null
  } catch {
    return null
  }
}

const numericAttributes = new Set([
  "attempts",
  "max_attempts",
  "ord",
  "position",
  "priority",
  "slideIndex",
])

export function buildListRowsQuery(
  tableId: string,
  queries: ParsedQuery[]
): { text: string; parameters: JsonValue[] } {
  const parameters: JsonValue[] = []
  const parameter = (value: JsonValue) => {
    parameters.push(value)
    return `$${parameters.length}`
  }
  const filters = [`table_name = ${parameter(tableId)}`]
  const field = (attribute: string) => {
    const promoted: Record<string, string> = {
      $id: "row_id",
      owner_id: "owner_id",
      source_key: "source_key",
      rid: "rid",
      name: "name",
      status: "status",
      ord: "ord::text",
    }
    if (promoted[attribute]) return promoted[attribute]
    const indexedJsonAttributes = new Set([
      "$createdAt",
      "$updatedAt",
      "available_at",
      "leased_until",
      "output_id",
      "position",
      "priority",
      "type",
    ])
    return indexedJsonAttributes.has(attribute)
      ? `source_row ->> '${attribute}'`
      : `source_row ->> ${parameter(attribute)}`
  }

  for (const query of queries) {
    if (!query.attribute) continue
    const expression = field(query.attribute)
    const values = query.values ?? []
    if (query.method === "equal") {
      filters.push(
        `COALESCE(${expression}, '') = ANY(${parameter(values.map(String))}::text[])`
      )
    } else if (query.method === "notEqual") {
      filters.push(
        `COALESCE(${expression}, '') <> ALL(${parameter(values.map(String))}::text[])`
      )
    } else if (
      query.method === "lessThan" ||
      query.method === "lessThanEqual"
    ) {
      const operator = query.method === "lessThan" ? "<" : "<="
      const value = values[0]
      filters.push(
        numericAttributes.has(query.attribute) || typeof value === "number"
          ? `safe_numeric(${expression}) ${operator} ${parameter(Number(value))}`
          : `COALESCE(${expression}, '') ${operator} ${parameter(String(value ?? ""))}`
      )
    }
  }

  const orderQueries = queries.filter(
    (query) =>
      query.attribute &&
      (query.method === "orderAsc" || query.method === "orderDesc")
  )
  const order = orderQueries.map((query) => {
    const expression = field(query.attribute!)
    const value = numericAttributes.has(query.attribute!)
      ? `safe_numeric(${expression})`
      : expression
    return `${value} ${query.method === "orderDesc" ? "DESC" : "ASC"} NULLS LAST`
  })
  order.push("row_id ASC")

  const cursor = queries.find((query) => query.method === "cursorAfter")
    ?.values?.[0]
  const cursorFilter = cursor
    ? `WHERE ranked.sort_position > COALESCE((SELECT sort_position FROM ranked WHERE row_id = ${parameter(String(cursor))}), 0)`
    : ""
  const offset = numberQuery(queries, "offset", 0)
  const limit = Math.min(numberQuery(queries, "limit", 25), 5_000)
  const offsetParameter = parameter(offset)
  const limitParameter = parameter(limit)

  return {
    text: `
      WITH filtered AS (
        SELECT source_row, row_id
        FROM domain_records
        WHERE ${filters.join(" AND ")}
      ), ranked AS (
        SELECT source_row, row_id,
          row_number() OVER (ORDER BY ${order.join(", ")}) AS sort_position
        FROM filtered
      ), page AS (
        SELECT source_row, row_id, sort_position
        FROM ranked
        ${cursorFilter}
        ORDER BY sort_position
        OFFSET ${offsetParameter}
        LIMIT ${limitParameter}
      )
      SELECT
        (SELECT count(*)::int FROM filtered) AS total,
        COALESCE(
          (SELECT jsonb_agg(
            jsonb_build_object('source_row', source_row, 'row_id', row_id)
            ORDER BY sort_position
          ) FROM page),
          '[]'::jsonb
        ) AS rows
    `,
    parameters,
  }
}

function numberQuery(queries: ParsedQuery[], method: string, fallback: number) {
  const value = Number(
    queries.find((query) => query.method === method)?.values?.[0]
  )
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
}

function storedRow(
  rowId: string,
  data: Record<string, unknown>,
  permissions: string[],
  now: string
): StoredRow {
  return {
    ...data,
    $id: rowId,
    $createdAt: now,
    $updatedAt: now,
    $permissions: permissions,
  }
}

function mutationData(data: Record<string, unknown>) {
  const fields = { ...data }
  delete fields.$id
  delete fields.$createdAt
  delete fields.$updatedAt
  delete fields.$permissions
  return fields
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
