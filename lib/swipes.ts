import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export type SwipePlatform = "facebook" | "tiktok" | "tiktok-creative" | "tiktok-seller" | "google" | "twitter" | "unknown"
export type SwipeFormat = "image" | "video" | "carousel" | "unknown"
export type BudgetLevel = "low" | "medium" | "high" | "unknown"
export type ConfidenceLevel = "low" | "medium" | "high"
export type SwipeProcessingStatus = "processing" | "complete" | "failed"

export type SpeakerTranscript = {
  speaker: string
  start?: number
  end?: number
  text: string
}

export type PauseNote = {
  time?: number
  note: string
}

export type EmotionalToneNote = {
  time?: number
  note: string
}

export type FullScriptTranscription = {
  speakers: SpeakerTranscript[]
  full_text: string
  pause_notes: PauseNote[]
  emotional_tone_notes: EmotionalToneNote[]
}

export type CoreUgcAestheticAnalysis = {
  implied_device_and_capture: {
    inferred_device: string
    confidence: ConfidenceLevel
    justification: {
      aspect_ratio: string
      lens_distortion: string
      dynamic_range: string
      visible_artifacts: string[]
    }
  }
  social_context_and_scenario: {
    scenario: string
    real_world_activity: string
    setting: string
    filming_context: string
  }
  visual_authenticity_cues: {
    framing_and_composition: string[]
    camera_motion: string[]
    lighting: string[]
    editing: string[]
    visual_noise: string[]
  }
  audio_authenticity_cues: {
    background_sound: string[]
    dialogue_quality: string[]
    microphone_characteristics: string
  }
  subject_and_performance: {
    appearance: {
      general_age_range: string
      style: string
      notable_features: string[]
    }
    delivery_and_kinesics: {
      speaking_style: string
      tone: string
      filler_words?: string[]
      eye_contact: string
      gestures: string[]
      body_language: string
    }
  }
}

export type IndustryBenchmark = {
  metric: string
  rank: string
  comparison: string
}

export type SwipeRecord = {
  id: string
  advertiser: string
  platform: SwipePlatform
  source: string
  sourceUrl: string
  title: string
  caption: string
  format: SwipeFormat
  cta?: string
  landingPageUrl?: string
  mediaUrl?: string
  source_video_url?: string
  uploaded_at?: string
  time?: number
  likes?: number
  comments?: number
  shares?: number
  ctr_rank?: string
  cvr_rank?: string
  clicks_rank?: string
  conversion_rank?: string
  remain_rank?: string
  budget_level?: BudgetLevel
  industry_benchmark?: IndustryBenchmark
  full_script_transcription?: FullScriptTranscription
  core_ugc_aesthetic_analysis?: CoreUgcAestheticAnalysis
  screenshotPath?: string
  landingPageMobileScreenshotPath?: string
  landingPageDesktopScreenshotPath?: string
  landingPageCapturedAt?: string
  landingPageCaptureError?: string
  processingStatus?: SwipeProcessingStatus
  processingStartedAt?: string
  processingCompletedAt?: string
  processingError?: string
  swipedAt: string
  metadata: Record<string, string>
  stats: Record<string, string>
  folder: string
}

export type SwipePayload = Partial<Omit<SwipeRecord, "id" | "swipedAt" | "screenshotPath">> & {
  analyticsText?: string
  screenshotDataUrl?: string
  landingPageMobileScreenshotDataUrl?: string
  landingPageDesktopScreenshotDataUrl?: string
}

export type SavedSwipeMedia = {
  publicUrl: string
  filePath: string
  format: string
}

const swipeRoot = path.join(process.cwd(), "data", "swipes")
const swipeAssetRoot = path.join(swipeRoot, "assets")
const swipeDbPath = path.join(swipeRoot, "swipes.json")

export async function listSwipes(): Promise<SwipeRecord[]> {
  const swipes = await readAllSwipes()
  return swipes
    .filter(hasCapturedSwipeMedia)
    .toSorted((a, b) => Date.parse(b.swipedAt) - Date.parse(a.swipedAt))
}

