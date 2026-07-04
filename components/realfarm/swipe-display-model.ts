import type { SwipePlatform, SwipeRecord } from "@/lib/swipes"

export type SwipeDisplayEntry = {
  label: string
  value: string
}

export type SwipeDisplayModel = {
  id: string
  advertiser: string
  platform: SwipePlatform
  source: string
  sourceUrl: string
  title: string
  caption: string
  format: SwipeRecord["format"]
  cta?: string
  landingPageUrl?: string
  mediaUrl?: string
  screenshotPath?: string
  landingPageMobileScreenshotPath?: string
  landingPageDesktopScreenshotPath?: string
  landingPageCaptureError?: string
  transcript?: string
  processingStatus?: SwipeRecord["processingStatus"]
  processingError?: string
  swipedAt: string
  folder: string
  stats: SwipeDisplayEntry[]
  metadata: SwipeDisplayEntry[]
  ugcSummary: SwipeDisplayEntry[]
}

export function toSwipeDisplayModel(swipe: SwipeRecord): SwipeDisplayModel {
  const isFacebook = swipe.platform === "facebook"
  const rawText = normalizeText([
    swipe.caption,
    swipe.title,
    ...Object.values(swipe.stats ?? {}),
  ].join(" "))
  const facebookFields = isFacebook ? facebookFieldsFrom(rawText) : {}
  const caption = isFacebook ? cleanFacebookCaption(rawText, swipe.advertiser) : normalizeText(swipe.caption)
  const title = cleanTitle(swipe, facebookFields)
  const transcript = displayTranscript(swipe, caption)

  return {
    id: swipe.id,
    advertiser: normalizeText(swipe.advertiser) || platformLabel(swipe.platform),
    platform: swipe.platform,
    source: normalizeText(swipe.source),
    sourceUrl: normalizeText(swipe.sourceUrl),
    title,
    caption: caption || "No caption captured yet.",
    format: swipe.format,
    cta: normalizeText(swipe.cta) || undefined,
    landingPageUrl: normalizeText(swipe.landingPageUrl) || undefined,
    mediaUrl: normalizeText(swipe.mediaUrl) || undefined,
    screenshotPath: normalizeText(swipe.screenshotPath) || undefined,
    landingPageMobileScreenshotPath: normalizeText(swipe.landingPageMobileScreenshotPath) || undefined,
    landingPageDesktopScreenshotPath: normalizeText(swipe.landingPageDesktopScreenshotPath) || undefined,
    landingPageCaptureError: normalizeText(swipe.landingPageCaptureError) || undefined,
    transcript,
    processingStatus: swipe.processingStatus,
    processingError: normalizeText(swipe.processingError) || undefined,
    swipedAt: swipe.swipedAt,
    folder: normalizeText(swipe.folder) || "No Folder",
    stats: displayStats(swipe, facebookFields),
    metadata: displayMetadata(swipe),
    ugcSummary: displayUgcSummary(swipe),
  }
}

function displayStats(swipe: SwipeRecord, facebookFields: Partial<Record<string, string>>) {
  const entries: SwipeDisplayEntry[] = []
  addEntry(entries, "Uploaded", swipe.uploaded_at)
  addEntry(entries, "Length", typeof swipe.time === "number" ? `${swipe.time}s` : undefined)
  addEntry(entries, "Likes", swipe.likes)
  addEntry(entries, "Comments", swipe.comments)
  addEntry(entries, "Shares", swipe.shares)
  addEntry(entries, "CTR rank", swipe.ctr_rank)
  addEntry(entries, "CVR rank", swipe.cvr_rank)
  addEntry(entries, "Clicks rank", swipe.clicks_rank)
  addEntry(entries, "Conversion rank", swipe.conversion_rank)
  addEntry(entries, "Remain rank", swipe.remain_rank)
  addEntry(entries, "Budget level", swipe.budget_level)
  addEntry(entries, "Benchmark", swipe.industry_benchmark ? `${swipe.industry_benchmark.metric}: ${swipe.industry_benchmark.rank} ${swipe.industry_benchmark.comparison}` : undefined)

  for (const [label, value] of Object.entries(facebookFields)) {
    addEntry(entries, label, value)
  }

  for (const [label, value] of Object.entries(swipe.stats ?? {})) {
    if (entries.some((entry) => entry.label === label)) continue
    if (looksLikeTextWall(value)) continue
    addEntry(entries, label, value)
  }

  return entries
}

function displayMetadata(swipe: SwipeRecord) {
  const entries: SwipeDisplayEntry[] = []
  for (const [label, value] of Object.entries(swipe.metadata ?? {})) {
    addEntry(entries, label, value)
  }
  if (!entries.some((entry) => entry.label === "Source")) {
    addEntry(entries, "Source", swipe.source)
  }
  if (!entries.some((entry) => entry.label === "Format")) {
    addEntry(entries, "Format", swipe.format)
  }
  if (swipe.cta && !entries.some((entry) => entry.label === "CTA")) {
    addEntry(entries, "CTA", swipe.cta)
  }
  return entries
}

function displayUgcSummary(swipe: SwipeRecord) {
  const analysis = swipe.core_ugc_aesthetic_analysis
  if (!analysis) {
    return []
  }

  const entries: SwipeDisplayEntry[] = []
  addEntry(entries, "Device", analysis.implied_device_and_capture.inferred_device)
  addEntry(entries, "Scenario", analysis.social_context_and_scenario.scenario)
  addEntry(entries, "Setting", analysis.social_context_and_scenario.setting)
  addEntry(entries, "Speaking style", analysis.subject_and_performance.delivery_and_kinesics.speaking_style)
  addEntry(entries, "Tone", analysis.subject_and_performance.delivery_and_kinesics.tone)
  return entries.filter((entry) => entry.value !== "unknown")
}

