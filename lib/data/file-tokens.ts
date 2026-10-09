/**
 * Short-lived signed file URLs for the private buckets.
 *
 * A token names one (workspace, bucket, file) and an expiry, HMAC-signed with a
 * server secret. `GET /api/files/[bucket]/[id]?t=<token>` serves the file
 * without a session while the token is valid. This is how SocialBu
 * (`upload_media_by_url`) and other server-to-server fetches reach a render
 * without making a bucket public.
 */
import { createHmac, timingSafeEqual } from "node:crypto"

import { BUCKETS, type BucketId, type WorkspaceId } from "./types"

export type FileTokenClaims = {
  workspaceId: WorkspaceId
  bucket: BucketId
  fileId: string
  /** Unix seconds. */
  expiresAt: number
  download?: boolean
  filename?: string
}

/** Longest lifetime a signed URL may request (1 day). */
export const MAX_FILE_TOKEN_SECONDS = 24 * 60 * 60

export class FileTokenSecretMissingError extends Error {
  constructor() {
    super("FILE_URL_SECRET (or SLIDESHOW_SHARE_SECRET) must be set to sign file URLs.")
    this.name = "FileTokenSecretMissingError"
  }
}

export function fileTokenSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.FILE_URL_SECRET?.trim() || env.SLIDESHOW_SHARE_SECRET?.trim()
  if (secret) return secret
  if (env.VITEST || env.NODE_ENV === "test") return "test-file-url-secret"
  throw new FileTokenSecretMissingError()
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url")

function sign(payload: string, secret: string): string {
  return createHmac("sha256", `lumenclip-file-url:${secret}`).update(payload).digest("base64url")
}

export function createFileToken(claims: FileTokenClaims, secret = fileTokenSecret()): string {
  const payload = b64url(
    JSON.stringify({
      w: claims.workspaceId,
      b: claims.bucket,
      f: claims.fileId,
      e: claims.expiresAt,
      ...(claims.download ? { d: 1 } : {}),
      ...(claims.filename ? { n: claims.filename } : {}),
    })
  )
  return `${payload}.${sign(payload, secret)}`
}

/** Returns the claims when the token is authentic and unexpired, else null. */
export function verifyFileToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  secret = fileTokenSecret()
): FileTokenClaims | null {
  const [payload, signature, extra] = token.split(".")
  if (!payload || !signature || extra !== undefined) return null
  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  let raw: unknown
  try {
    raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  if (
    typeof r.w !== "string" ||
    typeof r.f !== "string" ||
    typeof r.e !== "number" ||
    !(BUCKETS as readonly unknown[]).includes(r.b)
  ) {
    return null
  }
  if (r.e < nowSeconds) return null
  return {
    workspaceId: r.w,
    bucket: r.b as BucketId,
    fileId: r.f,
    expiresAt: r.e,
    ...(r.d === 1 ? { download: true } : {}),
    ...(typeof r.n === "string" ? { filename: r.n } : {}),
  }
}

/** Public origin for absolute URLs (BASE_URL, then NEXT_PUBLIC_APP_URL). */
export function appBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.BASE_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"
  return raw.replace(/\/+$/, "")
}

/** Path of the ownership-checked file route. */
export function filePath(bucket: BucketId, fileId: string): string {
  return `/api/files/${bucket}/${encodeURIComponent(fileId)}`
}

export function signedFileUrl(
  claims: Omit<FileTokenClaims, "expiresAt"> & { expiresInSeconds: number },
  options: { now?: Date; baseUrl?: string; secret?: string } = {}
): string {
  const seconds = Math.max(1, Math.min(Math.floor(claims.expiresInSeconds), MAX_FILE_TOKEN_SECONDS))
  const expiresAt = Math.floor((options.now ?? new Date()).getTime() / 1000) + seconds
  const token = createFileToken(
    {
      workspaceId: claims.workspaceId,
      bucket: claims.bucket,
      fileId: claims.fileId,
      expiresAt,
      download: claims.download,
      filename: claims.filename,
    },
    options.secret
  )
  return `${options.baseUrl ?? appBaseUrl()}${filePath(claims.bucket, claims.fileId)}?t=${token}`
}
