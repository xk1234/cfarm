import "server-only"

import {
  STORE_ROUTES,
  bucketForPath,
  fileIdForPath,
  ownedRowIdFor,
  type StoreRoute,
} from "@/lib/store-identity"
import {
  extractOutputMedia,
  outputMediaRowId,
  storageReferenceForUrl,
  type OutputMediaDraft,
} from "@/lib/consolidated-records"
import { clean, isRecord } from "@/lib/guards"
import {
  deleteDomainRecord,
  deleteOutputMediaRecord,
  getDomainRecord,
  insertOutputMediaOnce,
  listDomainRecords,
  listOutputMedia,
  putDomainRecords,
  syncOutputMedia,
} from "@/lib/railway/domain-record-store"
import {
  readRailwayObject,
  railwayObjectExists,
  railwayObjectKey,
  deleteRailwayObject,
  putRailwayObject,
} from "@/lib/railway/object-storage"

export type PipelineStorageDomain =
  | "automations"
  | "image-collections"
  | "model-settings"
  | "word-collections"
  | "usage-history"
  | "automation-runs"
  | "x-automations"
  | "x-runs"
  | "ugc-outputs"
  | "results"

type DomainConfig = {
  route: StoreRoute
  id: (record: Record<string, unknown>) => string
}

const DOMAINS: Record<PipelineStorageDomain, DomainConfig> = {
  automations: {
    route: STORE_ROUTES["automations/automations.json"],
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
  "automation-runs": {
    route: STORE_ROUTES["automations/runs.json"],
    id: (record) => clean(record.id),
  },
  "x-automations": {
    route: STORE_ROUTES["x-automations/automations.json"],
    id: (record) => clean(record.id),
  },
  "x-runs": {
    route: STORE_ROUTES["x-automations/runs.json"],
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

function consolidated(route: StoreRoute) {
  return route.table === "outputs" || route.table === "permanent_assets"
}

function rowNamespace(config: DomainConfig) {
  return consolidated(config.route)
    ? `${config.route.table}:${config.route.sourceKey}`
    : config.route.table
}

function required(value: unknown, label: string) {
  const result = clean(value)
  if (!result) throw new Error(`${label} is required`)
  return result
}

export async function readPipelineDomainPageOnce(input: {
  domain: PipelineStorageDomain
  ownerId: string
  cursor?: string
  limit?: number
}): Promise<DomainPage> {
  const config = DOMAINS[input.domain]
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 100)))
  const offset = Number(clean(input.cursor)) || 0
  const rows = await listDomainRecords({
    table: config.route.table,
    sourceKey: consolidated(config.route) ? config.route.sourceKey : null,
    ownerIds: [required(input.ownerId, "owner")],
    limit,
    offset,
    order: "asc",
  })
  return {
    records: rows.flatMap((row) => {
      const record = row.payload
      return isRecord(record)
        ? [{ rowId: row.rowId, record }]
        : []
    }),
    nextCursor:
      rows.length === limit ? String(offset + limit) : null,
  }
}