export async function createSwipe(payload: SwipePayload): Promise<SwipeRecord> {
  await ensureSwipeStore()
  const current = await readAllSwipes()
  const now = new Date()
  const id = `swipe-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`
  const screenshotPath = payload.screenshotDataUrl
    ? await saveScreenshot(id, payload.screenshotDataUrl)
    : undefined
  const landingPageMobileScreenshotPath = payload.landingPageMobileScreenshotDataUrl
    ? await saveScreenshot(`${id}-landing-mobile`, payload.landingPageMobileScreenshotDataUrl)
    : undefined
  const landingPageDesktopScreenshotPath = payload.landingPageDesktopScreenshotDataUrl
    ? await saveScreenshot(`${id}-landing-desktop`, payload.landingPageDesktopScreenshotDataUrl)
    : undefined
  const inputMediaUrl = clean(payload.mediaUrl)
  const savedMedia = isRemoteUrl(inputMediaUrl) ? await saveRemoteMedia(id, inputMediaUrl) : undefined
  const localMediaUrl = savedMedia?.publicUrl ?? ""
  const mediaUrl = localMediaUrl || localAppUrl(inputMediaUrl) || undefined
  const sourceVideoUrl = localMediaUrl || localAppUrl(payload.source_video_url)
  const shouldProcess = payload.format === "video"
  const fallback = fallbackAnalysis(payload)
  const processingStatus: SwipeProcessingStatus = shouldProcess ? "processing" : "complete"
  const landingPageCapturedAt = landingPageMobileScreenshotPath || landingPageDesktopScreenshotPath ? now.toISOString() : undefined

  const next: SwipeRecord = {
    id,
    advertiser: clean(payload.advertiser) || platformLabel(payload.platform),
    platform: payload.platform ?? "unknown",
    source: clean(payload.source) || platformLabel(payload.platform),
    sourceUrl: clean(payload.sourceUrl),
    title: clean(payload.title) || "Untitled swipe",
    caption: clean(payload.caption),
    format: payload.format ?? "unknown",
    cta: clean(payload.cta),
    landingPageUrl: clean(payload.landingPageUrl),
    mediaUrl,
    source_video_url: sourceVideoUrl || undefined,
    uploaded_at: clean(payload.uploaded_at) || undefined,
    time: toNumber(payload.time),
    likes: toNumber(payload.likes),
    comments: toNumber(payload.comments),
    shares: toNumber(payload.shares),
    ctr_rank: clean(payload.ctr_rank) || undefined,
    cvr_rank: clean(payload.cvr_rank) || undefined,
    clicks_rank: clean(payload.clicks_rank) || undefined,
    conversion_rank: clean(payload.conversion_rank) || undefined,
    remain_rank: clean(payload.remain_rank) || undefined,
    budget_level: normalizeBudgetLevel(payload.budget_level),
    industry_benchmark: normalizeIndustryBenchmark(payload.industry_benchmark),
    full_script_transcription: shouldProcess ? undefined : fallback.full_script_transcription,
    core_ugc_aesthetic_analysis: shouldProcess ? undefined : fallback.core_ugc_aesthetic_analysis,
    screenshotPath,
    landingPageMobileScreenshotPath,
    landingPageDesktopScreenshotPath,
    landingPageCapturedAt,
    landingPageCaptureError: clean(payload.landingPageCaptureError) || undefined,
    processingStatus,
    processingStartedAt: shouldProcess ? now.toISOString() : undefined,
    processingCompletedAt: shouldProcess ? undefined : now.toISOString(),
    swipedAt: now.toISOString(),
    metadata: sanitizeSwipeMetadata(payload.metadata),
    stats: payload.stats ?? {},
    folder: clean(payload.folder) || "No Folder",
  }

  await writeFile(swipeDbPath, `${JSON.stringify([next, ...current], null, 2)}\n`, "utf8")
  if (shouldProcess) {
    void completeSwipeProcessing(id, payload, { sourceVideoUrl, media: savedMedia })
  }
  return next
}

export async function updateSwipe(id: string, patch: Partial<SwipeRecord>): Promise<SwipeRecord | undefined> {
  const current = await readAllSwipes()
  let updated: SwipeRecord | undefined
  const next = current.map((swipe) => {
    if (swipe.id !== id) {
      return swipe
    }
    updated = { ...swipe, ...patch, metadata: patch.metadata ? sanitizeSwipeMetadata(patch.metadata) : swipe.metadata }
    return updated
  })

  if (!updated) {
    return undefined
  }

  await writeFile(swipeDbPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
  return updated
}

async function completeSwipeProcessing(id: string, payload: SwipePayload, input: {
  sourceVideoUrl: string
  media?: SavedSwipeMedia
}) {
  try {
    const analysis = await enrichSwipeAnalysis(payload, input)
    await updateSwipe(id, {
      full_script_transcription: analysis.full_script_transcription,
      core_ugc_aesthetic_analysis: analysis.core_ugc_aesthetic_analysis,
      processingStatus: "complete",
      processingCompletedAt: new Date().toISOString(),
      processingError: undefined,
    })
  } catch (error) {
    await updateSwipe(id, {
      processingStatus: "failed",
      processingCompletedAt: new Date().toISOString(),
      processingError: error instanceof Error ? error.message : "Swipe processing failed",
    })
  }
}

async function readAllSwipes(): Promise<SwipeRecord[]> {
  await ensureSwipeStore()
  const file = await readFile(swipeDbPath, "utf8")
  return (JSON.parse(file) as SwipeRecord[]).map((swipe) => ({
    ...swipe,
    metadata: sanitizeSwipeMetadata(swipe.metadata),
  }))
}

async function ensureSwipeStore() {
  await mkdir(swipeAssetRoot, { recursive: true })
  try {
    await readFile(swipeDbPath, "utf8")
  } catch {
    await writeFile(swipeDbPath, "[]\n", "utf8")
  }
}

async function saveScreenshot(id: string, dataUrl: string) {
  const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/)
  if (!match) {
    return undefined
  }

  const extension = match[1] === "jpeg" ? "jpg" : match[1]
  const fileName = `${id}.${extension}`
  await writeFile(path.join(swipeAssetRoot, fileName), Buffer.from(match[2], "base64"))
  return `/api/swipes/assets/${fileName}`
}

