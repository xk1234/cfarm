import "server-only"

import { getRailwayDatabase } from "@/lib/railway/database"

export type DomainRecord = {
  tableName: string
  rowId: string
  ownerId: string | null
  sourceKey: string | null
  rid: string | null
  name: string | null
  status: string | null
  ord: number | null
  payload: Record<string, unknown>
  sourceRow: Record<string, unknown>
  createdAt: Date | null
  updatedAt: Date | null
}

export type JsonPathFilter = {
  path: string[]
  values: ReadonlyArray<string | number | boolean>
}

export type ListDomainRecordsInput = {
  table: string
  sourceKey?: string | null
  ownerIds?: readonly string[] | null
  payloadFilters?: JsonPathFilter[]
  limit?: number
  offset?: number
  order?: "asc" | "desc" | "none"
}

export type PutDomainRecordInput = {
  table: string
  rowId: string
  ownerId?: string | null
  sourceKey?: string | null
  rid?: string | null
  name?: string | null
  status?: string | null
  ord?: number | null
  payload: unknown
  sourceRow?: Record<string, unknown>
  media?: OutputMediaInsert[]
}

export type OutputMediaIdentity = {
  outputId: string
  ownerId: string
}

export type OutputMediaInsert = {
  id: string
  kind: string
  role: string
  position: number
  url: string
  storageBucket?: string | null
  storageFileId?: string | null
  storagePath?: string | null
}

type SqlLike = {
  <T>(template: TemplateStringsArray, ...parameters: unknown[]): Promise<T[]>
  unsafe<T>(
    query: string,
    parameters?: readonly unknown[]
  ): Promise<T>
  json(value: unknown): unknown
  begin<T>(callback: (transaction: SqlLike) => Promise<T>): Promise<T>
}

type Database = SqlLike

const MAX_LIMIT = 1000

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function jsonPath(path: string[]): string {
  return `{${path.map((part) => String(part).replace(/"/g, '\\"')).join(",")}}`
}

function filters(input: ListDomainRecordsInput): {
  where: string
  parameters: unknown[]
} {
  const parameters: unknown[] = [input.table]
  const clauses = ["d.table_name = $1"]
  if (input.sourceKey) {
    parameters.push(input.sourceKey)
    clauses.push(`d.source_key = $${parameters.length}`)
  }
  if (input.ownerIds?.length) {
    parameters.push([...input.ownerIds])
    clauses.push(`d.owner_id = ANY($${parameters.length}::text[])`)
  }
  for (const filter of input.payloadFilters ?? []) {
    const values = filter.values.map(String)
    if (!values.length) continue
    parameters.push(jsonPath(filter.path), values)
    const pathParameter = parameters.length - 1
    const valueParameter = parameters.length
    clauses.push(
      `d.payload #>> $${pathParameter}::text[] = ANY($${valueParameter}::text[])`
    )
  }
  return { where: clauses.join(" AND "), parameters }
}

function domainSelection() {
  return `
    d.table_name AS "tableName", d.row_id AS "rowId",
    d.owner_id AS "ownerId", d.source_key AS "sourceKey",
    d.rid, d.name, d.status, d.ord, d.payload,
    d.source_row AS "sourceRow",
    d.created_at AS "createdAt",
    d.updated_at AS "updatedAt"
  `
}

function orderFor(order: ListDomainRecordsInput["order"]): string {
  if (order === "none") return "ORDER BY d.row_id"
  if (order === "desc")
    return "ORDER BY d.ord DESC NULLS LAST, d.created_at DESC"
  return "ORDER BY d.ord ASC NULLS LAST, d.created_at ASC"
}

export async function listDomainRecords(
  input: ListDomainRecordsInput
): Promise<DomainRecord[]> {
  const database = getRailwayDatabase() as unknown as SqlLike
  const condition = filters(input)
  const limit = Math.max(1, Math.min(input.limit ?? MAX_LIMIT, MAX_LIMIT))
  const offset = Math.max(0, input.offset ?? 0)
  const rows = await database.unsafe<DomainRecord[]>(
    `SELECT ${domainSelection()}
     FROM domain_records d
     WHERE ${condition.where}
     ${orderFor(input.order)}
     LIMIT ${limit} OFFSET ${offset}`,
    condition.parameters
  )
  return rows
}

export async function countDomainRecords(
  input: Omit<ListDomainRecordsInput, "limit" | "offset" | "order">
): Promise<number> {
  const database = getRailwayDatabase() as unknown as SqlLike
  const condition = filters(input)
  const rows = await database.unsafe<Array<{ count: string }>>(
    `SELECT count(*)::text AS count
     FROM domain_records d
     WHERE ${condition.where}`,
    condition.parameters
  )
  return Number(rows[0]?.count ?? 0)
}

