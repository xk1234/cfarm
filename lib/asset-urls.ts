import "server-only"

import { clean } from "@/lib/guards"
import {
  createSlideshowShareToken,
  slideshowShareUrl,
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

export function slideshowShareLink(input: {
  ownerId: string
  outputId: string
}): string | null {
  if (!slideshowShareConfigured()) return null
  const base = configuredBaseUrl()
  if (!base) {
    const token = createSlideshowShareToken(input)
    return `/share/slideshows/${encodeURIComponent(
      input.outputId
    )}?token=${encodeURIComponent(token)}`
  }
  return slideshowShareUrl({ baseUrl: base, ...input })
}

function slideshowShareConfigured(): boolean {
  return Boolean(
    clean(process.env.SLIDESHOW_SHARE_SECRET) ||
      clean(process.env.APPWRITE_API_KEY)
  )
}