async function saveRemoteMedia(id: string, mediaUrl: string): Promise<SavedSwipeMedia | undefined> {
  try {
    const url = new URL(mediaUrl)
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 CFarm Swipe Saver",
      },
    })
    if (!response.ok) {
      return undefined
    }

    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? ""
    if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
      return undefined
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0)
    if (contentLength > 50 * 1024 * 1024) {
      return undefined
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > 50 * 1024 * 1024) {
      return undefined
    }

    const format = extensionFromContentType(contentType)
    const fileName = `${id}-media.${format}`
    const filePath = path.join(swipeAssetRoot, fileName)
    await writeFile(filePath, buffer)
    return {
      publicUrl: `/api/swipes/assets/${fileName}`,
      filePath,
      format,
    }
  } catch {
    return undefined
  }
}

function extensionFromContentType(contentType: string) {
  switch (contentType) {
    case "image/jpeg":
      return "jpg"
    case "image/png":
      return "png"
    case "image/webp":
      return "webp"
    case "image/gif":
      return "gif"
    case "video/webm":
      return "webm"
    case "video/quicktime":
      return "mov"
    case "video/mp4":
      return "mp4"
    default:
      return contentType.startsWith("video/") ? "mp4" : "jpg"
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
}

function sanitizeSwipeMetadata(metadata: unknown): Record<string, string> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {}
  }

  const next: Record<string, string> = {}
  for (const [key, value] of Object.entries(metadata)) {
    const label = clean(key)
    const text = clean(value)
    if (!label || !text || isRemoteUrl(text) || isUrlMetadataLabel(label)) {
      continue
    }
    next[label] = text
  }
  return next
}

function isRemoteUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

function localAppUrl(value: unknown) {
  const url = clean(value)
  return url.startsWith("/") && !url.startsWith("//") ? url : ""
}

function isUrlMetadataLabel(label: string) {
  return /\burl\b/i.test(label)
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== "string") {
    return undefined
  }

  const compact = value.trim().replace(/,/g, "")
  const match = compact.match(/^(\d+(?:\.\d+)?)([KMB])?/i)
  if (!match) {
    return undefined
  }

  const amount = Number(match[1])
  if (!Number.isFinite(amount)) {
    return undefined
  }

  const multiplier = match[2]?.toUpperCase() === "B" ? 1_000_000_000 : match[2]?.toUpperCase() === "M" ? 1_000_000 : match[2]?.toUpperCase() === "K" ? 1_000 : 1
  return Math.round(amount * multiplier)
}

function normalizeBudgetLevel(value: unknown): BudgetLevel | undefined {
  const normalized = clean(value).toLowerCase()
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "unknown") {
    return normalized
  }
  return undefined
}

function normalizeIndustryBenchmark(value: unknown): IndustryBenchmark | undefined {
  if (!value || typeof value !== "object") {
    return undefined
  }

  const benchmark = value as Partial<IndustryBenchmark>
  const metric = clean(benchmark.metric)
  const rank = clean(benchmark.rank)
  const comparison = clean(benchmark.comparison)
  if (!metric && !rank && !comparison) {
    return undefined
  }

  return { metric, rank, comparison }
}

export async function enrichSwipeAnalysis(payload: SwipePayload, input: {
  sourceVideoUrl: string
  media?: SavedSwipeMedia
}): Promise<{
  full_script_transcription: FullScriptTranscription
  core_ugc_aesthetic_analysis: CoreUgcAestheticAnalysis
}> {
  const fallback = fallbackAnalysis(payload)
  const key = process.env.OPENROUTER_API_KEY
  if (!key || payload.format !== "video") {
    return fallback
  }

  const transcript = await transcribeSwipeMedia(input.media, fallback.full_script_transcription, key)
  const coreAnalysis = await analyzeSwipeAesthetic(payload, input.sourceVideoUrl, transcript, fallback.core_ugc_aesthetic_analysis, key)

  return {
    full_script_transcription: transcript,
    core_ugc_aesthetic_analysis: coreAnalysis,
  }
}

