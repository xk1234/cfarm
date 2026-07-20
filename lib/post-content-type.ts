import { clean, isRecord } from "@/lib/guards"

export type PostContentType =
  "slideshow" | "video" | "image" | "text" | "external"

export function inferPostContentType(input: {
  sourceType?: string
  media?: unknown[]
  metrics?: Record<string, unknown>
}): PostContentType {
  const sourceType = clean(input.sourceType).toLowerCase()
  const metricKeys = Object.keys(input.metrics ?? {}).map((key) =>
    key.toLowerCase()
  )
  const mediaTypes = (input.media ?? [])
    .map(mediaType)
    .filter((value): value is "image" | "video" => Boolean(value))

  if (
    ["generated_video", "greenscreen", "ugc_ad", "template_video"].includes(
      sourceType
    ) ||
    mediaTypes.includes("video")
  ) {
    return "video"
  }
  if (
    sourceType === "slideshow" ||
    sourceType === "automation" ||
    mediaTypes.filter((type) => type === "image").length > 1
  ) {
    return "slideshow"
  }
  if (
    metricKeys.some(
      (key) =>
        key.includes("watchtime") ||
        key.includes("watch_time") ||
        key === "videoviews" ||
        key === "video_views" ||
        key.includes("video_watched")
    )
  ) {
    return "video"
  }
  if (sourceType === "image" || mediaTypes.includes("image")) return "image"
  if (["manual", "x_automation"].includes(sourceType)) return "text"
  return sourceType === "external" || !sourceType ? "external" : "text"
}

export function postContentTypeLabel(type: PostContentType) {
  if (type === "slideshow") return "Slideshow"
  if (type === "video") return "Video"
  if (type === "image") return "Image post"
  if (type === "text") return "Text post"
  return "External post"
}

function mediaType(value: unknown) {
  const record = isRecord(value) ? value : {}
  const type = clean(
    record.type || record.mediaType || record.kind
  ).toLowerCase()
  if (type.includes("video")) return "video" as const
  if (type.includes("image") || type.includes("photo")) return "image" as const
  return null
}
