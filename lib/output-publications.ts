import crypto from "node:crypto"
import { Query } from "node-appwrite"

import { APPWRITE_DATABASE_ID, getAppwrite } from "@/lib/appwrite"
import { getCurrentUser } from "@/lib/auth"
import type { PostFastPostRecord } from "@/lib/postfast-posts"
import { systemOwnerId } from "@/lib/system-owner-context"

const PAGE = 100

type OutputRow = Record<string, unknown> & {
  $id: string
  rid?: string
  source_key?: string
  source_run_id?: string
  source_entity_id?: string
  publications?: string
}

export async function listOutputPublications(): Promise<PostFastPostRecord[]> {
  const ownerId = await publicationOwnerId()
  const rows = await listOutputRows(ownerId)
  return rows.flatMap((row) => parsePublications(row.publications))
}

export async function listOutputPublicationsForSources(input: {
  entityIds?: string[]
  runIds?: string[]
}): Promise<PostFastPostRecord[]> {
  const entityIds = cleanIds(input.entityIds)
  const runIds = cleanIds(input.runIds)
  if (entityIds.length === 0 && runIds.length === 0) return []

  const ownerId = await publicationOwnerId()
  const groups = await Promise.all([
    ...(entityIds.length
      ? [listOutputRows(ownerId, [Query.equal("source_entity_id", entityIds)])]
      : []),
    ...(runIds.length
      ? [listOutputRows(ownerId, [Query.equal("source_run_id", runIds)])]
      : []),
  ])
  const rows = new Map(groups.flat().map((row) => [row.$id, row]))
  return [...rows.values()].flatMap((row) =>
    parsePublications(row.publications)
  )
}

export async function writeOutputPublications(
  records: PostFastPostRecord[]
): Promise<void> {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")
  const ownerId = await publicationOwnerId()
  const rows = await listOutputRows(ownerId)
  const desiredById = new Map(records.map((record) => [record.id, record]))
  const assigned = new Set<string>()

  for (const row of rows) {
    const current = parsePublications(row.publications)
    const next = current.flatMap((record) => {
      const desired = desiredById.get(record.id)
      if (!desired) return []
      assigned.add(desired.id)
      return [desired]
    })
    if (samePublications(current, next)) continue
    await updateOutputPublications(row, next)
  }

  for (const record of records) {
    if (assigned.has(record.id)) continue
    const target =
      rows.find((row) => outputMatchesPublication(row, record)) ??
      (await createPublicationOutput(ownerId, record))
    const current = parsePublications(target.publications)
    const next = [record, ...current.filter((item) => item.id !== record.id)]
    await updateOutputPublications(target, next)
    target.publications = JSON.stringify(next)
  }
}

async function listOutputRows(
  ownerId: string,
  filters: string[] = []
): Promise<OutputRow[]> {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")
  const rows: OutputRow[] = []
  let cursor: string | null = null
  for (;;) {
    const queries = [
      Query.equal("owner_id", [ownerId]),
      ...filters,
      Query.limit(PAGE),
    ]
    if (cursor) queries.push(Query.cursorAfter(cursor))
    const response = await aw.tables.listRows(
      APPWRITE_DATABASE_ID,
      "outputs",
      queries
    )
    rows.push(...(response.rows as OutputRow[]))
    if (response.rows.length < PAGE) break
    cursor = response.rows.at(-1)?.$id ?? null
  }
  return rows
}

function cleanIds(values: string[] | undefined) {
  return [...new Set((values ?? []).map((value) => value.trim()))]
    .filter(Boolean)
    .slice(0, 100)
}

async function updateOutputPublications(
  row: OutputRow,
  publications: PostFastPostRecord[]
) {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")
  const summary = publicationSummary(publications)
  await aw.tables.updateRow(APPWRITE_DATABASE_ID, "outputs", row.$id, {
    publications: JSON.stringify(publications),
    publication_status: summary.status,
    scheduled_at: summary.scheduledAt,
    published_at: summary.publishedAt,
    primary_post_id: summary.postId,
    primary_release_url: summary.releaseUrl,
    updated_at: new Date().toISOString(),
  })
}