export async function getDomainRecord(
  table: string,
  rowId: string
): Promise<DomainRecord | null> {
  const database = getRailwayDatabase() as unknown as SqlLike
  const rows = await database.unsafe<DomainRecord[]>(
    `SELECT ${domainSelection()}
     FROM domain_records d
     WHERE d.table_name = $1::text AND d.row_id = $2::text
     LIMIT 1`,
    [table, rowId]
  )
  return rows[0] ?? null
}

async function upsertDomainRecord(
  database: Database,
  record: PutDomainRecordInput
): Promise<void> {
  await database.unsafe(
    `INSERT INTO domain_records (
       table_name, row_id, owner_id, source_key, rid, name, status, ord,
       payload, source_row, permissions, created_at,
       updated_at, migrated_at
     ) VALUES ($1::text, $2::text, $3::text, $4::text, $5::text,
       $6::text, $7::text, $8::bigint, $9, $10, '[]'::jsonb,
       now(), now(), now())
     ON CONFLICT (table_name, row_id) DO UPDATE SET
       owner_id = EXCLUDED.owner_id,
       source_key = EXCLUDED.source_key,
       rid = EXCLUDED.rid,
       name = EXCLUDED.name,
       status = EXCLUDED.status,
       ord = EXCLUDED.ord,
       payload = EXCLUDED.payload,
       source_row = EXCLUDED.source_row,
       permissions = EXCLUDED.permissions,
       created_at = domain_records.created_at,
       updated_at = now(),
       migrated_at = domain_records.migrated_at`,
    [
      record.table,
      record.rowId,
      record.ownerId ?? null,
      record.sourceKey ?? null,
      record.rid ?? null,
      record.name ?? null,
      record.status ?? null,
      record.ord ?? null,
      // `unsafe` accepts protocol values, not postgres.js Parameter helpers.
      // The destination columns are jsonb, so serialized JSON is bound safely
      // and cast by PostgreSQL from the column assignment.
      JSON.stringify(record.payload ?? null),
      JSON.stringify(record.sourceRow ?? {}),
    ]
  )
}

async function insertOutputMedia(
  database: Database,
  item: OutputMediaInsert & OutputMediaIdentity
): Promise<void> {
  await database`
    INSERT INTO output_media (
      id, output_id, owner_id, kind, role, position,
      storage_bucket, storage_file_id, storage_path, url
    ) VALUES (
      ${item.id}, ${item.outputId}, ${item.ownerId}, ${item.kind},
      ${item.role}, ${item.position}, ${item.storageBucket ?? null},
      ${item.storageFileId ?? null}, ${item.storagePath ?? null}, ${item.url}
    )
  `
}

export async function putDomainRecords(
  records: PutDomainRecordInput[]
): Promise<void> {
  if (!records.length) return
  const database = getRailwayDatabase() as unknown as SqlLike
  await database.begin(async (transaction) => {
    for (const record of records) {
      await upsertDomainRecord(transaction, record)
      if (record.table === "outputs") {
        await transaction.unsafe(
          `DELETE FROM output_media WHERE output_id = $1::text`,
          [record.rowId]
        )
        for (const item of record.media ?? []) {
          await insertOutputMedia(transaction, {
            ...item,
            outputId: record.rowId,
            ownerId: record.ownerId ?? "",
          })
        }
      }
    }
  })
}

function scopeCondition(input: {
  ownerId?: string | null
  sourceKey?: string | null
}): { clause: string; parameters: unknown[] } {
  const parameters: unknown[] = []
  const clauses: string[] = []
  for (const [column, value] of [
    ["source_key", input.sourceKey],
    ["owner_id", input.ownerId],
  ] as const) {
    if (value == null) {
      clauses.push(`${column} IS NULL`)
    } else {
      parameters.push(value)
      clauses.push(`${column} = $${parameters.length + 1}::text`)
    }
  }
  return { clause: clauses.join(" AND "), parameters }
}

