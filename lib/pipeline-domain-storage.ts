import "server-only"

import { InputFile } from "node-appwrite/file"

import { RecordQuery as Query } from "@/lib/record-query"
import { getRuntimeStore, RUNTIME_DATABASE_ID } from "@/lib/runtime-store"
import {
  STORE_ROUTES,
  bucketForPath,
  fileIdForPath,
  ownedRowIdFor,
} from "@/lib/appwrite-stores"
import {
  canonicalRowFields,
  extractOutputMedia,
  outputMediaRowFields,
  outputMediaRowId,
  type OutputMediaDraft,
} from "@/lib/consolidated-records"
import { clean, isRecord } from "@/lib/guards"

export type PipelineStorageDomain =
  | "templates"
  | "image-collections"
  | "model-settings"
  | "word-collections"
  | "usage-history"
  | "template-runs"
  | "social-templates"
  | "social-template-runs"
  | "ugc-outputs"
  | "results"

type DomainConfig = {
  route: (typeof STORE_ROUTES)[string]
  id: (record: Record<string, unknown>) => string
}

const DOMAINS: Record<PipelineStorageDomain, DomainConfig> = {
  templates: {
    route: STORE_ROUTES["templates/templates.json"],
    id: (record) => clean(record.id),
  },
  "image-collections": {
    route: STORE_ROUTES["image-collections.json"],
    id: (record) => `${clean(record.name)}::${clean(record.created_at)}`,
  },
  "model-settings": {
    route: STORE_ROUTES["settings/generation-models.json"],
    id: () => "generation-models",
  },
  "word-collections": {
    route: STORE_ROUTES["word-collections/word-collections.json"],
    id: (record) => clean(record.id),
  },
  "usage-history": {
    route: STORE_ROUTES["usage-ledger.json"],
    id: (record) => clean(record.id),
  },
  "template-runs": {
    route: STORE_ROUTES["templates/runs.json"],
    id: (record) => clean(record.id),
  },
  "social-templates": {
    route: STORE_ROUTES["social-templates/templates.json"],
    id: (record) => clean(record.id),
  },
  "social-template-runs": {
    route: STORE_ROUTES["social-templates/runs.json"],
    id: (record) => clean(record.id),
  },
  "ugc-outputs": {
    route: STORE_ROUTES["generated-videos/exports.json"],
    id: (record) => clean(record.id),
  },
  results: {
    route: STORE_ROUTES["results/results.json"],
    id: (record) => clean(record.id),
  },
}

export type DomainPage = {
  records: Array<{ rowId: string; record: Record<string, unknown> }>
  nextCursor: string | null
}

/** One fixed-domain listRows request. Callers cannot supply a table or query. */
export async function readPipelineDomainPageOnce(input: {
  domain: PipelineStorageDomain
  ownerId: string
  cursor?: string
  limit?: number
}): Promise<DomainPage> {
  const { records } = clients()
  const config = DOMAINS[input.domain]
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 100)))
  const queries = [
    Query.equal("owner_id", [required(input.ownerId, "owner")]),
    Query.limit(limit),
  ]
  if (
    config.route.table === "outputs" ||
    config.route.table === "permanent_assets"
  ) {
    queries.push(Query.equal("source_key", [config.route.sourceKey]))
  }
  if (clean(input.cursor)) queries.push(Query.cursorAfter(clean(input.cursor)))
  const response = await records.listRows(
    RUNTIME_DATABASE_ID,
    config.route.table,
    queries
  )
  const rows = response.rows as Array<Record<string, unknown>>
  return {
    records: rows.flatMap((row) => {
      const record = parseData(row.data)
      return record ? [{ rowId: clean(row.$id), record }] : []
    }),
    nextCursor: rows.length === limit ? clean(rows.at(-1)?.$id) || null : null,
  }
}

/** One deterministic-row getRow request. A 404 is returned as null. */
export async function readPipelineDomainDocumentOnce(input: {
  domain: PipelineStorageDomain
  ownerId: string
  id: string
}): Promise<{ rowId: string; record: Record<string, unknown> } | null> {
  const config = DOMAINS[input.domain]
  const id = required(input.id, `${input.domain} id`)
  const rowId = ownedRowIdFor(
    rowNamespace(config),
    required(input.ownerId, "owner"),
    id,
    0
  )
  try {
    const row = (await clients().records.getRow(
      RUNTIME_DATABASE_ID,
      config.route.table,
      rowId
    )) as unknown as Record<string, unknown>
    const record = parseData(row.data)
    return record ? { rowId, record } : null
  } catch (error) {
    if (status(error) === 404) return null
    throw error
  }
}

export function preparePipelineDomainDocument(input: {
  domain: PipelineStorageDomain
  ownerId: string
  record: Record<string, unknown>
  ordinal?: number
}) {
  const config = DOMAINS[input.domain]
  const id = required(config.id(input.record), `${input.domain} record id`)
  const ownerId = required(input.ownerId, "owner")
  const extracted = extractOutputMedia(config.route.sourceKey, input.record)
  const rowId = ownedRowIdFor(rowNamespace(config), ownerId, id, 0)
  return {
    rowId,
    fields: {
      rid: id,
      owner_id: ownerId,
      ord: Number.isFinite(input.ordinal) ? input.ordinal : -Date.now(),
      ...canonicalRowFields(config.route, input.record, extracted.storedData),
    },
    media: extracted.media,
  }
}

export function pipelineDomainRowId(
  domain: PipelineStorageDomain,
  ownerIdInput: string,
  idInput: string
) {
  const config = DOMAINS[domain]
  return ownedRowIdFor(
    rowNamespace(config),
    required(ownerIdInput, "owner"),
    required(idInput, `${domain} id`),
    0
  )
}

