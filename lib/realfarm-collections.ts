import type { RealFarmData } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"

export type CreatedImageCollection = {
  id: string
  title: string
  images: PinterestSearchResult[]
  createdAt: string
  source: "pinterest" | "upload" | "virtual" | "fallback" | "empty"
  virtual?: boolean
  payload?: PinterestCollectionCreatePayload
}

export type PinterestCollectionCreatePayload = {
  image_urls: string[]
  user_id: string
  collection_name: string
  auto_caption: boolean
}

export type StoredImageCollection = {
  name: string
  created_at: string
  images: {
    image_link: string
    caption: string
  }[]
}

export function defaultImageCollections(data: RealFarmData): CreatedImageCollection[] {
  const backgrounds = data.defaultCollections.backgrounds

  return [
    {
      id: backgrounds.id,
      title: "Pinterest - backgrounds",
      images: backgrounds.images,
      createdAt: "default",
      source: "pinterest",
    },
  ]
}

export function allImagesCollectionFrom(collections: CreatedImageCollection[]): CreatedImageCollection {
  const seen = new Set<string>()
  const images = collections.flatMap((collection) => collection.images).filter((image) => {
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
    images,
    createdAt: "virtual",
    source: "virtual",
    virtual: true,
  }
}

export function collectionToStored(collection: CreatedImageCollection): StoredImageCollection {
  return {
    name: collection.title,
    created_at: normalizedCollectionDate(collection.createdAt),
    images: collection.images
      .filter((image) => image.imageUrl)
      .map((image) => ({
        image_link: image.imageUrl,
        caption: image.description ?? "",
      })),
  }
}

export function storedToCollection(collection: StoredImageCollection): CreatedImageCollection {
  return {
    id: `collection-${slugify(`${collection.name}-${collection.created_at}`)}`,
    title: collection.name,
    createdAt: normalizedCollectionDate(collection.created_at),
    source: "pinterest",
    images: collection.images.map((image, index) => ({
      id: `stored-${slugify(collection.name)}-${index}`,
      title: image.caption || collection.name,
      description: image.caption,
      imageUrl: image.image_link,
      sourceUrl: image.image_link,
      dominantColor: "#d9d8d0",
    })),
  }
}

function normalizedCollectionDate(value: string) {
  return Number.isFinite(Date.parse(value)) ? value : new Date().toISOString()
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
