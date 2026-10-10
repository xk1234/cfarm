/**
 * Image collections on the Appwrite data layer: a `collections` row per
 * collection and one `media` row per item, with bytes in the private `media`
 * bucket. Remote picks (Pinterest, Pexels, URL imports) are copied into
 * storage at pick time so renders stay reproducible.
 *
 * `StoredImageCollection` is the wire shape the collections UI and MCP tools
 * already use; it is now a view assembled from the rows.
 */
import { clean } from "@/lib/guards"
import {
  DataConflictError,
  getRepositories,
  type Collection,
  type Media,
  type Repositories,
  type WorkspaceId,
} from "@/lib/data"
import { fetchRemoteMedia } from "@/lib/files/remote-fetch"
import { ingestMedia, mediaFileIdFromUrl, mediaFileUrl } from "@/lib/files/ingest"

export type StoredImageCollection = {
  /** Collection row id (absent on input that has not been saved yet). */
  id?: string
  name: string
  created_at: string
  pinned?: boolean
  deletedAt?: string
  deletedUntil?: string
  images: {
    image_link: string
    caption: string
    hash?: string
    /** Media row id. */
    media_id?: string
    last_used_at?: string
  }[]
}

export type ImageCollectionDeleteInput = Pick<StoredImageCollection, "name" | "created_at">

export type CollectionWriteOptions = {
  repos?: Repositories
  createdBy?: string
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>
  /** SSRF check override (tests only). */
  assertUrl?: (url: string) => Promise<unknown>
}

const MAX_IMPORT_IMAGES = 80
const MAX_IMPORT_IMAGE_BYTES = 16 * 1024 * 1024

