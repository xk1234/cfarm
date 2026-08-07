/**
 * Move existing local Appwrite rows from the retired automation tables into
 * their canonical template tables, then remove the retired tables. The schema
 * clone creates the canonical destinations before this script runs.
 */
import crypto from "node:crypto"

import { Client, Query, TablesDB } from "node-appwrite"

const databaseId = process.env.APPWRITE_DATABASE_ID || "cfarm"
const tables = new TablesDB(
  new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY)
)

const moves = [
  ["automations", "templates"],
  ["automation_runs", "template_runs"],
  ["x_automations", "social_templates"],
]

for (const [legacyTableId, templateTableId] of moves) {
  if (!(await tableExists(legacyTableId))) continue
  if (!(await tableExists(templateTableId))) {
    await cloneTableSchema(legacyTableId, templateTableId)
  }

  let copied = 0
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await tables.listRows({
      databaseId,
      tableId: legacyTableId,
      queries,
      total: false,
    })
    for (const row of page.rows) {
      const rowId = canonicalRowId(templateTableId, row)
      try {
        await tables.createRow({
          databaseId,
          tableId: templateTableId,
          rowId,
          data: Object.fromEntries(
            Object.entries(row).filter(([key]) => !key.startsWith("$"))
          ),
          permissions: row.$permissions ?? [],
        })
        copied += 1
      } catch (error) {
        if (Number(error?.code) !== 409) throw error
      }
    }
    if (page.rows.length < 100) break
    cursor = page.rows.at(-1).$id
  }

  await tables.deleteTable({ databaseId, tableId: legacyTableId })
  console.log(
    `Migrated ${copied} rows from ${legacyTableId} to ${templateTableId}; removed ${legacyTableId}.`
  )
}

function canonicalRowId(tableId, row) {
  const ownerId = String(row.owner_id ?? "").trim()
  const rid = String(row.rid ?? "").trim()
  if (!ownerId && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(rid)) return rid
  const stableNamespace =
    {
      templates: "automations",
      template_runs: "automation_runs",
      social_templates: "x_automations",
    }[tableId] ?? tableId
  const basis = ownerId
    ? `${stableNamespace}:${ownerId}:${rid || row.$id}`
    : `${stableNamespace}:${rid || row.$id}`
  return `${ownerId ? "u" : "r"}${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 35)}`
}

async function tableExists(tableId) {
  try {
    await tables.getTable(databaseId, tableId)
    return true
  } catch (error) {
    if (Number(error?.code) === 404) return false
    throw error
  }
}

async function cloneTableSchema(sourceTableId, targetTableId) {
  const source = await tables.getTable(databaseId, sourceTableId)
  await tables.createTable(
    databaseId,
    targetTableId,
    targetTableId,
    undefined,
    Boolean(source.rowSecurity)
  )
  const columns = await listAll("columns", (queries) =>
    tables.listColumns({
      databaseId,
      tableId: sourceTableId,
      queries,
      total: false,
    })
  )
  for (const column of columns) await createColumn(targetTableId, column)
  await waitForColumns(targetTableId)
  const indexes = await listAll("indexes", (queries) =>
    tables.listIndexes({
      databaseId,
      tableId: sourceTableId,
      queries,
      total: false,
    })
  )
  for (const index of indexes) {
    await tables.createIndex(
      databaseId,
      targetTableId,
      index.key,
      index.type,
      index.columns ?? index.attributes ?? [],
      index.orders ?? undefined,
      index.lengths ?? undefined
    )
  }
}

async function listAll(field, fetchPage) {
  const records = []
  let cursor = ""
  for (;;) {
    const queries = [Query.limit(100)]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const page = await fetchPage(queries)
    const values = page[field] ?? []
    records.push(...values)
    if (values.length < 100) return records
    cursor = values.at(-1).$id
  }
}

async function waitForColumns(tableId) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const columns = await listAll("columns", (queries) =>
      tables.listColumns({ databaseId, tableId, queries, total: false })
    )
    if (columns.every((column) => column.status === "available")) return
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
  throw new Error(`Columns for ${tableId} did not become available.`)
}

function createColumn(tableId, column) {
  const required = Boolean(column.required)
  const array = Boolean(column.array)
  const defaultValue = required || array ? undefined : column.default
  if (column.type === "longtext")
    return tables.createLongtextColumn(
      databaseId,
      tableId,
      column.key,
      required,
      defaultValue,
      array,
      Boolean(column.encrypt)
    )
  if (column.type === "mediumtext")
    return tables.createMediumtextColumn(
      databaseId,
      tableId,
      column.key,
      required,
      defaultValue,
      array,
      Boolean(column.encrypt)
    )
  if (column.type === "text")
    return tables.createTextColumn(
      databaseId,
      tableId,
      column.key,
      required,
      defaultValue,
      array,
      Boolean(column.encrypt)
    )
  if (column.type === "string" && column.format === "enum")
    return tables.createEnumColumn(
      databaseId,
      tableId,
      column.key,
      column.elements ?? [],
      required,
      defaultValue,
      array
    )
  if (column.type === "string")
    return tables.createStringColumn(
      databaseId,
      tableId,
      column.key,
      column.size ?? 255,
      required,
      defaultValue,
      array
    )
  if (column.type === "integer")
    return tables.createIntegerColumn(
      databaseId,
      tableId,
      column.key,
      required,
      safeNumber(column.min),
      safeNumber(column.max),
      safeNumber(defaultValue),
      array
    )
  if (column.type === "double")
    return tables.createFloatColumn(
      databaseId,
      tableId,
      column.key,
      required,
      finiteNumber(column.min),
      finiteNumber(column.max),
      finiteNumber(defaultValue),
      array
    )
  if (column.type === "boolean")
    return tables.createBooleanColumn(
      databaseId,
      tableId,
      column.key,
      required,
      defaultValue,
      array
    )
  if (column.type === "datetime")
    return tables.createDatetimeColumn(
      databaseId,
      tableId,
      column.key,
      required,
      defaultValue,
      array
    )
  throw new Error(`Unsupported column type ${column.type} for ${column.key}.`)
}

function finiteNumber(value) {
  if (value == null) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function safeNumber(value) {
  const number = finiteNumber(value)
  return Number.isSafeInteger(number) ? number : undefined
}
