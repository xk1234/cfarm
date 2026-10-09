import "server-only"

import crypto from "node:crypto"

import { getGeneratedVideoExport } from "@/lib/generated-videos"
import { clean } from "@/lib/guards"
import { withSystemOwner } from "@/lib/system-owner-context"

type GeneratedVideoShareClaims = {
  ownerId: string
  outputId: string
  expiresAt: number
}

const defaultLifetimeSeconds = 365 * 24 * 60 * 60

export function createGeneratedVideoShareToken(input: {
  ownerId: string
  outputId: string
  expiresAt?: Date
}) {
  const claims: GeneratedVideoShareClaims = {
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

export function verifyGeneratedVideoShareToken(
  token: string,
  expectedOutputId?: string
): GeneratedVideoShareClaims | null {
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
    ) as Partial<GeneratedVideoShareClaims>
    if (
      !clean(claims.ownerId) ||
      !clean(claims.outputId) ||
      !Number.isFinite(claims.expiresAt) ||
      Number(claims.expiresAt) <= Math.floor(Date.now() / 1000) ||
      (expectedOutputId && claims.outputId !== expectedOutputId)
    ) {
      return null
    }
    return claims as GeneratedVideoShareClaims
  } catch {
    return null
  }
}

export async function loadSharedGeneratedVideo(
  outputId: string,
  token: string
) {
  const claims = verifyGeneratedVideoShareToken(token, outputId)
  if (!claims) return null
  return withSystemOwner(claims.ownerId, async () => {
    const video = await getGeneratedVideoExport(outputId)
    return video?.status === "ready" && video.videoUrl ? video : null
  })
}

export function generatedVideoDeliveryPaths(input: {
  ownerId: string
  outputId: string
}) {
  const outputId = required(input.outputId, "output")
  const token = createGeneratedVideoShareToken({ ...input, outputId })
  const encodedOutputId = encodeURIComponent(outputId)
  const encodedToken = encodeURIComponent(token)
  return {
    publicViewUrl: `/share/videos/${encodedOutputId}?token=${encodedToken}`,
    downloadUrl: `/api/public/videos/${encodedOutputId}/media?kind=video&download=1&token=${encodedToken}`,
  }
}

export function generatedVideoDeliveryUrls(input: {
  baseUrl: string
  ownerId: string
  outputId: string
}) {
  const baseUrl = required(input.baseUrl, "base URL").replace(/\/$/, "")
  const paths = generatedVideoDeliveryPaths(input)
  return {
    publicViewUrl: `${baseUrl}${paths.publicViewUrl}`,
    downloadUrl: `${baseUrl}${paths.downloadUrl}`,
  }
}

export function generatedVideoShareConfigured() {
  return Boolean(generatedVideoShareSecret(false))
}

function signature(payload: string) {
  return crypto
    .createHmac("sha256", generatedVideoShareSecret(true))
    .update(payload)
    .digest("base64url")
}

function generatedVideoShareSecret(requiredSecret: true): string
function generatedVideoShareSecret(requiredSecret: false): string | undefined
function generatedVideoShareSecret(requiredSecret: boolean) {
  const secret =
    clean(process.env.OUTPUT_SHARE_SECRET) ||
    clean(process.env.SLIDESHOW_SHARE_SECRET) ||
    undefined
  if (!secret && requiredSecret) {
    throw new Error("Generated-video public sharing is not configured.")
  }
  return secret
}

function required(value: string, label: string) {
  const normalized = clean(value)
  if (!normalized)
    throw new Error(`A generated-video share ${label} is required.`)
  return normalized
}
