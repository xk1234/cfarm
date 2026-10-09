/**
 * Media ingestion: bytes → private `media` bucket + `media` row
 * (docs/refactor/03-appwrite-data-layer.md §3.4).
 *
 * - Only raster images and the three video containers are accepted (no SVG:
 *   it can carry script and the bucket refuses it anyway).
 * - Images are sniffed with sharp: the real format wins over the declared
 *   MIME type, and width/height are recorded for slot fitting.
 * - The same bytes are stored once per workspace: a file with an equal sha256
 *   is reused, and a collection never holds the same image twice.
 */
import {
  newId,
  sha256Hex,
  type Media,
  type MediaKind,
  type MediaSource,
  type Repositories,
  type Upserted,
  type WorkspaceId,
} from "@/lib/data"

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/heic"] as const
export const VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const
export const MAX_MEDIA_BYTES = 25 * 1024 * 1024

export class MediaRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MediaRejectedError"
  }
}

const FORMAT_MIME: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  heif: "image/heic",
}

export type IngestMediaInput = {
  bytes: Uint8Array
  /** Declared MIME type (browser/remote header); verified for images. */
  mime: string
  source: MediaSource
  createdBy: string
  collectionId?: string | null
  name?: string | null
  caption?: string | null
  sourceUrl?: string | null
  attribution?: string | null
  position?: number | null
}

type Probe = { kind: MediaKind; mime: string; width: number | null; height: number | null }

async function probe(bytes: Uint8Array, declared: string): Promise<Probe> {
  const mime = declared.split(";")[0].trim().toLowerCase()
  if ((VIDEO_MIME_TYPES as readonly string[]).includes(mime)) {
    return { kind: "video", mime, width: null, height: null }
  }
  const sharp = (await import("sharp")).default
  let metadata: { format?: string; width?: number; height?: number }
  try {
    metadata = await sharp(bytes, { failOn: "error", animated: true }).metadata()
  } catch {
    throw new MediaRejectedError("The file is not a supported image or video.")
  }
  const sniffed = metadata.format ? FORMAT_MIME[metadata.format] : undefined
  if (!sniffed) throw new MediaRejectedError(`Unsupported image format${metadata.format ? ` (${metadata.format})` : ""}.`)
  return { kind: "image", mime: sniffed, width: metadata.width ?? null, height: metadata.height ?? null }
}

export async function ingestMedia(
  repos: Repositories,
  workspaceId: WorkspaceId,
  input: IngestMediaInput
): Promise<Upserted<Media>> {
  if (input.bytes.byteLength === 0) throw new MediaRejectedError("The file is empty.")
  if (input.bytes.byteLength > MAX_MEDIA_BYTES) {
    throw new MediaRejectedError(`Files must be ${MAX_MEDIA_BYTES / 1024 / 1024} MB or smaller.`)
  }
  const info = await probe(input.bytes, input.mime)
  const sha256 = sha256Hex(input.bytes)
  const collectionId = input.collectionId ?? null

  // Reuse an existing stored file with the same content.
  let fileId: string | null = null
  for (const existing of await repos.media.findBySha256(workspaceId, sha256)) {
    if (existing.collectionId === collectionId) return { value: existing, created: false }
    if (!fileId && (await repos.blobs.head(workspaceId, "media", existing.fileId))) fileId = existing.fileId
  }
  if (!fileId) {
    fileId = newId()
    await repos.blobs.put(workspaceId, "media", fileId, input.bytes, info.mime)
  }

  return repos.media.create(workspaceId, {
    collectionId,
    kind: info.kind,
    fileId,
    mimeType: info.mime,
    sizeBytes: input.bytes.byteLength,
    width: info.width,
    height: info.height,
    sha256,
    name: input.name ?? null,
    caption: input.caption ?? null,
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    attribution: input.attribution ?? null,
    position: input.position ?? null,
    createdBy: input.createdBy,
  })
}

/** App URL of a media file (served by the ownership-checked file route). */
export function mediaFileUrl(media: Pick<Media, "fileId">): string {
  return `/api/files/media/${encodeURIComponent(media.fileId)}`
}

/** Parses `/api/files/media/<fileId>` (absolute or relative); null otherwise. */
export function mediaFileIdFromUrl(value: string): string | null {
  let pathname: string
  try {
    pathname = new URL(value, "https://lumenclip.invalid").pathname
  } catch {
    return null
  }
  const match = pathname.match(/^\/api\/files\/media\/([^/]+)$/)
  if (!match) return null
  try {
    const id = decodeURIComponent(match[1])
    return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(id) ? id : null
  } catch {
    return null
  }
}
