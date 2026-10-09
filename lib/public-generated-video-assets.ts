import path from "node:path"

const localAssetPrefixes = ["/api/local-assets/", "/api/assets/"] as const

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".webm": "video/webm",
  ".webp": "image/webp",
}

export function generatedVideoAssetPath(value: string) {
  if (/%2e/i.test(value)) return null
  let pathname = ""
  try {
    pathname = new URL(value, "https://lumenclip.invalid").pathname
  } catch {
    return null
  }
  const prefix = localAssetPrefixes.find((candidate) =>
    pathname.startsWith(candidate)
  )
  if (!prefix) return null
  let relativePath = ""
  try {
    relativePath = decodeURIComponent(pathname.slice(prefix.length))
  } catch {
    return null
  }
  if (
    !relativePath ||
    relativePath.includes("\\") ||
    relativePath
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null
  }
  return relativePath
}

export function generatedVideoContentType(relativePath: string) {
  return (
    contentTypes[path.extname(relativePath).toLowerCase()] ??
    "application/octet-stream"
  )
}

export function publicGeneratedVideoMediaUrl(input: {
  outputId: string
  token: string
  kind: "video" | "thumbnail"
  download?: boolean
}) {
  const query = new URLSearchParams({
    kind: input.kind,
    token: input.token,
  })
  if (input.download) query.set("download", "1")
  return `/api/public/videos/${encodeURIComponent(input.outputId)}/media?${query}`
}
