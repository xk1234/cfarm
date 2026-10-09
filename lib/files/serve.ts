import "server-only"

/**
 * Ownership-checked file serving for `GET /api/files/[bucket]/[id]`.
 *
 * Access is granted by exactly one of:
 * 1. a valid signed token `?t=` (short-lived; see lib/data/file-tokens.ts),
 * 2. a workspace API key (`Authorization: Bearer lc_…`) with a read scope,
 * 3. the Clerk session of the workspace owner.
 * The file must belong to that workspace; anything else is a 404 (never 403,
 * so file ids cannot be probed). Buckets stay private.
 */
import { getCurrentUser } from "@/lib/auth"
import {
  BUCKETS,
  getRepositories,
  looksLikeApiKey,
  verifyFileToken,
  type ApiKeyScope,
  type BucketId,
  type Repositories,
} from "@/lib/data"

const READ_SCOPE: Record<BucketId, ApiKeyScope> = {
  media: "media:read",
  renders: "renders:read",
}

const SAFE_INLINE = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "video/webm",
])

export function isBucketId(value: string): value is BucketId {
  return (BUCKETS as readonly string[]).includes(value)
}

type Access = { workspaceId: string; via: "token" | "apikey" | "session"; download?: boolean; filename?: string }

async function resolveAccess(request: Request, bucket: BucketId, fileId: string, repos: Repositories): Promise<Access | null> {
  const url = new URL(request.url)
  const token = url.searchParams.get("t")
  if (token) {
    const claims = verifyFileToken(token)
    if (!claims || claims.bucket !== bucket || claims.fileId !== fileId) return null
    return { workspaceId: claims.workspaceId, via: "token", download: claims.download, filename: claims.filename }
  }

  const authorization = request.headers.get("authorization") ?? ""
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer) {
    if (!looksLikeApiKey(bearer)) return null
    const key = await repos.apiKeys.resolve(bearer)
    if (!key || !key.scopes.includes(READ_SCOPE[bucket])) return null
    await repos.apiKeys.touch(key.workspaceId, key.id, new Date().toISOString()).catch(() => undefined)
    return { workspaceId: key.workspaceId, via: "apikey" }
  }

  const user = await getCurrentUser()
  return user ? { workspaceId: user.$id, via: "session" } : null
}

function contentDisposition(kind: "inline" | "attachment", filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export async function serveFile(
  request: Request,
  bucketParam: string,
  fileId: string,
  repos: Repositories = getRepositories()
): Promise<Response> {
  const notFound = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } })
  if (!isBucketId(bucketParam)) return notFound()
  const bucket = bucketParam
  const access = await resolveAccess(request, bucket, fileId, repos)
  if (!access) return notFound()

  const blob = await repos.blobs.get(access.workspaceId, bucket, fileId)
  if (!blob) return notFound()

  const url = new URL(request.url)
  const download = access.download || url.searchParams.get("download") === "1"
  const filename = access.filename || url.searchParams.get("filename") || fileId
  const mime = blob.mime || "application/octet-stream"
  const inline = !download && SAFE_INLINE.has(mime)
  const body = blob.bytes.buffer.slice(blob.bytes.byteOffset, blob.bytes.byteOffset + blob.bytes.byteLength) as ArrayBuffer

  return new Response(body, {
    headers: {
      "content-type": inline ? mime : download ? mime : "application/octet-stream",
      "content-length": String(blob.bytes.byteLength),
      "content-disposition": contentDisposition(inline ? "inline" : "attachment", filename),
      "cache-control": access.via === "token" ? "private, max-age=300" : "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; img-src 'self'; media-src 'self'; sandbox",
    },
  })
}
