import type { AtlasImageSource } from "@/lib/slide-renderer-experiments"

export const defaultCollectionImageSampleSize = 12

export async function loadRandomCollectionImages(
  signal: AbortSignal,
  limit = defaultCollectionImageSampleSize
) {
  try {
    const response = await fetch("/api/image-collections", {
      credentials: "same-origin",
      signal,
    })
    if (!response.ok) return []
    const payload = (await response.json()) as {
      collections?: Array<{
        mediaType?: "image" | "video"
        images?: Array<{ image_link?: string }>
      }>
    }
    const urls = Array.from(
      new Set(
        (payload.collections ?? [])
          .filter((collection) => collection.mediaType !== "video")
          .flatMap((collection) => collection.images ?? [])
          .map((image) => image.image_link?.trim() ?? "")
          .filter(Boolean)
      )
    )
    shuffleInPlace(urls)
    const loaded = await Promise.allSettled(
      urls.slice(0, limit).map((url) => collectionImageSource(url, signal))
    )
    return loaded.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    )
  } catch {
    return []
  }
}

async function collectionImageSource(
  url: string,
  signal: AbortSignal
): Promise<AtlasImageSource> {
  if (url.startsWith("data:image/")) return { url, dataUrl: url }
  const fetchUrl = /^https?:\/\//i.test(url)
    ? `/api/image-proxy?url=${encodeURIComponent(url)}`
    : url
  const response = await fetch(fetchUrl, {
    credentials: "same-origin",
    signal,
  })
  if (!response.ok) throw new Error(`Image request failed: ${response.status}`)
  const blob = await response.blob()
  if (!blob.type.startsWith("image/")) throw new Error("Asset is not an image")
  return { url, dataUrl: await blobToDataUrl(blob) }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.readAsDataURL(blob)
  })
}

function shuffleInPlace<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    const current = items[index]
    items[index] = items[swapIndex]
    items[swapIndex] = current
  }
}