/** Exactly one createRow request for a fixed domain. */
export async function createPipelineDomainDocumentOnce(input: {
  domain: PipelineStorageDomain
  ownerId: string
  record: Record<string, unknown>
  ordinal?: number
}) {
  const prepared = preparePipelineDomainDocument(input)
  await clients().records.createRow(
    RUNTIME_DATABASE_ID,
    DOMAINS[input.domain].route.table,
    prepared.rowId,
    prepared.fields
  )
  return prepared
}

/** Exactly one updateRow request for a fixed domain. */
export async function updatePipelineDomainDocumentOnce(input: {
  domain: PipelineStorageDomain
  ownerId: string
  record: Record<string, unknown>
  ordinal?: number
}) {
  const prepared = preparePipelineDomainDocument(input)
  await clients().records.updateRow(
    RUNTIME_DATABASE_ID,
    DOMAINS[input.domain].route.table,
    prepared.rowId,
    prepared.fields
  )
  return prepared
}

/** One output_media listRows request scoped to one owner-owned output. */
export async function readOutputMediaPageOnce(input: {
  ownerId: string
  outputRowId: string
  cursor?: string
  limit?: number
}) {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 100)))
  const queries = [
    Query.equal("owner_id", [required(input.ownerId, "owner")]),
    Query.equal("output_id", [required(input.outputRowId, "output row")]),
    Query.limit(limit),
  ]
  if (clean(input.cursor)) queries.push(Query.cursorAfter(clean(input.cursor)))
  const response = await clients().records.listRows(
    RUNTIME_DATABASE_ID,
    "output_media",
    queries
  )
  const rows = response.rows as Array<Record<string, unknown>>
  return {
    media: rows.map((row) => ({
      rowId: clean(row.$id),
      kind: clean(row.kind),
      role: clean(row.role),
      position: Number(row.position) || 0,
      url: clean(row.url),
    })),
    nextCursor: rows.length === limit ? clean(rows.at(-1)?.$id) || null : null,
  }
}

export async function createOutputMediaOnce(input: {
  ownerId: string
  outputRowId: string
  media: OutputMediaDraft
}) {
  const rowId = outputMediaRowId(
    required(input.outputRowId, "output row"),
    input.media
  )
  await clients().records.createRow(
    RUNTIME_DATABASE_ID,
    "output_media",
    rowId,
    outputMediaRowFields(
      input.outputRowId,
      required(input.ownerId, "owner"),
      input.media
    )
  )
  return { rowId }
}

export async function deleteOutputMediaOnce(input: {
  ownerId: string
  outputRowId: string
  media: OutputMediaDraft
}) {
  required(input.ownerId, "owner")
  const outputRowId = required(input.outputRowId, "output row")
  await clients().records.deleteRow(
    RUNTIME_DATABASE_ID,
    "output_media",
    outputMediaRowId(outputRowId, input.media)
  )
}

export async function readDomainAssetOnce(input: {
  domain: "slideshow" | "ugc"
  ownerId: string
  relativePath: string
}) {
  const relativePath = safeAssetPath(input)
  return clients().objects.getFileView(
    bucketForPath(relativePath),
    fileIdForPath(relativePath)
  )
}

export async function inspectDomainAssetOnce(input: {
  domain: "slideshow" | "ugc"
  ownerId: string
  relativePath: string
}) {
  const relativePath = safeAssetPath(input)
  try {
    await clients().objects.getFile(
      bucketForPath(relativePath),
      fileIdForPath(relativePath)
    )
    return { exists: true }
  } catch (error) {
    if (status(error) === 404) return { exists: false }
    throw error
  }
}

export async function createDomainAssetOnce(input: {
  domain: "slideshow" | "ugc"
  ownerId: string
  relativePath: string
  bytes: Buffer | Uint8Array
}) {
  const relativePath = safeAssetPath(input)
  await clients().objects.createFile(
    bucketForPath(relativePath),
    fileIdForPath(relativePath),
    InputFile.fromBuffer(
      Buffer.from(input.bytes),
      relativePath.split("/").at(-1) ?? "pipeline-asset"
    ),
    []
  )
  return { relativePath, url: `/api/local-assets/${relativePath}` }
}

export async function deleteDomainAssetOnce(input: {
  domain: "slideshow" | "ugc"
  ownerId: string
  relativePath: string
}) {
  const relativePath = safeAssetPath(input)
  await clients().objects.deleteFile(
    bucketForPath(relativePath),
    fileIdForPath(relativePath)
  )
}

function safeAssetPath(input: {
  domain: "slideshow" | "ugc"
  ownerId: string
  relativePath: string
}) {
  const value = clean(input.relativePath).replace(/^data\//, "")
  if (value.includes("..") || value.startsWith("/")) {
    throw new Error("Unsafe pipeline asset path")
  }
  const allowed =
    input.domain === "slideshow"
      ? value.startsWith("slideshows/outputs/") ||
        value.startsWith("image-collections/") ||
        value.startsWith("assets/")
      : value.startsWith(
          `ugc_avatar_videos/${required(input.ownerId, "owner")}/`
        )
  if (!allowed) throw new Error(`Unsupported ${input.domain} asset path`)
  return value
}

function parseData(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function rowNamespace(config: DomainConfig) {
  return config.route.table === "outputs" ||
    config.route.table === "permanent_assets"
    ? `${config.route.table}:${config.route.sourceKey}`
    : config.route.table
}

function clients() {
  return getRuntimeStore()
}

function required(value: unknown, label: string) {
  const result = clean(value)
  if (!result) throw new Error(`${label} is required`)
  return result
}

function status(error: unknown) {
  return isRecord(error) ? Number(error.code) : 0
}
