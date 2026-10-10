import type { StoredImageCollection } from "@/lib/image-collections"
import type { PinterestSearchResult } from "@/lib/pinterest-search"

// Canonical persisted collection shape lives in image-collections; re-export
// so existing `@/lib/realfarm-collections` importers keep working.
export type { StoredImageCollection }

export type CreatedImageCollection = {
  id: string
  /** Server row id once saved; renames address the row by it. */
  serverId?: string
  title: string
  images: PinterestSearchResult[]
  createdAt: string
  pinned?: boolean
  source: "pinterest" | "pexels" | "upload" | "empty" | "fallback" | "pexels-fallback"
  virtual?: boolean
  payload?: PinterestCollectionCreatePayload
}

export type PinterestCollectionCreatePayload = {
  image_urls: string[]
  user_id: string
  collection_name: string
}

export function collectionToStored(
  collection: CreatedImageCollection
): StoredImageCollection {
  return {
    ...(collection.serverId ? { id: collection.serverId } : {}),
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
    id: storedCollectionId(collection),
    ...(collection.id ? { serverId: collection.id } : {}),
    title: collection.name,
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

/** "Untitled collection", then "Untitled collection 2", 3, … (names are unique per workspace). */
export function nextUntitledCollectionName(existing: readonly { title: string }[]): string {
  const base = "Untitled collection"
  const taken = new Set(existing.map((collection) => collection.title.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let n = 2; ; n += 1) {
    const name = `${base} ${n}`
    if (!taken.has(name.toLowerCase())) return name
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

  if (Number.isFinite(Date.parse(collection.createdAt))) {
    aliases.add(
      legacyStoredCollectionId({
        name: collection.title,
        created_at: collection.createdAt,
      })
    )
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

export function storedCollectionId(
  collection: Pick<StoredImageCollection, "name">
) {
  return slugify(collection.name)
}

export function legacyStoredCollectionId(
  collection: Pick<StoredImageCollection, "name" | "created_at">
) {
  return `collection-${slugify(`${collection.name}-${collection.created_at}`)}`
}

function collectionAliasesFromPath(value: string | undefined) {
  const match = value?.match(/-(\d{4,})-\d{4}-/)
  return match?.[1]
    ? [`community_collection_${match[1]}`, `user_collection_${match[1]}`]
    : []
}
