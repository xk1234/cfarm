import type { StoredImageCollection } from "@/lib/image-collections"
import type { RealFarmData } from "@/lib/realfarm-data"
import type { LocalAsset } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"

// Canonical persisted collection shape lives in image-collections; re-export
// so existing `@/lib/realfarm-collections` importers keep working.
export type { StoredImageCollection }

export type CreatedImageCollection = {
  id: string
  title: string
  mediaType?: "image" | "video"
  images: PinterestSearchResult[]
  createdAt: string
  pinned?: boolean
  source:
    | "pinterest"
    | "pexels"
    | "upload"
    | "virtual"
    | "fallback"
    | "pexels-fallback"
    | "empty"
  virtual?: boolean
  payload?: PinterestCollectionCreatePayload
}

export type PinterestCollectionCreatePayload = {
  image_urls: string[]
  user_id: string
  collection_name: string
  auto_caption: boolean
}

export function defaultImageCollections(
  data: RealFarmData
): CreatedImageCollection[] {
  const backgrounds = data.defaultCollections.backgrounds

  return [
    {
      id: backgrounds.id,
      title: backgrounds.title || "Backgrounds",
      images: backgrounds.images,
      createdAt: "default",
      source: "fallback",
    },
  ]
}

export function allImagesCollectionFrom(
  collections: CreatedImageCollection[]
): CreatedImageCollection {
  const seen = new Set<string>()
  const images = collections
    .filter((collection) => collection.mediaType !== "video")
    .flatMap((collection) => collection.images)
    .filter((image) => {
      const key = image.id || image.imageUrl
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })

  return {
    id: "collection-all-images",
    title: "All Images",
    mediaType: "image",
    images,
    createdAt: "virtual",
    source: "virtual",
    virtual: true,
  }
}

export function ugcAvatarVideoCollectionFromAssets(
  videos: LocalAsset[]
): CreatedImageCollection {
  return {
    id: "collection-ugc-avatar-videos",
    title: "AI UGC Avatar Videos",
    mediaType: "video",
    images: videos
      .filter((video) => video.kind === "video" && video.url)
      .map((video) => ({
        id: video.id,
        title: video.name,
        description: video.name,
        imageUrl: video.url,
        sourceUrl: video.url,
        dominantColor: "#1f1f1f",
      })),
    createdAt: "virtual",
    source: "virtual",
    virtual: true,
  }
}

export function collectionToStored(
  collection: CreatedImageCollection
): StoredImageCollection {
  return {
    name: collection.title,
    created_at: normalizedCollectionDate(collection.createdAt),
    pinned: collection.pinned === true,
    images: collection.images
      .filter((image) => image.imageUrl)
      .map((image) => ({
        image_link: image.imageUrl,
        caption: image.description ?? "",
        ...(image.hash ? { hash: image.hash } : {}),
      })),
  }
}

export function storedToCollection(
  collection: StoredImageCollection
): CreatedImageCollection {
  return {
    id: `collection-${slugify(`${collection.name}-${collection.created_at}`)}`,
    title: collection.name,
    mediaType: "image",
    createdAt: normalizedCollectionDate(collection.created_at),
    pinned: collection.pinned === true,
    source: "pinterest",
    images: collection.images.map((image, index) => ({
      id: image.hash || `stored-${slugify(collection.name)}-${index}`,
      title: image.caption || collection.name,
      description: image.caption,
      imageUrl: image.image_link,
      sourceUrl: image.image_link,
      ...(image.hash ? { hash: image.hash } : {}),
      ...(image.last_used_at ? { lastUsedAt: image.last_used_at } : {}),
      dominantColor: "#d9d8d0",
    })),
  }
}

export function pinnedCollectionsFirst<T extends { pinned?: boolean }>(
  collections: T[]
): T[] {
  return collections
    .map((collection, index) => ({ collection, index }))
    .sort(
      (a, b) =>
        Number(b.collection.pinned === true) -
          Number(a.collection.pinned === true) || a.index - b.index
    )
    .map(({ collection }) => collection)
}

export function collectionAliases(
  collection: CreatedImageCollection
): string[] {
  const aliases = new Set([collection.id, collection.title])

  if (collection.virtual) {
    return [...aliases].filter(Boolean)
  }

  for (const image of collection.images) {
    for (const value of [image.imageUrl, image.sourceUrl]) {
      for (const alias of collectionAliasesFromPath(value)) {
        aliases.add(alias)
      }
    }
  }

  return [...aliases].filter(Boolean)
}

export function collectionMatchesId(
  collection: CreatedImageCollection,
  collectionId: string
) {
  const normalizedId = collectionId.trim()
  return (
    Boolean(normalizedId) &&
    collectionAliases(collection).includes(normalizedId)
  )
}

export function findCollectionByIdOrAlias(
  collections: CreatedImageCollection[],
  collectionId: string
) {
  return collections.find((collection) =>
    collectionMatchesId(collection, collectionId)
  )
}

function normalizedCollectionDate(value: string) {
  return Number.isFinite(Date.parse(value)) ? value : new Date().toISOString()
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function collectionAliasesFromPath(value: string | undefined) {
  const match = value?.match(/-(\d{4,})-\d{4}-/)
  return match?.[1]
    ? [`community_collection_${match[1]}`, `user_collection_${match[1]}`]
    : []
}
