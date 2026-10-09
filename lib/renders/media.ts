/**
 * Stores user images (uploads, URL imports, Pexels/Pinterest picks) in the
 * private `media` bucket and records a `media` row. Deduplicates by sha256.
 */
import {
  newId,
  sha256Hex,
  type Media,
  type MediaSource,
  type Repositories,
  type WorkspaceId,
} from "@/lib/data"

import { fetchRemoteImage, imageDimensions, isSupportedImageMime, sniffImageMime, type RemoteFetchOptions } from "./assets"

export const MEDIA_UPLOAD_MAX_BYTES = 25 * 1024 * 1024

export class MediaInputError extends Error {
  readonly status: number
  constructor(message: string, status = 422) {
    super(message)
    this.name = "MediaInputError"
    this.status = status
  }
}

export type StoreMediaInput = {
  bytes: Uint8Array
  /** Declared type; the sniffed type wins when they differ. */
  mime?: string | null
  name?: string | null
  collectionId?: string | null
  source: MediaSource
  sourceUrl?: string | null
  attribution?: string | null
  caption?: string | null
  createdBy: string
}

export async function storeMedia(
  repos: Repositories,
  workspaceId: WorkspaceId,
  input: StoreMediaInput
): Promise<{ media: Media; created: boolean }> {
  if (input.bytes.byteLength === 0) throw new MediaInputError("The file is empty.")
  if (input.bytes.byteLength > MEDIA_UPLOAD_MAX_BYTES) {
    throw new MediaInputError(`Files are limited to ${MEDIA_UPLOAD_MAX_BYTES / 1024 / 1024} MB.`, 413)
  }
  const mime = sniffImageMime(input.bytes) ?? input.mime?.toLowerCase() ?? ""
  if (!isSupportedImageMime(mime)) throw new MediaInputError(`Unsupported image type "${mime || "unknown"}".`, 415)

  const collectionId = input.collectionId ?? null
  if (collectionId) {
    const collection = await repos.collections.get(workspaceId, collectionId)
    if (!collection || collection.deletedAt) throw new MediaInputError("Collection not found.", 404)
  }

  const sha256 = sha256Hex(input.bytes)
  const existing = await repos.media.findBySha256(workspaceId, sha256)
  const sameFile = existing.find((m) => !m.deletedAt)
  const fileId = sameFile?.fileId ?? newId()
  if (!sameFile || !(await repos.blobs.head(workspaceId, "media", fileId))) {
    await repos.blobs.put(workspaceId, "media", fileId, input.bytes, mime)
  }
  const size = imageDimensions(input.bytes)
  const { value, created } = await repos.media.create(workspaceId, {
    collectionId,
    kind: "image",
    fileId,
    mimeType: mime,
    sizeBytes: input.bytes.byteLength,
    width: size?.width ?? null,
    height: size?.height ?? null,
    sha256,
    name: input.name ?? null,
    caption: input.caption ?? null,
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    attribution: input.attribution ?? null,
    createdBy: input.createdBy,
  })
  return { media: value, created }
}

/** Imports a public image URL (SSRF-guarded, size-capped) into the media library. */
export async function importMediaFromUrl(
  repos: Repositories,
  workspaceId: WorkspaceId,
  input: Omit<StoreMediaInput, "bytes" | "mime" | "sourceUrl" | "source"> & {
    url: string
    source?: MediaSource
  },
  fetchOptions: RemoteFetchOptions = {}
) {
  const asset = await fetchRemoteImage(input.url, { maxBytes: MEDIA_UPLOAD_MAX_BYTES, ...fetchOptions })
  return storeMedia(repos, workspaceId, {
    ...input,
    bytes: asset.bytes,
    mime: asset.mime,
    source: input.source ?? "url",
    sourceUrl: input.url,
  })
}

/** Public view of a media row (no bucket/file internals). */
export function mediaView(media: Media) {
  return {
    id: media.id,
    collectionId: media.collectionId,
    kind: media.kind,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    width: media.width,
    height: media.height,
    name: media.name,
    caption: media.caption,
    source: media.source,
    sourceUrl: media.sourceUrl,
    attribution: media.attribution,
    position: media.position,
    createdAt: media.createdAt,
  }
}

/** Resolves a collection reference (id first, then exact name) to ordered live media ids. */
export async function collectionMediaIds(
  repos: Repositories,
  workspaceId: WorkspaceId,
  ref: string
): Promise<string[] | null> {
  const collection =
    (await repos.collections.get(workspaceId, ref)) ?? (await repos.collections.getByName(workspaceId, ref))
  if (!collection || collection.deletedAt) return null
  return repos.media.listIdsInCollection(workspaceId, collection.id)
}
