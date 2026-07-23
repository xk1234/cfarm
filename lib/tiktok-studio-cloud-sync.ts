import "server-only"

import crypto from "node:crypto"

import type { PostFastMetricSnapshot } from "@/lib/postfast-metric-snapshots"

const DEFAULT_CLOUD_ORIGIN = "https://cfarm-eight.vercel.app"
const CLOUD_SYNC_PATH = "/api/tiktok-studio-analytics/cloud-sync"

export async function syncTikTokStudioSnapshotToCloud(input: {
  snapshot: PostFastMetricSnapshot
  requestUrl: string
  fetchImpl?: typeof fetch
}) {
  const cloudOrigin = tiktokStudioCloudOrigin()
  const requestOrigin = new URL(input.requestUrl).origin
  if (cloudOrigin === requestOrigin) {
    return { synced: false, reason: "already-cloud" as const }
  }

  const response = await (input.fetchImpl ?? fetch)(
    new URL(CLOUD_SYNC_PATH, cloudOrigin),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${captureSecret()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ snapshot: input.snapshot }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }
  )
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string
    snapshotId?: string
  }
  if (!response.ok) {
    throw new Error(
      payload.error || `Cloud analytics sync failed (${response.status})`
    )
  }
  return {
    synced: true,
    snapshotId: payload.snapshotId || input.snapshot.id,
  }
}

export function tiktokStudioCloudOrigin() {
  const configured =
    process.env.TIKTOK_STUDIO_CLOUD_ORIGIN?.trim() ||
    process.env.BASE_URL?.trim() ||
    DEFAULT_CLOUD_ORIGIN
  const url = new URL(configured)
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("TikTok Studio cloud origin must use HTTP or HTTPS")
  }
  return url.origin
}

export function authorizeTikTokStudioCloudSync(value: string | null) {
  const supplied = value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!supplied) return false
  const left = Buffer.from(supplied)
  const right = Buffer.from(captureSecret())
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

export function tiktokStudioCloudOwnerId() {
  return (
    process.env.LUMENCLIP_MCP_OWNER_ID?.trim() ||
    process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim() ||
    ""
  )
}

function captureSecret() {
  const secret = process.env.TIKTOK_STUDIO_CAPTURE_SECRET?.trim()
  if (!secret) {
    throw new Error("TikTok Studio cloud sync signing is not configured")
  }
  return secret
}
