import type { PinterestSearchResult } from "@/lib/pinterest-search"

type UnknownRecord = Record<string, unknown>

export function buildPexelsSearchUrl(query: string, limit: number) {
  const url = new URL("https://api.pexels.com/v1/search")
  url.searchParams.set("query", query.trim())
  url.searchParams.set("per_page", String(Math.max(1, Math.min(Math.floor(limit), 80))))
  url.searchParams.set("orientation", "portrait")
  return url
}

export function normalizePexelsPhotos(photos: unknown[]): PinterestSearchResult[] {
  return photos.flatMap((photo, index) => {
    if (!isRecord(photo)) {
      return []
    }

    const src = readRecord(photo.src)
    const id = readString(photo.id) || readNumber(photo.id)?.toString() || `photo-${index + 1}`
    const imageUrl =
      readString(src?.large2x) ||
      readString(src?.large) ||
      readString(src?.medium) ||
      readString(src?.original)

    if (!imageUrl) {
      return []
    }

    const alt = readString(photo.alt) || "Pexels photo"
    const photographer = readString(photo.photographer)

    return [
      {
        id: `pexels-${id}`,
        title: alt,
        description: photographer ? `${alt} by ${photographer}` : alt,
        imageUrl,
        sourceUrl: readString(photo.url) || `https://www.pexels.com/photo/${id}/`,
        dominantColor: readString(photo.avg_color) || "#d8d6ce",
        width: readNumber(photo.width),
        height: readNumber(photo.height),
      },
    ]
  })
}

export function createFallbackPexelsResults(query: string, limit: number): PinterestSearchResult[] {
  const normalizedQuery = query.trim() || "pexels"
  const slug = normalizedQuery.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pexels"
  const colors = ["#8da399", "#c3a26c", "#8f8ca8", "#a9766d", "#6f8ea6", "#b4a981"]

  return Array.from({ length: Math.max(1, limit) }, (_, index) => ({
    id: `pexels-fallback-${slug}-${index + 1}`,
    title: `${normalizedQuery} Pexels ${index + 1}`,
    description: `Local Pexels preview result for ${normalizedQuery}`,
    imageUrl: "",
    sourceUrl: `https://www.pexels.com/search/${encodeURIComponent(normalizedQuery)}/`,
    dominantColor: colors[index % colors.length],
    width: 1080,
    height: 1350,
  }))
}

export async function runPexelsSearch(query: string, limit: number, apiKey: string) {
  const response = await fetch(buildPexelsSearchUrl(query, limit), {
    headers: {
      Authorization: apiKey,
    },
  })

  if (!response.ok) {
    throw new Error(`Pexels search failed with ${response.status}`)
  }

  const payload = (await response.json()) as { photos?: unknown[] }
  return normalizePexelsPhotos(Array.isArray(payload.photos) ? payload.photos : [])
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