async function allMedia(repos: Repositories, workspaceId: WorkspaceId, collectionId: string): Promise<Media[]> {
  const out: Media[] = []
  let cursor: string | null = null
  do {
    const page = await repos.media.list(workspaceId, { collectionId, limit: 100, cursor })
    out.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return out
}

async function allCollections(repos: Repositories, workspaceId: WorkspaceId, includeDeleted: boolean) {
  const out: Collection[] = []
  let cursor: string | null = null
  do {
    const page = await repos.collections.list(workspaceId, { includeDeleted, limit: 100, cursor })
    out.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return out
}

function toStored(collection: Collection, media: Media[]): StoredImageCollection {
  return {
    id: collection.id,
    name: collection.name,
    created_at: collection.createdAt,
    pinned: collection.pinned,
    ...(collection.deletedAt ? { deletedAt: collection.deletedAt } : {}),
    ...(collection.purgeAfter ? { deletedUntil: collection.purgeAfter } : {}),
    images: media.map((m) => ({
      image_link: mediaFileUrl(m),
      caption: m.caption ?? "",
      hash: m.sha256,
      media_id: m.id,
    })),
  }
}

async function storedView(repos: Repositories, workspaceId: WorkspaceId, collection: Collection) {
  return toStored(collection, await allMedia(repos, workspaceId, collection.id))
}

export async function listImageCollections(
  workspaceId: WorkspaceId,
  options: { includeDeleted?: boolean; repos?: Repositories } = {}
): Promise<StoredImageCollection[]> {
  const repos = options.repos ?? getRepositories()
  const collections = await allCollections(repos, workspaceId, options.includeDeleted === true)
  return Promise.all(collections.map((c) => storedView(repos, workspaceId, c)))
}

async function findOrCreateCollection(
  repos: Repositories,
  workspaceId: WorkspaceId,
  name: string,
  createdBy: string
): Promise<Collection> {
  const existing = await repos.collections.getByName(workspaceId, name)
  if (existing) {
    return existing.deletedAt ? repos.collections.restore(workspaceId, existing.id) : existing
  }
  try {
    return await repos.collections.create(workspaceId, { name, createdBy })
  } catch (error) {
    // Lost a race with a concurrent create of the same name.
    if (error instanceof DataConflictError) {
      const raced = await repos.collections.getByName(workspaceId, name)
      if (raced) return raced
    }
    throw error
  }
}

async function ingestRemote(
  repos: Repositories,
  workspaceId: WorkspaceId,
  input: {
    url: string
    collectionId: string
    caption?: string
    sourceUrl?: string
    createdBy: string
  },
  options: CollectionWriteOptions
) {
  const remote = await fetchRemoteMedia(input.url, {
    maxBytes: MAX_IMPORT_IMAGE_BYTES,
    referer: safeHttpUrl(input.sourceUrl ?? "") || undefined,
    fetchImpl: options.fetchImpl,
    assertUrl: options.assertUrl,
  })
  return ingestMedia(repos, workspaceId, {
    bytes: remote.bytes,
    mime: remote.mime,
    source: sourceForUrl(input.sourceUrl || input.url),
    collectionId: input.collectionId,
    caption: clean(input.caption) || null,
    sourceUrl: safeHttpUrl(input.sourceUrl ?? "") || remote.finalUrl,
    createdBy: input.createdBy,
  })
}

/**
 * Saves a collection by name: creates or restores it, applies `pinned`, and
 * makes its items match `images` (in order). Stored files are referenced by
 * `/api/files/media/<id>` links; remote http(s) links are downloaded.
 */
export async function upsertImageCollection(
  workspaceId: WorkspaceId,
  collection: StoredImageCollection,
  options: CollectionWriteOptions = {}
): Promise<StoredImageCollection> {
  const repos = options.repos ?? getRepositories()
  const createdBy = options.createdBy ?? workspaceId
  const name = clean(collection.name) || "Untitled collection"
  // A saved collection is addressed by id, so a new name renames it instead of
  // creating a second collection; unsaved ones are found or created by name.
  const saved = collection.id ? await repos.collections.get(workspaceId, collection.id) : null
  let row =
    saved && !saved.deletedAt
      ? saved.name === name
        ? saved
        : await repos.collections.rename(workspaceId, saved.id, name)
      : await findOrCreateCollection(repos, workspaceId, name, createdBy)
  if (row.pinned !== (collection.pinned === true)) {
    row = await repos.collections.setPinned(workspaceId, row.id, collection.pinned === true)
  }

  const current = await allMedia(repos, workspaceId, row.id)
  const byFile = new Map(current.map((m) => [m.fileId, m]))
  const bySha = new Map(current.map((m) => [m.sha256, m]))
  const desired: string[] = []
  for (const image of Array.isArray(collection.images) ? collection.images : []) {
    const link = clean(image.image_link)
    if (!link) continue
    const hash = clean(image.hash)
    const fileId = mediaFileIdFromUrl(link)
    let media: Media | undefined = (fileId ? byFile.get(fileId) : undefined) ?? (hash ? bySha.get(hash) : undefined)
    if (!media && fileId) {
      const blob = await repos.blobs.get(workspaceId, "media", fileId)
      if (!blob) continue
      media = (
        await ingestMedia(repos, workspaceId, {
          bytes: blob.bytes,
          mime: blob.mime,
          source: "upload",
          collectionId: row.id,
          caption: clean(image.caption) || null,
          createdBy,
        })
      ).value
    } else if (!media && safeHttpUrl(link)) {
      media = (
        await ingestRemote(
          repos,
          workspaceId,
          { url: link, collectionId: row.id, caption: image.caption, createdBy },
          options
        )
      ).value
    }
    if (!media || desired.includes(media.id)) continue
    byFile.set(media.fileId, media)
    bySha.set(media.sha256, media)
    desired.push(media.id)
  }

  const keep = new Set(desired)
  for (const m of current) {
    if (!keep.has(m.id)) await repos.media.softDelete(workspaceId, m.id)
  }
  const positions = new Map(current.map((m) => [m.id, m.position]))
  for (const [index, id] of desired.entries()) {
    if (positions.get(id) !== index) await repos.media.move(workspaceId, id, row.id, index)
  }
  const refreshed = (await repos.collections.get(workspaceId, row.id)) ?? row
  return storedView(repos, workspaceId, refreshed)
}

/** Kept for the captions route signature; captions are part of the item set. */
export async function updateImageCollectionCaptions(
  workspaceId: WorkspaceId,
  collection: StoredImageCollection,
  options: CollectionWriteOptions = {}
) {
  return upsertImageCollection(workspaceId, collection, options)
}

export async function deleteImageCollections(
  workspaceId: WorkspaceId,
  collections: ImageCollectionDeleteInput[],
  options: { repos?: Repositories } = {}
) {
  const repos = options.repos ?? getRepositories()
  const names = [...new Set(collections.map((c) => clean(c.name)).filter(Boolean))]
  if (names.length === 0) throw new Error("No image collections selected")
  const deleted: StoredImageCollection[] = []
  for (const name of names) {
    const row = await repos.collections.getByName(workspaceId, name)
    if (!row || row.deletedAt) continue
    await repos.collections.softDelete(workspaceId, row.id)
    const after = await repos.collections.get(workspaceId, row.id)
    if (after) deleted.push(await storedView(repos, workspaceId, after))
  }
  return {
    deleted: deleted.length,
    deletedFiles: 0,
    deletedAt: deleted[0]?.deletedAt ?? new Date().toISOString(),
    deletedUntil: deleted[0]?.deletedUntil ?? new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    collections: deleted,
  }
}

export async function restoreImageCollections(
  workspaceId: WorkspaceId,
  collections: ImageCollectionDeleteInput[],
  options: { repos?: Repositories } = {}
) {
  const repos = options.repos ?? getRepositories()
  let restored = 0
  for (const name of new Set(collections.map((c) => clean(c.name)).filter(Boolean))) {
    const row = await repos.collections.getByName(workspaceId, name)
    if (!row?.deletedAt) continue
    await repos.collections.restore(workspaceId, row.id)
    restored += 1
  }
  return { restored }
}

export async function importRemoteImagesToCollection(
  workspaceId: WorkspaceId,
  input: {
    collectionName?: string
    collectionCreatedAt?: string
    images?: { url?: string; caption?: string; sourceUrl?: string }[]
  },
  options: CollectionWriteOptions = {}
) {
  const repos = options.repos ?? getRepositories()
  const createdBy = options.createdBy ?? workspaceId
  const images = dedupeImportImages(Array.isArray(input.images) ? input.images : []).slice(0, MAX_IMPORT_IMAGES)
  if (images.length === 0) throw new Error("No images to import")

  const name = clean(input.collectionName) || "Imported images"
  const row = await findOrCreateCollection(repos, workspaceId, name, createdBy)
  let imported = 0
  for (const [index, image] of images.entries()) {
    try {
      const { created } = await ingestRemote(
        repos,
        workspaceId,
        { url: image.url, collectionId: row.id, caption: image.caption, sourceUrl: image.sourceUrl, createdBy },
        options
      )
      if (created) imported += 1
    } catch (error) {
      throw new Error(`Failed to import image ${index + 1}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const refreshed = (await repos.collections.get(workspaceId, row.id)) ?? row
  return { collection: await storedView(repos, workspaceId, refreshed), imported }
}

function dedupeImportImages(images: { url?: string; caption?: string; sourceUrl?: string }[]) {
  const seen = new Set<string>()
  const next: { url: string; caption: string; sourceUrl: string }[] = []
  for (const image of images) {
    const url = clean(image.url)
    if (!safeHttpUrl(url) || seen.has(url)) continue
    seen.add(url)
    next.push({ url, caption: clean(image.caption), sourceUrl: clean(image.sourceUrl) })
  }
  return next
}

function sourceForUrl(url: string) {
  try {
    const host = new URL(url).hostname
    if (/(^|\.)pinimg\.com$|(^|\.)pinterest\.[a-z.]+$/.test(host)) return "pinterest" as const
    if (/(^|\.)pexels\.com$/.test(host)) return "pexels" as const
  } catch {
    // fall through
  }
  return "url" as const
}

function safeHttpUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : ""
  } catch {
    return ""
  }
}
