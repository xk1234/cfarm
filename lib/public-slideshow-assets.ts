import path from "node:path"

const localAssetPrefix = "/api/local-assets/"
const slideshowOutputPrefix = "slideshows/outputs/"

const contentTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
}

export function slideshowOutputAssetPath(value: string): string | null {
  let pathname: string
  try {
    pathname = new URL(value, "https://lumenclip.invalid").pathname
  } catch {
    return null
  }
  if (!pathname.startsWith(localAssetPrefix)) return null

  let segments: string[]
  try {
    segments = pathname
      .slice(localAssetPrefix.length)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
  } catch {
    return null
  }
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\")
    )
  ) {
    return null
  }

  const relativePath = segments.join("/")
  if (!relativePath.startsWith(slideshowOutputPrefix)) return null
  return relativePath
}

export function slideshowImageContentType(relativePath: string) {
  return (
    contentTypes[path.posix.extname(relativePath).toLowerCase()] ??
    "application/octet-stream"
  )
}

export function publicSlideshowImageUrl(input: {
  outputId: string
  token: string
  index: number
}) {
  return `/api/public/slideshows/${encodeURIComponent(input.outputId)}/slides/${input.index + 1}?token=${encodeURIComponent(input.token)}`
}
