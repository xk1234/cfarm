import "server-only"

import crypto from "node:crypto"

import { getCurrentUser } from "@/lib/auth"
import {
  listDomainRecords,
  putDomainRecords,
  type DomainRecord,
} from "@/lib/railway/domain-record-store"
import { railwayPostRepository } from "@/lib/post-repository-store"
import type { PostFastPostRecord } from "@/lib/postfast-posts"
import { publicationRecordSummary } from "@/lib/publication-record"
import {
  postFromPostFastRecord,
  postToPostFastRecord,
  type Post,
} from "@/lib/posts"
import { systemOwnerId } from "@/lib/system-owner-context"

type OutputPayload = Record<string, unknown> & {
  publications?: unknown
}

export async function listOutputPublications(): Promise<PostFastPostRecord[]> {
  const ownerId = await publicationOwnerId()
  const rows = await outputRows(ownerId)
  return rows.flatMap((row) => parsePublications(publicationValue(row)))
}

export function outputPublicationsOwnerId(): Promise<string> {
  return publicationOwnerId()
}

export async function listOutputPublicationsForSources(input: {
  entityIds?: string[]
  runIds?: string[]
}): Promise<PostFastPostRecord[]> {
  const entityIds = cleanIds(input.entityIds)
  const runIds = cleanIds(input.runIds)
  if (!entityIds.length && !runIds.length) return []
  const rows = await outputRows(await publicationOwnerId())
  const selected = rows.filter((row) => {
    if (runIds.includes(payloadString(row.payload, "runId"))) return true
    if (entityIds.includes(payloadString(row.payload, "sourceId"))) return true
    if (entityIds.includes(row.rid ?? "")) return true
    return false
  })
  return selected.flatMap((row) => parsePublications(publicationValue(row)))
}

export async function writeOutputPublications(
  records: PostFastPostRecord[]
): Promise<void> {
  if (!records.length) return
  const ownerId = await publicationOwnerId()
  for (const record of records) {
    const post = postFromPostFastRecord(record, ownerId)
    await railwayPostRepository.upsertPost(post, {
      writeState: "reconciled",
    })
    await upsertPublicationWrapper(ownerId, record)
  }
}

export async function writeCanonicalPostWithLegacyProjection(
  post: Post,
  record: PostFastPostRecord
) {
  const resolved = await railwayPostRepository.upsertPost(post, {
    writeState: "reconciled",
  })
  await upsertPublicationWrapper(
    resolved.ownerId,
    {
      ...postToPostFastRecord(resolved),
      content: record.content,
      analytics: record.analytics,
      lastAnalyticsSyncedAt: record.lastAnalyticsSyncedAt,
    },
    record
  )
  return resolved
}

export class PostDualWriteError extends Error {
  readonly code = "post_dual_write_incomplete"
  readonly retryable = true

  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "PostDualWriteError"
  }
}

async function outputRows(ownerId: string): Promise<DomainRecord[]> {
  return listDomainRecords({
    table: "outputs",
    ownerIds: [ownerId],
    limit: 1000,
    order: "none",
  })
}

function publicationValue(row: DomainRecord): unknown {
  if (row.payload && typeof row.payload === "object") {
    return (row.payload as OutputPayload).publications
  }
  return row.sourceRow.publications
}

