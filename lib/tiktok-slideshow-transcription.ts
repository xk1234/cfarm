import { clean, isRecord } from "@/lib/guards"
import { getGenerationModelSettings } from "@/lib/generation-model-settings"
import { getLumenclipChatPrompt } from "@/lib/langfuse-prompts"
import { parseManualPublicationUrl } from "@/lib/manual-publication"
import { getOpenRouterApiKey, openRouterJson } from "@/lib/openrouter"

const DEFAULT_ACTOR = "maximedupre/tiktok-slideshow-downloader"
const APIFY_API = "https://api.apify.com/v2"
const MAX_URLS = 20
const MAX_PHOTOS_PER_URL = 20

export type TikTokSlideshowPhoto = {
  index: number
  sourceImageUrl: string
  downloadUrl: string
}

export type TikTokSlideshowPost = {
  id: string
  url: string
  authorUsername: string
  caption: string
  publishedAt: string
  photoCount: number
  photos: TikTokSlideshowPhoto[]
}

type DatasetItem = {
  videoId?: unknown
  requestedUrl?: unknown
  authorUsername?: unknown
  caption?: unknown
  photoIndex?: unknown
  photoCount?: unknown
  sourceImageUrl?: unknown
  downloadUrl?: unknown
}

export function normalizeTikTokSlideshowUrls(urls: string[]) {
  const supplied = [...new Set(urls.map(clean).filter(Boolean))]
  if (supplied.length === 0) {
    throw new Error("Add at least one TikTok photo URL")
  }
  if (supplied.length > MAX_URLS) {
    throw new Error(`Analyze at most ${MAX_URLS} TikTok posts at once`)
  }
  const canonical = supplied.map((url) => {
    const parsed = parseManualPublicationUrl({ url, provider: "tiktok" })
    if (!/\/photo\/\d+$/i.test(new URL(parsed.releaseUrl).pathname)) {
      throw new Error("Only TikTok photo slideshow URLs can be analyzed")
    }
    return parsed.releaseUrl
  })
  return [...new Set(canonical)]
}

export async function fetchTikTokSlideshowPost(
  url: string
): Promise<TikTokSlideshowPost | null> {
  const [normalizedUrl] = normalizeTikTokSlideshowUrls([url])
  const actor = apifyActor()
  const items = await apifyJson<DatasetItem[]>(
    `/acts/${encodeURIComponent(actor.replace("/", "~"))}/run-sync-get-dataset-items?clean=true&format=json&timeout=180`,
    {
      method: "POST",
      body: {
        slideshowUrls: [{ url: normalizedUrl }],
        maxItems: MAX_PHOTOS_PER_URL,
      },
      timeoutMs: 185_000,
    }
  )
  return tiktokPostsFromDatasetItems(items)[0] ?? null
}

export async function extractTikTokSlideTexts(post: TikTokSlideshowPost) {
  const apiKey = getOpenRouterApiKey()
  if (!apiKey) return fallbackSlideTexts(post)
  const { imageCaptioningModel } = await getGenerationModelSettings()
  const count = post.photos.length
  const managedPrompt = await getLumenclipChatPrompt(
    "tiktokSlideshowTranscription",
    { slide_count: String(count), post_id: post.id }
  )
  const [systemMessage, userMessage] = managedPrompt.messages
  const result = await openRouterJson({
    apiKey,
    model: imageCaptioningModel,
    timeoutMs: 90_000,
    maxTokens: Math.max(600, count * 350),
    temperature: 0,
    schema: {
      name: "tiktok_slide_text",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          slides: {
            type: "array",
            minItems: count,
            maxItems: count,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                index: { type: "integer" },
                text: { type: "string" },
              },
              required: ["index", "text"],
            },
          },
        },
        required: ["slides"],
      },
    },
    messages: [
      systemMessage,
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userMessage?.content ?? "",
          },
          ...post.photos.map((photo) => ({
            type: "image_url" as const,
            image_url: { url: photo.sourceImageUrl },
          })),
        ],
      },
    ],
    trace: {
      feature: "tiktok-slideshow-transcription",
      prompt: managedPrompt.prompt,
    },
  })
  const slides = Array.isArray(result.slides) ? result.slides : []
  const byIndex = new Map(
    slides.flatMap((value) => {
      if (!isRecord(value)) return []
      const index = Number(value.index)
      return Number.isInteger(index)
        ? [[index, clean(value.text)] as const]
        : []
    })
  )
  return post.photos.map((_, index) => byIndex.get(index + 1) ?? "")
}

export function tiktokPublishedAt(id: string) {
  try {
    const seconds = Number(BigInt(id) >> BigInt(32))
    const date = new Date(seconds * 1000)
    if (Number.isFinite(date.getTime())) return date.toISOString()
  } catch {
    // Replaced by the validation error below.
  }
  throw new Error("TikTok returned an invalid post id")
}

function fallbackSlideTexts(post: TikTokSlideshowPost) {
  return post.photos.map((_, index) =>
    index === 0 ? captionBody(post.caption) : ""
  )
}

function tiktokPostsFromDatasetItems(items: DatasetItem[]) {
  const grouped = new Map<string, TikTokSlideshowPost>()
  for (const item of Array.isArray(items) ? items : []) {
    const id = clean(item.videoId)
    const sourceImageUrl = clean(item.sourceImageUrl)
    const downloadUrl = clean(item.downloadUrl)
    const index = Number(item.photoIndex)
    if (!id || !sourceImageUrl || !downloadUrl || !Number.isInteger(index)) {
      continue
    }
    const parsed = parseManualPublicationUrl({
      url: clean(item.requestedUrl),
      provider: "tiktok",
    })
    const current = grouped.get(id) ?? {
      id,
      url: parsed.releaseUrl,
      authorUsername: clean(item.authorUsername),
      caption: clean(item.caption),
      publishedAt: tiktokPublishedAt(id),
      photoCount: Math.max(1, Number(item.photoCount) || 1),
      photos: [],
    }
    current.photos.push({ index, sourceImageUrl, downloadUrl })
    grouped.set(id, current)
  }
  return [...grouped.values()]
    .map((post) => ({
      ...post,
      photos: post.photos.sort((left, right) => left.index - right.index),
    }))
    .sort(
      (left, right) =>
        Date.parse(left.publishedAt) - Date.parse(right.publishedAt)
    )
}

function apifyActor() {
  return clean(process.env.APIFY_TIKTOK_SLIDESHOW_ACTOR) || DEFAULT_ACTOR
}

function apifyToken() {
  const token = clean(process.env.APIFY_KEY)
  if (!token) throw new Error("TikTok slideshow analysis is not configured")
  return token
}

async function apifyJson<T>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const response = await fetch(`${APIFY_API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apifyToken()}`,
      ...(init.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(init.timeoutMs ?? 30_000),
  })
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string }
  }
  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        `TikTok slideshow analysis failed (${response.status})`
    )
  }
  return payload
}

function captionBody(value: string) {
  return clean(value)
    .replace(/(?:\s+#[\p{L}\p{N}_-]+)+\s*$/gu, "")
    .trim()
}
