import { fetchJson } from "@/lib/http"
import {
  isRecord,
  readOptionalString as readString,
  readRecord,
} from "@/lib/guards"

export const PINTEREST_ACTOR_ID = "fatihtahta/pinterest-scraper-search"
const PINTEREST_ACTOR_PATH = "fatihtahta~pinterest-scraper-search"

export type PinterestSearchResult = {
  id: string
  title: string
  description: string
  imageUrl: string
  sourceUrl: string
  dominantColor: string
  width?: number
  height?: number
  hash?: string
  lastUsedAt?: string
}

export type PinterestActorInput = {
  queries?: string[]
  startUrls?: string[]
  type: "all-pins"
  limit: number
  content_analysis: false
  sentinent_analysis: false
  proxyConfiguration: {
    useApifyProxy: true
    apifyProxyGroups: ["RESIDENTIAL"]
  }
}

type UnknownRecord = Record<string, unknown>

export function buildPinterestActorInput(
  query: string,
  limit: number,
  mode: "search" | "board" = "search"
): PinterestActorInput {
  const boundedLimit = Math.max(1, Math.min(limit, 100))
  if (mode === "board") {
    return {
      startUrls: [normalizePinterestBoardUrl(query)],
      type: "all-pins",
      limit: boundedLimit,
      content_analysis: false,
      sentinent_analysis: false,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ["RESIDENTIAL"],
      },
    }
  }

  return {
    queries: [query.trim()],
    type: "all-pins",
    limit: boundedLimit,
    content_analysis: false,
    sentinent_analysis: false,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
    },
  }
}

export function normalizePinterestItems(
  items: unknown[]
): PinterestSearchResult[] {
  return items.flatMap((item, index) => {
    if (!isRecord(item)) {
      return []
    }

    const image = readImage(item)
    if (!image?.url) {
      return []
    }

    const pin = readRecord(item.pin)
    const media = readRecord(item.media)
    const id = readString(item.id) || readString(pin?.id) || `pin-${index + 1}`
    const title =
      readString(item.title) || readString(pin?.title) || "Untitled pin"
    const description =
      readString(item.description) ||
      readString(pin?.description) ||
      readString(pin?.closeup_unified_description) ||
      readString(pin?.closeup_user_note) ||
      readString(pin?.alt_text) ||
      "Pinterest search result"

    return [
      {
        id,
        title,
        description,
        imageUrl: image.url,
        sourceUrl:
          readString(item.url) ||
          readString(item.source_url) ||
          `https://www.pinterest.com/pin/${id}/`,
        dominantColor:
          readString(pin?.dominant_color) ||
          readString(media?.dominant_color) ||
          "#d8d6ce",
        width: image.width,
        height: image.height,
      },
    ]
  })
}

export function createFallbackPinterestResults(
  query: string,
  limit: number
): PinterestSearchResult[] {
  const normalizedQuery = query.trim() || "pinterest"
  const slug =
    normalizedQuery
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "pinterest"
  const colors = [
    "#b88772",
    "#78996b",
    "#6d98bf",
    "#c39b4c",
    "#746f66",
    "#b077a3",
  ]

  return Array.from({ length: Math.max(1, limit) }, (_, index) => ({
    id: `fallback-${slug}-${index + 1}`,
    title: `${normalizedQuery} ${index + 1}`,
    description: `Local preview result for ${normalizedQuery}`,
    imageUrl: "",
    sourceUrl: `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(normalizedQuery)}`,
    dominantColor: colors[index % colors.length],
    width: index % 3 === 0 ? 736 : 600,
    height: index % 3 === 0 ? 1104 : 900,
  }))
}

export async function runPinterestImport(
  query: string,
  limit: number,
  token: string,
  mode: "search" | "board" = "search"
): Promise<PinterestSearchResult[]> {
  const items = await fetchJson<unknown[]>(
    `https://api.apify.com/v2/acts/${PINTEREST_ACTOR_PATH}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(buildPinterestActorInput(query, limit, mode)),
    },
    {
      timeoutMs: 30_000,
      errorMessage: (response) =>
        `Pinterest import failed with ${response.status}`,
    }
  )
  return normalizePinterestItems(items)
}

function normalizePinterestBoardUrl(input: string) {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    if (!url.hostname.includes("pinterest.")) {
      return trimmed
    }
    const parts = url.pathname.split("/").filter(Boolean)
    if (parts.length >= 2) {
      return `https://www.pinterest.com/${parts[0]}/${parts[1]}/`
    }
  } catch {
    return trimmed
  }

  return trimmed
}

function readImage(item: UnknownRecord) {
  const directUrl =
    readString(item.imageUrl) ||
    readString(item.image_url) ||
    readString(item.image)
  if (directUrl) {
    return {
      url: directUrl,
      width: readNumber(item.width),
      height: readNumber(item.height),
    }
  }

  const media = readRecord(item.media)
  const images = readRecord(media?.images) || readRecord(item.images)
  const imagesBySize = readRecord(images?.images_by_size)
  const candidates = [
    readRecord(images?.orig),
    readRecord(images?.original),
    readRecord(imagesBySize?.orig),
    readRecord(imagesBySize?.["1200x"]),
    readRecord(imagesBySize?.["736x"]),
    readRecord(imagesBySize?.["564x"]),
    readRecord(images?.["736x"]),
    readRecord(images?.["564x"]),
    readRecord(images?.large),
    readRecord(images?.medium),
    readRecord(images?.small),
    readRecord(images?.thumb),
  ]

  for (const candidate of candidates) {
    const url = readString(candidate?.url)
    if (url) {
      return {
        url,
        width: readNumber(candidate?.width),
        height: readNumber(candidate?.height),
      }
    }
  }

  return undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
