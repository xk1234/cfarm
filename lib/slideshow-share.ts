import "server-only"

import crypto from "node:crypto"

import { clean } from "@/lib/guards"
import {
  getRepositories,
  type RenderOutputSlide,
  type Repositories,
} from "@/lib/data"

/** What a public share link exposes: a succeeded render's slides. */
export type SharedSlideshow = {
  id: string
  workspaceId: string
  title: string
  caption: string
  hashtags: string
  slides: RenderOutputSlide[]
}

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

/**
 * Resolves a share link to the render it names. The token's owner claim is
 * the workspace, so the render is read with normal ownership scoping.
 */
export async function loadSharedSlideshow(
  outputId: string,
  token: string,
  repos: Repositories = getRepositories()
): Promise<SharedSlideshow | null> {
  const claims = verifySlideshowShareToken(token, outputId)
  if (!claims) return null
  const render = await repos.renders.get(claims.ownerId, claims.outputId)
  if (!render || render.status !== "succeeded" || !render.output) return null
  return {
    id: render.id,
    workspaceId: render.workspaceId,
    title: render.title ?? "Slideshow",
    caption: "",
    hashtags: "",
    slides: [...render.output.slides].sort((a, b) => a.index - b.index),
  }
}

/** Public URL of slide `index` (0-based) behind a share token. */
export function publicSlideshowImageUrl(input: {
  outputId: string
  token: string
  index: number
}) {
  return `/api/public/slideshows/${encodeURIComponent(input.outputId)}/slides/${input.index + 1}?token=${encodeURIComponent(input.token)}`
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
  const secret = clean(process.env.SLIDESHOW_SHARE_SECRET)
  if (!secret) throw new Error("Slideshow public sharing is not configured.")
  return secret
}

function required(value: string, label: string) {
  const normalized = clean(value)
  if (!normalized) throw new Error(`A slideshow share ${label} is required.`)
  return normalized
}