async function transcribeSwipeMedia(media: SavedSwipeMedia | undefined, fallback: FullScriptTranscription, key: string) {
  if (!media?.filePath) {
    return fallback
  }

  try {
    const audioBytes = await readFile(media.filePath)
    if (audioBytes.byteLength === 0) {
      return fallback
    }

    const response = await fetch("https://openrouter.ai/api/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "CFarm Swipe Analyzer",
      },
      body: JSON.stringify({
        model: "openai/whisper-1",
        input_audio: {
          data: audioBytes.toString("base64"),
          format: media.format,
        },
      }),
    })

    if (!response.ok) {
      return fallback
    }

    const data = (await response.json()) as { text?: string }
    const text = clean(data.text)
    if (!text) {
      return fallback
    }

    return {
      speakers: [{ speaker: "Unknown", text }],
      full_text: text,
      pause_notes: fallback.pause_notes,
      emotional_tone_notes: fallback.emotional_tone_notes,
    }
  } catch {
    return fallback
  }
}

async function analyzeSwipeAesthetic(
  payload: SwipePayload,
  sourceVideoUrl: string,
  transcript: FullScriptTranscription,
  fallback: CoreUgcAestheticAnalysis,
  key: string,
) {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "CFarm Swipe Analyzer",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Return only JSON. Fill core_ugc_aesthetic_analysis for a short-form UGC ad. Use the provided Whisper transcript as fixed source text. Do not create, rewrite, or return any transcript. Use empty arrays and 'unknown' when evidence is missing. Do not invent numeric metrics.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  schema: {
                    core_ugc_aesthetic_analysis: fallback,
                  },
                  title: payload.title,
                  caption: payload.caption,
                  transcript_text: transcript.full_text,
                  source_video_url: sourceVideoUrl,
                  analytics_text: clean(payload.analyticsText).slice(0, 6000),
                }),
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      return fallback
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content
    if (!content) {
      return fallback
    }

    const parsed = JSON.parse(content) as Partial<{
      core_ugc_aesthetic_analysis: CoreUgcAestheticAnalysis
    }>

    return normalizeAestheticAnalysis(parsed.core_ugc_aesthetic_analysis, fallback)
  } catch {
    return fallback
  }
}

function fallbackAnalysis(payload: SwipePayload): {
  full_script_transcription: FullScriptTranscription
  core_ugc_aesthetic_analysis: CoreUgcAestheticAnalysis
} {
  const text = clean(payload.analyticsText) || clean(payload.caption) || clean(payload.title)
  return {
    full_script_transcription: {
      speakers: text ? [{ speaker: "Unknown", text }] : [],
      full_text: text,
      pause_notes: [],
      emotional_tone_notes: [],
    },
    core_ugc_aesthetic_analysis: {
      implied_device_and_capture: {
        inferred_device: "unknown",
        confidence: "low",
        justification: {
          aspect_ratio: clean(payload.metadata?.Format) || "unknown",
          lens_distortion: "unknown",
          dynamic_range: "unknown",
          visible_artifacts: [],
        },
      },
      social_context_and_scenario: {
        scenario: "unknown",
        real_world_activity: "unknown",
        setting: "unknown",
        filming_context: "unknown",
      },
      visual_authenticity_cues: {
        framing_and_composition: [],
        camera_motion: [],
        lighting: [],
        editing: [],
        visual_noise: [],
      },
      audio_authenticity_cues: {
        background_sound: [],
        dialogue_quality: [],
        microphone_characteristics: "unknown",
      },
      subject_and_performance: {
        appearance: {
          general_age_range: "unknown",
          style: "unknown",
          notable_features: [],
        },
        delivery_and_kinesics: {
          speaking_style: "unknown",
          tone: "unknown",
          filler_words: [],
          eye_contact: "unknown",
          gestures: [],
          body_language: "unknown",
        },
      },
    },
  }
}

function normalizeAestheticAnalysis(value: unknown, fallback: CoreUgcAestheticAnalysis): CoreUgcAestheticAnalysis {
  if (!value || typeof value !== "object") {
    return fallback
  }
  return value as CoreUgcAestheticAnalysis
}

function hasCapturedSwipeMedia(swipe: SwipeRecord) {
  return Boolean(swipe.processingStatus === "processing" || clean(swipe.screenshotPath) || clean(swipe.mediaUrl))
}

function platformLabel(platform?: SwipePlatform) {
  switch (platform) {
    case "facebook":
      return "facebook"
    case "tiktok":
      return "tiktok"
    case "tiktok-creative":
      return "tiktok-creative"
    case "tiktok-seller":
      return "tiktok-seller"
    case "google":
      return "google"
    default:
      return "unknown"
  }
}
