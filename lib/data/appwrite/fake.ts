/**
 * In-process fake of the TablesDB + Storage subset the adapter uses, for unit
 * tests only (no network, no Appwrite Cloud). It enforces the declared schema
 * (unknown/missing required columns → 400), unique indexes and row ids
 * (→ 409), and interprets the query strings produced by `Query.*`.
 */
import { AppwriteException } from "node-appwrite"
import type { Models } from "node-appwrite"

import type { StorageApi, StoredFile, TablesApi } from "./client"
import { BUCKET_DEFS, TABLE_DEFS } from "./schema.mjs"

type Row = Models.DefaultRow & Record<string, unknown>
type ParsedQuery = { method: string; attribute?: string; values?: unknown[] }

const SYSTEM = new Set(["$id", "$createdAt", "$updatedAt", "$permissions", "$sequence", "$tableId", "$databaseId"])

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  zip: "application/zip",
}

function fail(code: number, message: string, type = "general_error"): never {
  throw new AppwriteException(message, code, type)
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a) - Number(b)
  return (a as number | string) < (b as number | string) ? -1 : 1
}

/** Appwrite returns datetimes with an explicit offset; mimic that. */
function appwriteDate(d: Date): string {
  return d.toISOString().replace("Z", "+00:00")
}

export function createFakeAppwrite(options: { now?: () => Date } = {}) {
  const now = () => (options.now ? options.now() : new Date())
  const defs = new Map(TABLE_DEFS.map((t) => [t.id, t]))
  const data = new Map<string, Map<string, Row>>()
  let sequence = 0
  const requests: { method: string; tableId?: string }[] = []

  function table(tableId: string) {
    const def = defs.get(tableId)
    if (!def) fail(404, `Table ${tableId} not found`, "table_not_found")
    let rows = data.get(tableId)
    if (!rows) data.set(tableId, (rows = new Map()))
    return { def, rows }
  }

  function normaliseValue(type: string, value: unknown): unknown {
    if (value === undefined || value === null) return null
    if (type === "datetime") {
      const d = new Date(String(value))
      if (Number.isNaN(d.getTime())) fail(400, `Invalid datetime ${String(value)}`)
      return appwriteDate(d)
    }
    return value
  }

  function validate(tableId: string, values: Record<string, unknown>, creating: boolean) {
    const { def } = table(tableId)
    const columns = new Map(def.columns.map((c) => [c.key, c]))
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(values)) {
      if (SYSTEM.has(k)) continue
      const col = columns.get(k)
      if (!col) fail(400, `Unknown column "${k}" in ${tableId}`, "row_invalid_structure")
      if (col.required && (v === null || v === undefined)) fail(400, `Column "${k}" is required`, "row_invalid_structure")
      if (col.array) {
        if (v !== null && !Array.isArray(v)) fail(400, `Column "${k}" must be an array`)
      } else if (v !== null && v !== undefined) {
        const t = col.type
        const ok =
          t === "integer"
            ? Number.isInteger(v)
            : t === "float"
              ? typeof v === "number"
              : t === "boolean"
                ? typeof v === "boolean"
                : typeof v === "string"
        if (!ok) fail(400, `Column "${k}" has the wrong type`, "row_invalid_structure")
        if (t === "varchar" && typeof v === "string" && col.size && v.length > col.size) {
          fail(400, `Column "${k}" exceeds ${col.size} chars`, "row_invalid_structure")
        }
      }
      out[k] = normaliseValue(col.type, v)
    }
    if (creating) {
      for (const col of def.columns) {
        if (col.required && (out[col.key] === null || out[col.key] === undefined)) {
          fail(400, `Missing required column "${col.key}"`, "row_invalid_structure")
        }
        if (!(col.key in out)) out[col.key] = col.array ? [] : null
      }
    }
    return out
  }

  function checkUnique(tableId: string, candidate: Row) {
    const { def, rows } = table(tableId)
    for (const index of def.indexes) {
      if (index.type !== "unique") continue
      const values = index.columns.map((c) => candidate[c])
      if (values.some((v) => v === null || v === undefined)) continue
      for (const other of rows.values()) {
        if (other.$id === candidate.$id) continue
        if (index.columns.every((c, i) => other[c] === values[i])) {
          fail(409, `Unique index ${index.key} violated`, "row_already_exists")
        }
      }
    }
  }

  function matches(row: Row, q: ParsedQuery): boolean {
    const v = q.attribute ? row[q.attribute] : undefined
    const values = q.values ?? []
    const cmp = (x: unknown) => {
      if (typeof x === "string" && typeof v === "string" && /\d{4}-\d{2}-\d{2}T/.test(x) && /\d{4}-\d{2}-\d{2}T/.test(v)) {
        return compare(new Date(v).getTime(), new Date(x).getTime())
      }
      return compare(v, x)
    }
    switch (q.method) {
      case "equal":
        return values.some((x) => (Array.isArray(v) ? v.includes(x) : cmp(x) === 0 && v !== null && v !== undefined))
      case "notEqual":
        return values.every((x) => v !== x)
      case "lessThan":
        return v !== null && v !== undefined && cmp(values[0]) < 0
      case "lessThanEqual":
        return v !== null && v !== undefined && cmp(values[0]) <= 0
      case "greaterThan":
        return v !== null && v !== undefined && cmp(values[0]) > 0
      case "greaterThanEqual":
        return v !== null && v !== undefined && cmp(values[0]) >= 0
      case "isNull":
        return v === null || v === undefined
      case "isNotNull":
        return v !== null && v !== undefined
      default:
        return fail(400, `Fake does not support query method ${q.method}`)
    }
  }

  function runQueries(tableId: string, queries: string[] = []) {
    const { rows } = table(tableId)
    const parsed = queries.map((s) => JSON.parse(s) as ParsedQuery)
    const filters = parsed.filter((q) => !["orderAsc", "orderDesc", "limit", "offset", "cursorAfter", "select"].includes(q.method))
    const orders = parsed.filter((q) => q.method === "orderAsc" || q.method === "orderDesc")
    let list = [...rows.values()].filter((r) => filters.every((q) => matches(r, q)))
    list.sort((a, b) => {
      for (const o of orders) {
        const attr = o.attribute!
        const av = attr.startsWith("$") && attr !== "$id" && attr !== "$sequence" ? new Date(String(a[attr])).getTime() : a[attr]
        const bv = attr.startsWith("$") && attr !== "$id" && attr !== "$sequence" ? new Date(String(b[attr])).getTime() : b[attr]
        const c = compare(av, bv)
        if (c !== 0) return o.method === "orderAsc" ? c : -c
      }
      return Number(a.$sequence) - Number(b.$sequence)
    })
    const total = list.length
    const cursor = parsed.find((q) => q.method === "cursorAfter")
    if (cursor) {
      const idx = list.findIndex((r) => r.$id === cursor.values?.[0])
      if (idx < 0) fail(400, "Invalid cursor", "general_cursor_not_found")
      list = list.slice(idx + 1)
    }
    const limit = parsed.find((q) => q.method === "limit")
    list = list.slice(0, Number(limit?.values?.[0] ?? 25))
    const select = parsed.find((q) => q.method === "select")
    const cols = select?.values as string[] | undefined
    const shaped = list.map((r) => {
      const copy = structuredClone(r)
      if (cols) for (const k of Object.keys(copy)) if (!SYSTEM.has(k) && !cols.includes(k)) delete copy[k]
      return copy
    })
    return { total, rows: shaped }
  }

  function writeRow(tableId: string, rowId: string, values: Record<string, unknown>, mode: "create" | "update") {
    const { rows } = table(tableId)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(rowId)) fail(400, `Invalid row id ${rowId}`, "general_argument_invalid")
    const existing = rows.get(rowId)
    if (mode === "create" && existing) fail(409, `Row ${rowId} already exists`, "row_already_exists")
    if (mode === "update" && !existing) fail(404, `Row ${rowId} not found`, "row_not_found")
    const at = appwriteDate(now())
    const next: Row = existing
      ? ({ ...existing, ...validate(tableId, values, false), $updatedAt: at } as Row)
      : ({
          ...validate(tableId, values, true),
          $id: rowId,
          $createdAt: at,
          $updatedAt: at,
          $permissions: [],
          $sequence: ++sequence,
          $tableId: tableId,
          $databaseId: "fake",
        } as unknown as Row)
    checkUnique(tableId, next)
    rows.set(rowId, next)
    return structuredClone(next)
  }

  const tables: TablesApi = {
    async createRow({ tableId, rowId, data: values }) {
      requests.push({ method: "createRow", tableId })
      return writeRow(tableId, rowId, values, "create")
    },
    async getRow({ tableId, rowId }) {
      requests.push({ method: "getRow", tableId })
      const row = table(tableId).rows.get(rowId)
      if (!row) fail(404, `Row ${rowId} not found`, "row_not_found")
      return structuredClone(row)
    },
    async listRows({ tableId, queries }) {
      requests.push({ method: "listRows", tableId })
      return runQueries(tableId, queries)
    },
    async updateRow({ tableId, rowId, data: values }) {
      requests.push({ method: "updateRow", tableId })
      return writeRow(tableId, rowId, values ?? {}, "update")
    },
    async upsertRow({ tableId, rowId, data: values }) {
      requests.push({ method: "upsertRow", tableId })
      return writeRow(tableId, rowId, values ?? {}, table(tableId).rows.has(rowId) ? "update" : "create")
    },
    async deleteRow({ tableId, rowId }) {
      requests.push({ method: "deleteRow", tableId })
      if (!table(tableId).rows.delete(rowId)) fail(404, `Row ${rowId} not found`, "row_not_found")
      return {}
    },
    async updateRows({ tableId, data: values, queries }) {
      requests.push({ method: "updateRows", tableId })
      const { rows } = runQueries(tableId, [...(queries ?? []), JSON.stringify({ method: "limit", values: [1000] })])
      const updated = rows.map((r) => writeRow(tableId, r.$id, (values ?? {}) as Record<string, unknown>, "update"))
      return { total: updated.length, rows: updated }
    },
    async deleteRows({ tableId, queries }) {
      requests.push({ method: "deleteRows", tableId })
      const { rows } = runQueries(tableId, queries)
      for (const r of rows) table(tableId).rows.delete(r.$id)
      return { total: rows.length, rows }
    },
  }

  const buckets = new Map(BUCKET_DEFS.map((b) => [b.id, new Map<string, StoredFile & { bytes: Uint8Array }>()]))
  function bucket(bucketId: string) {
    const b = buckets.get(bucketId)
    if (!b) fail(404, `Bucket ${bucketId} not found`, "storage_bucket_not_found")
    return b
  }
  const storage: StorageApi = {
    async createFile({ bucketId, fileId, file }) {
      requests.push({ method: "createFile" })
      const b = bucket(bucketId)
      if (b.has(fileId)) fail(409, `File ${fileId} already exists`, "storage_file_already_exists")
      const input = file as unknown as { filename: string; size(): Promise<number>; slice(s: number, e: number): Promise<Uint8Array> }
      const size = await input.size()
      const bytes = await input.slice(0, size)
      const ext = input.filename.split(".").pop()?.toLowerCase() ?? ""
      const def = BUCKET_DEFS.find((d) => d.id === bucketId)
      if (def && !def.allowedFileExtensions.includes(ext)) fail(400, `Extension .${ext} not allowed`, "storage_file_type_unsupported")
      const stored = { $id: fileId, name: input.filename, mimeType: MIME_BY_EXT[ext] ?? "application/octet-stream", sizeOriginal: size, bytes: new Uint8Array(bytes) }
      b.set(fileId, stored)
      const { bytes: _b, ...meta } = stored
      return meta
    },
    async getFile({ bucketId, fileId }) {
      requests.push({ method: "getFile" })
      const f = bucket(bucketId).get(fileId)
      if (!f) fail(404, `File ${fileId} not found`, "storage_file_not_found")
      const { bytes: _b, ...meta } = f
      return meta
    },
    async getFileView({ bucketId, fileId }) {
      requests.push({ method: "getFileView" })
      const f = bucket(bucketId).get(fileId)
      if (!f) fail(404, `File ${fileId} not found`, "storage_file_not_found")
      return f.bytes.slice().buffer as ArrayBuffer
    },
    async deleteFile({ bucketId, fileId }) {
      requests.push({ method: "deleteFile" })
      if (!bucket(bucketId).delete(fileId)) fail(404, `File ${fileId} not found`, "storage_file_not_found")
      return {}
    },
  }

  return { tables, storage, requests, rows: (tableId: string) => [...table(tableId).rows.values()] }
}
