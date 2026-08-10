import { absoluteAssetUrl } from "@/lib/asset-urls"

export type WorkflowMediaArtifact = {
  id: string
  kind: "image" | "video" | "audio"
  role: string
  fileName: string
  mimeType: string
  source: {
    type: "appwrite" | "remote"
    url: string
  }
  preview: {
    type: "image" | "video" | "audio"
    url: string
    thumbnailUrl?: string
  }
  download: {
    url: string
    fileName: string
  }
  metadata?: {
    width?: number
    height?: number
    durationSeconds?: number
  }
}

export function workflowMediaArtifacts(value: unknown) {
  const artifacts = new Map<string, WorkflowMediaArtifact>()
  visit(value, "output", artifacts)
  return [...artifacts.values()]
}

function visit(
  value: unknown,
  path: string,
  artifacts: Map<string, WorkflowMediaArtifact>
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${path}.${index}`, artifacts))
    return
  }
  if (!value || typeof value !== "object") return
  const record = value as Record<string, unknown>
  for (const [key, item] of Object.entries(record)) {
    if (key === "mediaArtifacts") continue
    if (typeof item === "string") {
      const kind = mediaKind(key, item, record)
      if (kind) {
        const artifact = mediaArtifact(kind, key, item, record, path)
        artifacts.set(`${artifact.kind}:${artifact.source.url}`, artifact)
      }
    }
    visit(item, `${path}.${key}`, artifacts)
  }
}

function mediaArtifact(
  kind: WorkflowMediaArtifact["kind"],
  key: string,
  value: string,
  record: Record<string, unknown>,
  path: string
): WorkflowMediaArtifact {
  const url = absoluteAssetUrl(value)
  const fileName = mediaFileName(url, `${kind}-${path.split(".").at(-1)}`)
  const thumbnailUrl = cleanUrl(
    record.thumbnailUrl ?? record.thumbnail_url ?? record.previewUrl
  )
  const width = positiveNumber(record.width)
  const height = positiveNumber(record.height)
  const durationSeconds = positiveNumber(
    record.durationSeconds ?? record.duration_seconds ?? record.duration
  )
  const metadata =
    width || height || durationSeconds
      ? { width, height, durationSeconds }
      : undefined
  return {
    id: `${kind}:${url}`,
    kind,
    role: mediaRole(key, path),
    fileName,
    mimeType: mediaMimeType(kind, url, record),
    source: {
      type: url.includes("/api/local-assets/") ? "appwrite" : "remote",
      url,
    },
    preview: {
      type: kind,
      url,
      ...(thumbnailUrl ? { thumbnailUrl: absoluteAssetUrl(thumbnailUrl) } : {}),
    },
    download: { url, fileName },
    ...(metadata ? { metadata } : {}),
  }
}

function mediaKind(
  key: string,
  value: string,
  record: Record<string, unknown>
): WorkflowMediaArtifact["kind"] | undefined {
  if (!isMediaUrl(value)) return undefined
  const normalizedKey = key.toLowerCase()
  const explicitKind = String(
    record.kind ?? record.mediaKind ?? record.mediaType ?? record.type ?? ""
  ).toLowerCase()
  if (normalizedKey.includes("image") || normalizedKey.includes("thumbnail"))
    return "image"
  if (normalizedKey.includes("video")) return "video"
  if (normalizedKey.includes("audio") || normalizedKey.includes("soundtrack"))
    return "audio"
  if (["image", "video", "audio"].includes(explicitKind)) {
    return explicitKind as WorkflowMediaArtifact["kind"]
  }
  const pathname = safePathname(value)
  if (/\.(?:png|jpe?g|gif|webp|avif|svg)$/i.test(pathname)) return "image"
  if (/\.(?:mp4|mov|m4v|webm|mkv)$/i.test(pathname)) return "video"
  if (/\.(?:mp3|wav|m4a|aac|ogg|flac)$/i.test(pathname)) return "audio"
  return undefined
}

function isMediaUrl(value: string) {
  return /^(?:https?:\/\/|\/api\/local-assets\/)/i.test(value)
}

function mediaRole(key: string, path: string) {
  return key.replace(/(?:_|-)?url$/i, "") || path.split(".").at(-1) || "media"
}

function mediaFileName(url: string, fallback: string) {
  const pathname = safePathname(url)
  const fileName = decodeURIComponent(
    pathname.split("/").filter(Boolean).at(-1) || ""
  )
  return fileName || fallback
}

function mediaMimeType(
  kind: WorkflowMediaArtifact["kind"],
  url: string,
  record: Record<string, unknown>
) {
  const supplied = String(record.mimeType ?? record.contentType ?? "").trim()
  if (supplied) return supplied
  const extension = safePathname(url).split(".").at(-1)?.toLowerCase()
  const known: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    ogg: "audio/ogg",
  }
  return (extension && known[extension]) || `${kind}/*`
}

function safePathname(value: string) {
  try {
    return new URL(value, "https://lumenclip.invalid").pathname
  } catch {
    return value.split(/[?#]/)[0]
  }
}

function cleanUrl(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function positiveNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : undefined
}
