import type { RealFarmData } from "@/lib/realfarm-data"
import type { PinterestSearchResult } from "@/lib/pinterest-search"

export type CreatedImageCollection = {
  id: string
  title: string
  images: PinterestSearchResult[]
  createdAt: string
  source: "pinterest" | "pexels" | "upload" | "virtual" | "fallback" | "pexels-fallback" | "empty"
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

export function collectionAliases(collection: CreatedImageCollection): string[] {
  const aliases = new Set([collection.id, collection.title])

  for (const image of collection.images) {
    for (const value of [image.imageUrl, image.sourceUrl]) {
      const alias = communityCollectionAliasFromPath(value)
      if (alias) {
        aliases.add(alias)
      }
    }
  }

  return [...aliases].filter(Boolean)
}

export function collectionMatchesId(collection: CreatedImageCollection, collectionId: string) {
  const normalizedId = collectionId.trim()
  return Boolean(normalizedId) && collectionAliases(collection).includes(normalizedId)
}

export function findCollectionByIdOrAlias(collections: CreatedImageCollection[], collectionId: string) {
  return collections.find((collection) => collectionMatchesId(collection, collectionId))
}

function normalizedCollectionDate(value: string) {
  return Number.isFinite(Date.parse(value)) ? value : new Date().toISOString()
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}

function communityCollectionAliasFromPath(value: string | undefined) {
  const match = value?.match(/-(\d{4,})-\d{4}-/)
  return match?.[1] ? `community_collection_${match[1]}` : null
}
