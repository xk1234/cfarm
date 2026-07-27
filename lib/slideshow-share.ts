import "server-only"

import crypto from "node:crypto"

import { clean } from "@/lib/guards"
import { listSlideshowRecords, type SlideshowRecord } from "@/lib/slideshows"
import { withSystemOwner } from "@/lib/system-owner-context"

type SlideshowShareClaims = {
  ownerId: string
  outputId: string
  expiresAt: number
}

const defaultLifetimeSeconds = 365 * 24 * 60 * 60

export function createSlideshowShareToken(input: {
  ownerId: string
  outputId: string
  expiresAt?: Date
}) {
  const claims: SlideshowShareClaims = {
    ownerId: required(input.ownerId, "owner"),
    outputId: required(input.outputId, "output"),
    expiresAt: Math.floor(
      (input.expiresAt?.getTime() ??
        Date.now() + defaultLifetimeSeconds * 1000) / 1000
    ),
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url")
  return `${payload}.${signature(payload)}`
}

export function verifySlideshowShareToken(
  token: string,
  expectedOutputId?: string
): SlideshowShareClaims | null {
  const [payload, providedSignature, ...rest] = clean(token).split(".")
  if (!payload || !providedSignature || rest.length > 0) return null
  const expectedSignature = signature(payload)
  const provided = Buffer.from(providedSignature)
  const expected = Buffer.from(expectedSignature)
  if (
    provided.length !== expected.length ||
    !crypto.timingSafeEqual(provided, expected)
  ) {
    return null
  }
  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<SlideshowShareClaims>
    if (
      !clean(claims.ownerId) ||
      !clean(claims.outputId) ||
      !Number.isFinite(claims.expiresAt) ||
      Number(claims.expiresAt) <= Math.floor(Date.now() / 1000) ||
      (expectedOutputId && claims.outputId !== expectedOutputId)
    ) {
      return null
    }
    return claims as SlideshowShareClaims
  } catch {
    return null
  }
}

export async function loadSharedSlideshow(
  outputId: string,
  token: string
): Promise<SlideshowRecord | null> {
  const claims = verifySlideshowShareToken(token, outputId)
  if (!claims) return null
  return withSystemOwner(claims.ownerId, async () => {
    const records = await listSlideshowRecords({ id: outputId, limit: 1 })
    return records[0] ?? null
  })
}

export function slideshowDeliveryPaths(input: {
  ownerId: string
  outputId: string
}) {
  const outputId = required(input.outputId, "output")
  const token = createSlideshowShareToken({ ...input, outputId })
  const encodedOutputId = encodeURIComponent(outputId)
  const encodedToken = encodeURIComponent(token)
  return {
    previewUrl: `/share/slideshows/${encodedOutputId}?token=${encodedToken}`,
    downloadUrl: `/api/public/slideshows/${encodedOutputId}/download?token=${encodedToken}`,
  }
}

export function slideshowDeliveryUrls(input: {
  baseUrl: string
  ownerId: string
  outputId: string
}) {
  const baseUrl = required(input.baseUrl, "base URL").replace(/\/$/, "")
  const paths = slideshowDeliveryPaths(input)
  return {
    previewUrl: `${baseUrl}${paths.previewUrl}`,
    downloadUrl: `${baseUrl}${paths.downloadUrl}`,
  }
}

function signature(payload: string) {
  return crypto
    .createHmac("sha256", slideshowShareSecret())
    .update(payload)
    .digest("base64url")
}

function slideshowShareSecret() {
  const secret =
    clean(process.env.SLIDESHOW_SHARE_SECRET) ||
    clean(process.env.APPWRITE_API_KEY)
  if (!secret) throw new Error("Slideshow public sharing is not configured.")
  return secret
}

function required(value: string, label: string) {
  const normalized = clean(value)
  if (!normalized) throw new Error(`A slideshow share ${label} is required.`)
  return normalized
}
