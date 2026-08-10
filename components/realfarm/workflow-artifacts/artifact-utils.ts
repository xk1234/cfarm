export type WorkflowArtifactKind =
  | "empty"
  | "hook"
  | "media"
  | "prompt"
  | "script"
  | "slideshow"
  | "structured"
  | "validation"

export type WorkflowArtifactContext = {
  direction?: "input" | "output"
  stageId?: string
}

export function inferWorkflowArtifactKind(
  value: unknown,
  context: WorkflowArtifactContext = {}
): WorkflowArtifactKind {
  if (isEmptyArtifact(value)) return "empty"

  const record = asRecord(value)
  const stageId = context.stageId?.toLowerCase() ?? ""

  if (
    (context.direction !== "input" &&
      (stageId.includes("validate-output") || stageId.includes("quality"))) ||
    hasAnyKey(record, [
      "issues",
      "failures",
      "warnings",
      "score",
      "passed",
      "valid",
    ])
  ) {
    return "validation"
  }

  if (
    stageId.includes("hook") ||
    hasAnyKey(record, ["resolvedHook", "hookTemplate", "hookCandidates"])
  ) {
    return "hook"
  }

  if (
    stageId.includes("prompt") ||
    hasMessageArray(record) ||
    asRecord(record?.promptPayload)?.messages !== undefined
  ) {
    return "prompt"
  }

  if (
    stageId.includes("script") ||
    stageId.includes("copy") ||
    looksLikeScript(record)
  ) {
    return "script"
  }

  const slides = findArtifactArray(record, ["slides"])
  if (slides?.some(looksLikeSlide)) return "slideshow"

  const media = findArtifactArray(record, [
    "selectedImages",
    "selectedAssets",
    "renderedSlides",
    "assets",
    "images",
    "media",
  ])
  if (media?.some(looksLikeMedia)) return "media"
  if (record && mediaUrlFromRecord(record)) return "media"

  if (Array.isArray(value)) {
    if (value.some(looksLikeSlide)) return "slideshow"
    if (value.some(looksLikeMedia)) return "media"
  }

  return "structured"
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function findArtifactArray(
  record: Record<string, unknown> | null,
  keys: string[]
): unknown[] | null {
  if (!record) return null
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key]
  }
  return null
}

export function humanizeArtifactKey(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/^./, (character) => character.toUpperCase())
}

export function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function safeMediaUrl(value: unknown) {
  const url = stringValue(value)
  if (!url) return undefined
  if (
    url.startsWith("/") ||
    url.startsWith("https://") ||
    url.startsWith("http://") ||
    url.startsWith("data:image/") ||
    url.startsWith("data:video/") ||
    url.startsWith("data:audio/")
  ) {
    return url
  }
  return undefined
}

export function mediaUrlFromRecord(record: Record<string, unknown>) {
  return safeMediaUrl(
    record.renderedImageUrl ??
      record.imageUrl ??
      record.sourceImageUrl ??
      record.previewUrl ??
      record.thumbnailUrl ??
      record.audioUrl ??
      record.videoUrl ??
      assetUrl(record.videoPath) ??
      assetUrl(record.audioPath) ??
      assetUrl(record.thumbnailPath) ??
      assetUrl(record.storagePath) ??
      record.url
  )
}

export function isVideoUrl(value: string) {
  return (
    value.startsWith("data:video/") ||
    /\.(mp4|mov|m4v|webm)(?:$|[?#])/i.test(value)
  )
}

export function isAudioUrl(value: string) {
  return (
    value.startsWith("data:audio/") ||
    /\.(mp3|m4a|wav|aac|ogg)(?:$|[?#])/i.test(value)
  )
}

export function isEmptyArtifact(value: unknown) {
  if (value === null || value === undefined || value === "") return true
  if (Array.isArray(value)) return value.length === 0
  const record = asRecord(value)
  return record ? Object.keys(record).length === 0 : false
}

function hasAnyKey(record: Record<string, unknown> | null, keys: string[]) {
  return Boolean(record && keys.some((key) => record[key] !== undefined))
}

function hasMessageArray(record: Record<string, unknown> | null) {
  return Boolean(record && Array.isArray(record.messages))
}

function looksLikeSlide(value: unknown) {
  const record = asRecord(value)
  return Boolean(
    record &&
    (record.slide !== undefined || record.slideId || record.role) &&
    (record.text !== undefined ||
      record.textItems !== undefined ||
      mediaUrlFromRecord(record))
  )
}

function looksLikeMedia(value: unknown) {
  const record = asRecord(value)
  return Boolean(record && mediaUrlFromRecord(record))
}

function looksLikeScript(record: Record<string, unknown> | null) {
  if (!record) return false
  const plan = asRecord(record.plan) ?? record
  return Boolean(
    (plan.hook || plan.caption) &&
    (Array.isArray(plan.segments) || Array.isArray(plan.posts))
  )
}

function assetUrl(value: unknown) {
  const path = stringValue(value)
  if (!path) return undefined
  if (path.startsWith("/api/assets/")) return path
  return `/api/assets/${path.replace(/^data\//, "").replace(/^\/+/, "")}`
}