async function createPublicationOutput(
  ownerId: string,
  record: PostFastPostRecord
): Promise<OutputRow> {
  const aw = getAppwrite()
  if (!aw) throw new Error("Appwrite is not configured.")
  const now = new Date().toISOString()
  const rid = `published-${record.sourceType}-${crypto
    .createHash("sha256")
    .update(record.sourceId)
    .digest("hex")
    .slice(0, 18)}`
  const rowId = `o${crypto
    .createHash("sha256")
    .update(`outputs:publication_wrapper:${ownerId}:${rid}`)
    .digest("hex")
    .slice(0, 35)}`
  const data = {
    id: rid,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    createdAt: now,
    updatedAt: now,
  }
  const created = await aw.tables.upsertRow(
    APPWRITE_DATABASE_ID,
    "outputs",
    rowId,
    {
      rid,
      owner_id: ownerId,
      source_key: "publication_wrapper",
      name: record.content.slice(0, 120) || "Published output",
      kind: outputKind(record.sourceType),
      subtype: record.provider || null,
      status: "ready",
      storage_class: "permanent",
      origin: "deployed_app",
      title: record.content.slice(0, 2048) || "Published output",
      hook: null,
      caption: record.content,
      hashtags: "[]",
      text: record.content,
      text_data: "null",
      source_automation_id: null,
      source_run_id:
        record.sourceType === "automation" ||
        record.sourceType === "x_automation"
          ? record.sourceId
          : null,
      source_entity_id: record.sourceId,
      publication_status: null,
      scheduled_at: null,
      published_at: null,
      primary_post_id: null,
      primary_release_url: null,
      publications: "[]",
      evaluation: "null",
      error: null,
      created_raw: now,
      updated_at: now,
      migration_source: null,
      ord: -Date.now(),
      data: JSON.stringify(data),
    }
  )
  return created as OutputRow
}

function outputMatchesPublication(
  row: OutputRow,
  record: PostFastPostRecord
): boolean {
  if (
    parsePublications(row.publications).some(
      (publication) =>
        publication.sourceType === record.sourceType &&
        publication.sourceId === record.sourceId
    )
  ) {
    return true
  }
  if (
    record.sourceType === "automation" ||
    record.sourceType === "x_automation"
  ) {
    return row.source_run_id === record.sourceId
  }
  if (row.source_entity_id === record.sourceId || row.rid === record.sourceId) {
    if (record.sourceType === "generated_video") {
      return row.source_key === "generated_video"
    }
    if (record.sourceType === "slideshow") return row.source_key === "result"
    return true
  }
  return false
}

function publicationSummary(records: PostFastPostRecord[]) {
  const rank = [
    "published",
    "scheduled",
    "ready_for_review",
    "awaiting_manual_post",
    "failed",
    "draft",
  ]
  const primary =
    rank.flatMap((status) =>
      records.filter((record) => record.status === status)
    )[0] ?? null
  return {
    status: primary?.status ?? null,
    scheduledAt:
      records.find((record) => record.scheduledAt)?.scheduledAt ?? null,
    publishedAt:
      records.find((record) => record.publishedAt)?.publishedAt ?? null,
    postId:
      records.find((record) => record.postfastPostId)?.postfastPostId ?? null,
    releaseUrl: records.find((record) => record.releaseUrl)?.releaseUrl ?? null,
  }
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

function samePublications(
  left: PostFastPostRecord[],
  right: PostFastPostRecord[]
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function outputKind(sourceType: PostFastPostRecord["sourceType"]): string {
  if (sourceType === "generated_video" || sourceType === "greenscreen") {
    return "video"
  }
  if (sourceType === "image") return "image"
  if (sourceType === "slideshow") return "slideshow"
  return "social_post"
}

async function publicationOwnerId(): Promise<string> {
  const workerOwner = systemOwnerId()
  if (workerOwner) return workerOwner
  try {
    const user = await getCurrentUser()
    if (user) return user.$id
  } catch {
    // Scripts and isolated tests do not have a request context.
  }
  const configured = process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim()
  if (configured) return configured
  throw new Error("Authentication is required to access output publications.")
}
