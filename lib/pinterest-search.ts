import { fetchJson } from "@/lib/http"
import {
  isRecord,
  readOptionalString as readString,
  readRecord,
} from "@/lib/guards"

export const PINTEREST_ACTOR_ID = "fatihtahta/pinterest-scraper-search"
const PINTEREST_ACTOR_PATH = "fatihtahta~pinterest-scraper-search"
export const PINTEREST_BOARD_ACTOR_ID = "dltik/pinterest-scraper"
const PINTEREST_BOARD_ACTOR_PATH = "dltik~pinterest-scraper"

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
  proxyConfiguration: {
    useApifyProxy: true
    apifyProxyGroups: ["RESIDENTIAL"]
  }
}

export type PinterestBoardActorInput = {
  mode: "board"
  inputs: string[]
  maxResults: number
  scope: "pins"
  includeAiAnalysis: false
  proxyConfig: {
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
  // This actor often returns fewer usable image records than requested. Ask it
  // for a small minimum batch, then slice back to the caller's requested size.
  const boundedLimit = Math.max(10, Math.min(limit, 100))
  if (mode === "board") {
    return {
      startUrls: [normalizePinterestBoardUrl(query)],
      type: "all-pins",
      limit: boundedLimit,
      content_analysis: false,
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
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
    },
  }
}

export function buildPinterestBoardActorInput(
  query: string,
  limit: number
): PinterestBoardActorInput {
  return {
    mode: "board",
    inputs: [normalizePinterestBoardUrl(query)],
    maxResults: Math.max(1, Math.min(limit, 100)),
    scope: "pins",
    includeAiAnalysis: false,
    proxyConfig: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
    },
  }
}

export function isPinterestBoardUrl(value: string) {
  try {
    const url = new URL(value.trim())
    const hostname = url.hostname.toLowerCase()
    const parts = url.pathname.split("/").filter(Boolean)
    return (
      (hostname === "pinterest.com" || hostname.endsWith(".pinterest.com")) &&
      parts.length >= 2 &&
      parts[0] !== "pin" &&
      parts[0] !== "search"
    )
  } catch {
    return false
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
    const id =
      readString(item.id) ||
      readString(item.pin_id) ||
      readString(pin?.id) ||
      `pin-${index + 1}`
    const title =
      readString(item.title) || readString(pin?.title) || "Untitled pin"
    const description =
      readString(item.description) ||
      readString(item.alt_text) ||
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
          readString(item.dominant_color) ||
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
  const effectiveMode = isPinterestBoardUrl(query) ? "board" : mode
  const actorPath =
    effectiveMode === "board"
      ? PINTEREST_BOARD_ACTOR_PATH
      : PINTEREST_ACTOR_PATH
  const input =
    effectiveMode === "board"
      ? buildPinterestBoardActorInput(query, limit)
      : buildPinterestActorInput(query, limit, "search")
  const items = await fetchJson<unknown[]>(
    `https://api.apify.com/v2/acts/${actorPath}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
    },
    {
      timeoutMs: 30_000,
      errorMessage: (response) =>
        `Pinterest import failed with ${response.status}`,
    }
  )
  return normalizePinterestItems(items).slice(
    0,
    Math.max(1, Math.min(limit, 100))
  )
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
      width: readNumber(item.width) ?? readNumber(item.image_width),
      height: readNumber(item.height) ?? readNumber(item.image_height),
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

  const fallbackUrl = findPinimgUrl(item)
  if (fallbackUrl) {
    return { url: fallbackUrl }
  }

  return undefined
}

function findPinimgUrl(value: unknown) {
  const serialized = JSON.stringify(value)
    .replace(/\\+\//g, "/")
    .replace(/\\u0026/gi, "&")
  const matches = serialized.match(/https?:\/\/i\.pinimg\.com\/[^"'\s,}]+/gi)
  if (!matches) return undefined

  const urls = matches.filter((url) => {
    try {
      return new URL(url).hostname === "i.pinimg.com"
    } catch {
      return false
    }
  })

  return urls.find((url) => url.includes("/originals/")) ?? urls[0]
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}
