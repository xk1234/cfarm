import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

export type StoredImageCollection = {
  name: string
  created_at: string
  images: {
    image_link: string
    caption: string
  }[]
}

const IMAGE_COLLECTIONS_DB_PATH = path.join(process.cwd(), "data", "image-collections.json")

export async function listImageCollections() {
  return readImageCollectionsFile()
}

export async function upsertImageCollection(collection: StoredImageCollection) {
  const current = await readImageCollectionsFile()
  const nextCollection = normalizeCollection(collection)
  const existingIndex = current.findIndex((item) => collectionKey(item) === collectionKey(nextCollection))
  const next = existingIndex >= 0
    ? current.map((item, index) => index === existingIndex ? nextCollection : item)
    : [nextCollection, ...current]

  await writeImageCollectionsFile(next)
  return nextCollection
}

export async function updateImageCollectionCaptions(collection: StoredImageCollection) {
  return upsertImageCollection(collection)
}

function collectionKey(collection: StoredImageCollection) {
  return `${collection.name}::${collection.created_at}`
}

function normalizeCollection(collection: StoredImageCollection): StoredImageCollection {
  return {
    name: clean(collection.name) || "Untitled collection",
    created_at: clean(collection.created_at) || new Date().toISOString(),
    images: Array.isArray(collection.images)
      ? collection.images.flatMap((image) => {
          const imageLink = clean(image.image_link)
          if (!imageLink) {
            return []
          }
          return [{ image_link: imageLink, caption: clean(image.caption) }]
        })
      : [],
  }
}

async function readImageCollectionsFile(): Promise<StoredImageCollection[]> {
  try {
    const contents = await readFile(IMAGE_COLLECTIONS_DB_PATH, "utf8")
    const parsed = JSON.parse(contents) as { collections?: StoredImageCollection[] }
    return (parsed.collections ?? []).map(normalizeCollection)
  } catch {
    return []
  }
}

async function writeImageCollectionsFile(collections: StoredImageCollection[]) {
  await mkdir(path.dirname(IMAGE_COLLECTIONS_DB_PATH), { recursive: true })
  await writeFile(IMAGE_COLLECTIONS_DB_PATH, `${JSON.stringify({ collections }, null, 2)}\n`)
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