export async function replaceDomainScope(input: {
  table: string
  ownerId?: string | null
  sourceKey?: string | null
  records: PutDomainRecordInput[]
}): Promise<void> {
  const database = getRailwayDatabase() as unknown as SqlLike
  const desiredIds = new Set(input.records.map((record) => record.rowId))
  const scope = scopeCondition(input)
  const outputIds = input.records.map((record) => record.rowId)
  await database.begin(async (transaction) => {
    if (input.table === "outputs" && outputIds.length) {
      await transaction.unsafe(
        `DELETE FROM output_media WHERE output_id = ANY($1::text[])`,
        [outputIds]
      )
    }
    const existingRows = await transaction.unsafe<Array<{ row_id: string }>>(
      `SELECT row_id FROM domain_records
       WHERE table_name = $1::text AND ${scope.clause}`,
      [input.table, ...scope.parameters]
    )
    for (const record of input.records) {
      await upsertDomainRecord(transaction, record)
      for (const item of record.media ?? []) {
        await insertOutputMedia(transaction, {
          ...item,
          outputId: record.rowId,
          ownerId: record.ownerId ?? "",
        })
      }
    }
    const existing = existingRows.map((row) => row.row_id)
    const removed = existing.filter((rowId) => !desiredIds.has(rowId))
    if (removed.length > 10 && removed.length > existing.length / 2) {
      throw new Error(
        `Refusing bulk delete from ${input.table}: ${removed.length} of ${existing.length} records would be removed.`
      )
    }
    if (!removed.length) return
    await transaction.unsafe(
      `DELETE FROM output_media WHERE output_id = ANY($1::text[])`,
      [removed]
    )
    await transaction.unsafe(
      `DELETE FROM domain_records WHERE table_name = $1::text AND row_id = ANY($2::text[])`,
      [input.table, removed]
    )
  })
}

export async function deleteDomainRecord(
  table: string,
  rowId: string
): Promise<boolean> {
  const database = getRailwayDatabase() as unknown as SqlLike
  return database.begin(async (transaction) => {
    const deleted = await transaction.unsafe<Array<{ row_id: string }>>(
      `DELETE FROM domain_records WHERE table_name = $1::text AND row_id = $2::text RETURNING row_id`,
      [table, rowId]
    )
    if (deleted.length && table === "outputs") {
      await transaction`DELETE FROM output_media WHERE output_id = ${rowId}`
    }
    return deleted.length > 0
  })
}

export type OutputMediaRecord = {
  id: string
  outputId: string
  kind: string
  role: string
  position: number
  url: string
}

export async function listOutputMedia(
  outputIds: readonly string[]
): Promise<OutputMediaRecord[]> {
  if (!outputIds.length) return []
  const database = getRailwayDatabase() as unknown as SqlLike
  const rows = await database.unsafe<OutputMediaRecord[]>(
    `SELECT id, output_id AS "outputId", kind, role, position, url
     FROM output_media
     WHERE output_id = ANY($1::text[])
     ORDER BY position ASC, id ASC`,
    [[...outputIds]]
  )
  return rows
}

export async function syncOutputMedia(input: {
  outputId: string
  ownerId: string
  media: Array<{
    id: string
    kind: string
    role: string
    position: number
    url: string
    storageBucket?: string | null
    storageFileId?: string | null
    storagePath?: string | null
  }>
}): Promise<void> {
  const database = getRailwayDatabase()
  await database.begin(async (transaction) => {
    await transaction`DELETE FROM output_media WHERE output_id = ${input.outputId}`
    for (const item of input.media) {
      await transaction`
        INSERT INTO output_media (
          id, output_id, owner_id, kind, role, position,
          storage_bucket, storage_file_id, storage_path, url
        ) VALUES (
          ${item.id}, ${input.outputId}, ${input.ownerId}, ${item.kind},
          ${item.role}, ${item.position}, ${item.storageBucket ?? null},
          ${item.storageFileId ?? null}, ${item.storagePath ?? null}, ${item.url}
        )
      `
    }
  })
}

export async function insertOutputMediaOnce(input: {
  id: string
  outputId: string
  ownerId: string
  kind: string
  role: string
  position: number
  url: string
  storageBucket?: string | null
  storageFileId?: string | null
  storagePath?: string | null
}): Promise<void> {
  const database = getRailwayDatabase() as unknown as SqlLike
  await database`
    INSERT INTO output_media (
      id, output_id, owner_id, kind, role, position,
      storage_bucket, storage_file_id, storage_path, url
    ) VALUES (
      ${input.id}, ${input.outputId}, ${input.ownerId}, ${input.kind},
      ${input.role}, ${input.position}, ${input.storageBucket ?? null},
      ${input.storageFileId ?? null}, ${input.storagePath ?? null}, ${input.url}
    )
  `
}

export async function deleteOutputMediaRecord(input: {
  id: string
}): Promise<boolean> {
  const database = getRailwayDatabase() as unknown as SqlLike
  const rows = (await database`
    DELETE FROM output_media WHERE id = ${input.id} RETURNING id
  `) as Array<{ id: string }>
  return rows.length > 0
}

export async function deleteOutputMediaForOutputs(
  outputIds: readonly string[]
): Promise<void> {
  if (!outputIds.length) return
  const database = getRailwayDatabase() as unknown as SqlLike
  await database.unsafe(
    `DELETE FROM output_media WHERE output_id = ANY($1::text[])`,
    [[...outputIds]]
  )
}

export function requireCleanId(value: unknown, label: string): string {
  const normalized = clean(value)
  if (!normalized) throw new Error(`${label} is required.`)
  return normalized
}