async function upsertPublicationWrapper(
  ownerId: string,
  record: PostFastPostRecord,
  analyticsOverride?: Partial<PostFastPostRecord>
) {
  const rows = await outputRows(ownerId)
  const existing =
    rows.find((row) =>
      parsePublications(publicationValue(row)).some(
        (publication) => publication.id === record.id
      )
    ) ??
    rows.find((row) => outputMatchesPublication(row, record)) ??
    null
  const currentPublications = existing
    ? parsePublications(publicationValue(existing))
    : []
  const projected = analyticsOverride
    ? {
        ...record,
        analytics: analyticsOverride.analytics ?? record.analytics,
        lastAnalyticsSyncedAt:
          analyticsOverride.lastAnalyticsSyncedAt ??
          record.lastAnalyticsSyncedAt,
      }
    : record
  const publications = [
    projected,
    ...currentPublications.filter((publication) => publication.id !== record.id),
  ]
  const summary = publicationRecordSummary(publications)

  if (existing) {
    const payload = isRecord(existing.payload)
      ? ({ ...existing.payload, publications } as OutputPayload)
      : ({ id: existing.rid ?? record.id, publications } as OutputPayload)
    await putDomainRecords([
      {
        table: "outputs",
        rowId: existing.rowId,
        ownerId,
        sourceKey: existing.sourceKey,
        rid: existing.rid,
        name: existing.name,
        status: summary.status,
        ord: existing.ord,
        payload,
        sourceRow: {
          ...existing.sourceRow,
          publication_status: summary.status,
          scheduled_at: summary.scheduledAt,
          published_at: summary.publishedAt,
          primary_post_id: summary.postId,
          primary_release_url: summary.releaseUrl,
          updated_at: new Date().toISOString(),
        },
      },
    ])
    return existing
  }

  const now = new Date().toISOString()
  const rid = `published-${record.sourceType}-${crypto.createHash("sha256").update(record.sourceId).digest("hex").slice(0, 18)}`
  const rowId = `o${crypto.createHash("sha256").update(`outputs:publication_wrapper:${ownerId}:${rid}`).digest("hex").slice(0, 35)}`
  const payload: OutputPayload = {
    id: rid,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    createdAt: now,
    updatedAt: now,
    publications,
  }
  const sourceRow = {
    owner_id: ownerId,
    rid,
    source_key: "publication_wrapper",
    kind:
      record.sourceType === "generated_video" || record.sourceType === "greenscreen"
        ? "video"
        : record.sourceType === "image"
          ? "image"
          : record.sourceType === "slideshow"
            ? "slideshow"
            : "social_post",
    subtype: record.provider,
    status: "ready",
    title: record.content.slice(0, 2048),
    caption: record.content,
    text: record.content,
    source_run_id:
      record.sourceType === "automation" || record.sourceType === "x_automation"
        ? record.sourceId
        : null,
    source_entity_id: record.sourceId,
    publication_status: summary.status,
    scheduled_at: summary.scheduledAt,
    published_at: summary.publishedAt,
    primary_post_id: summary.postId,
    primary_release_url: summary.releaseUrl,
    created_at: now,
    updated_at: now,
  }
  await putDomainRecords([
    {
      table: "outputs",
      rowId,
      ownerId,
      sourceKey: "publication_wrapper",
      rid,
      name: record.content.slice(0, 2048) || "Published output",
      status: "ready",
      ord: -Date.now(),
      payload,
      sourceRow,
    },
  ])
  return null
}

function outputMatchesPublication(
  row: DomainRecord,
  record: PostFastPostRecord
) {
  if (
    record.sourceType === "automation" ||
    record.sourceType === "x_automation"
  ) {
    return row.sourceRow.source_run_id === record.sourceId
  }
  return (
    row.sourceRow.source_entity_id === record.sourceId ||
    row.rid === record.sourceId
  )
}

function parsePublications(value: unknown): PostFastPostRecord[] {
  if (Array.isArray(value)) return value as PostFastPostRecord[]
  if (typeof value !== "string" || !value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as PostFastPostRecord[]) : []
  } catch {
    return []
  }
}

function cleanIds(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()))]
    .filter(Boolean)
    .slice(0, 100)
}

function payloadString(payload: unknown, key: string) {
  return isRecord(payload) && typeof payload[key] === "string"
    ? (payload[key] as string)
    : ""
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

async function publicationOwnerId(): Promise<string> {
  const workerOwner = systemOwnerId()
  if (workerOwner) return workerOwner
  try {
    const user = await getCurrentUser()
    if (user) return user.$id
  } catch {
    // Maintenance scripts can set the system owner explicitly.
  }
  const configured = process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim()
  if (configured) return configured
  throw new Error("Authentication is required to access output publications.")
}