export async function readPipelineDomainDocumentOnce(input: {
  domain: PipelineStorageDomain
  ownerId: string
  id: string
}): Promise<{ rowId: string; record: Record<string, unknown> } | null> {
  const config = DOMAINS[input.domain]
  const rowId = pipelineDomainRowId(input.domain, input.ownerId, input.id)
  const row = await getDomainRecord(config.route.table, rowId)
  return row && isRecord(row.payload)
    ? { rowId, record: row.payload }
    : null
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
    fields: input.record,
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

async function putPipelineDocument(input: Parameters<typeof preparePipelineDomainDocument>[0]) {
  const config = DOMAINS[input.domain]
  const prepared = preparePipelineDomainDocument(input)
  await putDomainRecords([
    {
      table: config.route.table,
      rowId: prepared.rowId,
      ownerId: required(input.ownerId, "owner"),
      sourceKey: consolidated(config.route) ? config.route.sourceKey : null,
      rid: required(config.id(input.record), `${input.domain} record id`),
      name:
        typeof input.record.name === "string"
          ? input.record.name.slice(0, 2048)
          : typeof input.record.title === "string"
            ? input.record.title.slice(0, 2048)
            : null,
      status:
        typeof input.record.status === "string"
          ? input.record.status.slice(0, 255)
          : null,
      ord: Number.isFinite(input.ordinal) ? input.ordinal : -Date.now(),
      payload: prepared.fields,
      sourceRow: {},
    },
  ])
  if (config.route.table === "outputs") await syncPipelineMedia(prepared)
  return prepared
}

async function syncPipelineMedia(prepared: ReturnType<typeof preparePipelineDomainDocument>) {
  const ownerId = required((prepared.fields.ownerId as string) || "", "owner")
  await syncOutputMedia({
    outputId: prepared.rowId,
    ownerId,
    media: prepared.media.map((item) => ({
      ...item,
      id: outputMediaRowId(prepared.rowId, item),
      ...storageReferenceForUrl(item.url),
    })),
  })
}

export async function createPipelineDomainDocumentOnce(
  input: Parameters<typeof preparePipelineDomainDocument>[0]
) {
  return putPipelineDocument(input)
}

export async function updatePipelineDomainDocumentOnce(
  input: Parameters<typeof preparePipelineDomainDocument>[0]
) {
  return putPipelineDocument(input)
}

export async function readOutputMediaPageOnce(input: {
  ownerId: string
  outputRowId: string
  cursor?: string
  limit?: number
}) {
  required(input.ownerId, "owner")
  const offset = Number(clean(input.cursor)) || 0
  const all = (await listOutputMedia([
    required(input.outputRowId, "output row"),
  ])).slice(offset, offset + Math.max(1, Math.min(100, input.limit ?? 100)))
  return {
    media: all.map((row) => ({
      rowId: row.id,
      kind: row.kind,
      role: row.role,
      position: row.position,
      url: row.url,
    })),
    nextCursor:
      all.length >= Math.max(1, Math.min(100, input.limit ?? 100))
        ? String(offset + all.length)
        : null,
  }
}

export async function createOutputMediaOnce(input: {
  ownerId: string
  outputRowId: string
  media: OutputMediaDraft
}) {
  const outputRowId = required(input.outputRowId, "output row")
  const rowId = outputMediaRowId(outputRowId, input.media)
  const storage = storageReferenceForUrl(input.media.url)
  await insertOutputMediaOnce({
    id: rowId,
    outputId: outputRowId,
    ownerId: required(input.ownerId, "owner"),
    kind: input.media.kind,
    role: input.media.role,
    position: input.media.position,
    url: input.media.url,
    storageBucket: storage?.bucket ?? null,
    storageFileId: storage?.fileId ?? null,
    storagePath: storage?.path ?? null,
  })
  return { rowId }
}

export async function deleteOutputMediaOnce(input: {
  ownerId: string
  outputRowId: string
  media: OutputMediaDraft
}) {
  required(input.ownerId, "owner")
  await removeOutputMediaById(
    outputMediaRowId(required(input.outputRowId, "output row"), input.media)
  )
}

async function removeOutputMediaById(id: string) {
  await deleteOutputMediaRecord({ id })
}

function unsafeAssetPath(input: {
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

function objectIdentity(relativePath: string) {
  return railwayObjectKey(bucketForPath(relativePath), fileIdForPath(relativePath))
}

export async function readDomainAssetOnce(input: {
  domain: "slideshow" | "ugc"
  ownerId: string
  relativePath: string
}) {
  const relativePath = unsafeAssetPath(input)
  return readRailwayObject(objectIdentity(relativePath))
}

export async function inspectDomainAssetOnce(input: {
  domain: "slideshow" | "ugc"
  ownerId: string
  relativePath: string
}) {
  const relativePath = unsafeAssetPath(input)
  return { exists: await railwayObjectExists(objectIdentity(relativePath)) }
}

export async function createDomainAssetOnce(input: {
  domain: "slideshow" | "ugc"
  ownerId: string
  relativePath: string
  bytes: Buffer | Uint8Array
}) {
  const relativePath = unsafeAssetPath(input)
  await putRailwayObject({
    key: objectIdentity(relativePath),
    body: Buffer.from(input.bytes),
  })
  return { relativePath, url: `/api/local-assets/${relativePath}` }
}

export async function deleteDomainAssetOnce(input: {
  domain: "slideshow" | "ugc"
  ownerId: string
  relativePath: string
}) {
  const relativePath = unsafeAssetPath(input)
  await deleteRailwayObject(objectIdentity(relativePath))
}

export { deleteDomainRecord as deletePipelineDomainDocument }
