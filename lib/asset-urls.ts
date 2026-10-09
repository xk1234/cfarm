import "server-only"

import { clean } from "@/lib/guards"
import {
  generatedVideoDeliveryPaths,
  generatedVideoDeliveryUrls,
  generatedVideoShareConfigured,
} from "@/lib/generated-video-share"
import { generatedVideoAssetPath } from "@/lib/public-generated-video-assets"
import {
  slideshowDeliveryPaths,
  slideshowDeliveryUrls,
} from "@/lib/slideshow-share"

export function configuredBaseUrl(): string {
  return clean(process.env.BASE_URL).replace(/\/$/, "")
}

function isAlreadyAbsolute(value: string): boolean {
  return (
    /^https?:\/\//i.test(value) ||
    value.startsWith("data:") ||
    value.startsWith("lumenclip:")
  )
}

export function absoluteAssetUrl(path: string): string {
  const normalized = clean(path)
  if (!normalized) return normalized
  if (isAlreadyAbsolute(normalized)) return normalized
  const base = configuredBaseUrl()
  if (!base) return normalized
  return `${base}${normalized.startsWith("/") ? "" : "/"}${normalized}`
}

export function slideshowDeliveryLinks(input: {
  ownerId: string
  outputId: string
}): { previewUrl: string; downloadUrl: string } | null {
  if (!slideshowShareConfigured()) return null
  const base = configuredBaseUrl()
  return base
    ? slideshowDeliveryUrls({ baseUrl: base, ...input })
    : slideshowDeliveryPaths(input)
}

export function generatedVideoDeliveryLinks(input: {
  ownerId: string
  outputId: string
  videoUrl: string
}): { publicViewUrl: string; downloadUrl: string } | null {
  if (
    !generatedVideoShareConfigured() ||
    !generatedVideoAssetPath(input.videoUrl)
  ) {
    return null
  }
  const base = configuredBaseUrl()
  return base
    ? generatedVideoDeliveryUrls({ baseUrl: base, ...input })
    : generatedVideoDeliveryPaths(input)
}

function slideshowShareConfigured(): boolean {
  return Boolean(clean(process.env.SLIDESHOW_SHARE_SECRET))
}