function displayTranscript(swipe: SwipeRecord, caption: string) {
  const rawTranscript = normalizeText(swipe.full_script_transcription?.full_text)
  if (!rawTranscript) {
    return undefined
  }

  if (swipe.platform === "facebook" && looksLikeFacebookChrome(rawTranscript)) {
    const cleaned = cleanFacebookCaption(rawTranscript, swipe.advertiser)
    if (!cleaned || cleaned === caption) {
      return undefined
    }
    return cleaned
  }

  return rawTranscript === caption ? undefined : rawTranscript
}

function facebookFieldsFrom(text: string) {
  const withBreaks = addFacebookTokenSpacing(text)
  const fields: Record<string, string> = {}
  const libraryId = withBreaks.match(/Library ID:\s*(\d+)/i)?.[1]
  if (libraryId) fields["Library ID"] = libraryId

  const started = withBreaks.match(/Started running on\s+(.+?)(?=\s+Platforms\b|$)/i)?.[1]
  if (started) fields["Started running on"] = normalizeText(started)

  const platforms = withBreaks.match(/Platforms\s+(.+?)(?=\s+Open Drop-down\b|\s+See ad details\b|\s+\S+Sponsored\b|\s+Sponsored\b|$)/i)?.[1]
  if (platforms) fields.Platforms = normalizeText(platforms)

  return fields
}

function cleanFacebookCaption(text: string, advertiser: string) {
  let value = addFacebookTokenSpacing(text)
  value = value.replace(/^.*?\bSponsored\b\s*/i, "")
  value = value
    .replace(/^Active\s*/i, "")
    .replace(/^Saving\.\.\.\s*/i, "")
    .replace(/Library ID:\s*\d+/gi, "")
    .replace(/Started running on\s+.+?(?=\s+Platforms\b|$)/gi, "")
    .replace(/Platforms\s+.+?(?=\s+Open Drop-down\b|\s+See ad details\b|\s+\S+Sponsored\b|\s+Sponsored\b|$)/gi, "")
    .replace(/\bOpen Drop-down\b/gi, "")
    .replace(/\bSee ad details\b/gi, "")
    .replace(/\bSponsored\b/gi, "")
    .replace(/\s+[A-Z0-9-]+(?:\.\s*)+[A-Z0-9-]+\b.*$/g, "")
    .replace(/\b[A-Z0-9.-]+\.[A-Z]{2,}\b.*$/g, "")
    .replace(/\b(?:Shop Now|Install Now|Learn More|Download|Sign Up)\b\s*$/gi, "")
  return stripLeadingAdvertiser(value, advertiser)
}

function cleanTitle(swipe: SwipeRecord, facebookFields: Partial<Record<string, string>>) {
  const title = normalizeText(swipe.title)
  if (swipe.platform === "facebook" && (!title || /^(open drop-down|inspect swipe|✣ swipe|sponsored)$/i.test(title))) {
    return normalizeText(swipe.advertiser) || "Facebook ad"
  }
  return title || normalizeText(swipe.advertiser) || platformLabel(swipe.platform) || facebookFields["Library ID"] || "Untitled swipe"
}

function addFacebookTokenSpacing(value: string) {
  return normalizeText(value)
    .replace(/Active(?=Library ID:)/g, "Active ")
    .replace(/(\d)(Started running on)/g, "$1 $2")
    .replace(/(\d{4})(Platforms)/g, "$1 $2")
    .replace(/(versions)(Open Drop-down)/gi, "$1 $2")
    .replace(/(Open Drop-down)(See ad details)/gi, "$1 $2")
    .replace(/([A-Za-z0-9 .&'-]{2,80})(Sponsored)/g, "$1 $2")
    .replace(/(See ad details)([A-Z][A-Za-z0-9 .&'-]{1,80}?Sponsored)/g, "$1 $2")
    .replace(/Sponsored(?=[A-ZÁÉÍÓÚÑ])/g, "Sponsored ")
    .replace(/([a-záéíóúñ.!?])([A-Z0-9.-]+\.[A-Z]{2,})/g, "$1 $2")
}

function stripLeadingAdvertiser(value: string, advertiser: string) {
  let text = normalizeText(value)
  const label = normalizeText(advertiser)
  if (!label) {
    return text
  }

  const advertiserPrefix = new RegExp(`^(?:${escapeRegExp(label)}\\s*)+`, "i")
  text = text.replace(advertiserPrefix, "")
  return normalizeText(text)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function addEntry(entries: SwipeDisplayEntry[], label: string, value: unknown) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return
  }
  entries.push({ label, value: normalized })
}

function normalizeText(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
        .replace(/[\u200B-\u200D\uFEFF]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\s+([.,!?;:])/g, "$1")
        .trim()
    : ""
}

function looksLikeTextWall(value: unknown) {
  const text = normalizeText(value)
  return text.length > 180 || /Library ID:.*Started running on.*Platforms/i.test(text)
}

function looksLikeFacebookChrome(value: unknown) {
  return /Library ID:.*Started running on.*Platforms/i.test(normalizeText(value))
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
