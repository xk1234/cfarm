import { clean } from "@/lib/guards"
import { createHash, randomUUID } from "node:crypto"
import path from "node:path"

import {
  deleteAssetFromAppwrite,
  persistAsset,
  readAssetBytes,
} from "@/lib/asset-storage"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"

export type StoredImageCollection = {
  ownerId?: string
  name: string
  created_at: string
  pinned?: boolean
  images: {
    image_link: string
    caption: string
    hash?: string
    last_used_at?: string
  }[]
}

export type ImageCollectionDeleteInput = Pick<
  StoredImageCollection,
  "name" | "created_at"
>

const IMAGE_COLLECTIONS_DB_PATH = path.join(
  process.cwd(),
  "data",
  "image-collections.json"
)
const IMAGE_COLLECTION_FILES_DIR = path.join(
  process.cwd(),
  "data",
  "image-collections",
  "files"
)
const IMAGE_COLLECTION_PUBLIC_PREFIX =
  "/api/local-assets/image-collections/files"
const MAX_IMPORT_IMAGES = 80
const MAX_IMPORT_IMAGE_BYTES = 16 * 1024 * 1024

export async function listImageCollections() {
  return collectionsWithLastUsedAt(await readImageCollectionsFile())
}

export async function upsertImageCollection(collection: StoredImageCollection) {
  const current = await readImageCollectionsFile()
  const nextCollection = normalizeCollection(
    await collectionWithLocalImageHashes(collection)
  )
  const existingIndex = current.findIndex(
    (item) => collectionNameKey(item) === collectionNameKey(nextCollection)
  )
  const next = [
    nextCollection,
    ...current.filter(
      (item) => collectionNameKey(item) !== collectionNameKey(nextCollection)
    ),
  ]

  await writeImageCollectionsFile(next)
  if (existingIndex >= 0) {
    await deleteUnusedLocalCollectionFiles([current[existingIndex]], next)
  }
  return nextCollection
}

export async function updateImageCollectionCaptions(
  collection: StoredImageCollection
) {
  return upsertImageCollection(collection)
}

export async function deleteImageCollections(
  collections: ImageCollectionDeleteInput[]
) {
  const requestedKeys = new Set(
    collections
      .map((collection) =>
        collectionKey({
          name: clean(collection.name),
          created_at: clean(collection.created_at),
          images: [],
        })
      )
      .filter((key) => key !== "::")
  )
  if (requestedKeys.size === 0) {
    throw new Error("No image collections selected")
  }

  const current = await readImageCollectionsFile()
  const deleted = current.filter((collection) =>
    requestedKeys.has(collectionKey(collection))
  )
  const next = current.filter(
    (collection) => !requestedKeys.has(collectionKey(collection))
  )

  await writeImageCollectionsFile(next)
  const deletedFiles = await deleteUnusedLocalCollectionFiles(deleted, next)

  return {
    deleted: deleted.length,
    deletedFiles,
  }
}

export async function importRemoteImagesToCollection(input: {
  collectionName?: string
  collectionCreatedAt?: string
  images?: { url?: string; caption?: string; sourceUrl?: string }[]
  fetchImpl?: typeof fetch
}) {
  const imageInputs = Array.isArray(input.images) ? input.images : []
  const uniqueImages = dedupeImportImages(imageInputs).slice(
    0,
    MAX_IMPORT_IMAGES
  )
  if (uniqueImages.length === 0) {
    throw new Error("No images to import")
  }

  const current = await readImageCollectionsFile()
  const requestedName = clean(input.collectionName) || "Tumblr import"
  const requestedCreatedAt = clean(input.collectionCreatedAt)
  const existing =
    current.find(
      (collection) =>
        collectionNameKey(collection) ===
        collectionNameKey({ name: requestedName })
    ) ?? null
  const baseCollection: StoredImageCollection = existing ?? {
    name: requestedName,
    created_at: requestedCreatedAt || new Date().toISOString(),
    images: [],
  }

  const importedImages = []
  for (const [index, image] of uniqueImages.entries()) {
    const saved = await downloadImageToCollectionFile({
      url: image.url,
      sourceUrl: image.sourceUrl,
      index,
      fetchImpl: input.fetchImpl,
    })
    importedImages.push({
      image_link: saved.publicUrl,
      caption: clean(image.caption),
      hash: saved.hash,
    })
  }

  const existingLinks = new Set(
    baseCollection.images.map((image) => image.image_link)
  )
  const existingHashes = new Set(
    baseCollection.images.map((image) => clean(image.hash)).filter(Boolean)
  )
  const nextCollection = normalizeCollection({
    ...baseCollection,
    images: [
      ...importedImages.filter(
        (image) =>
          !existingLinks.has(image.image_link) &&
          (!image.hash || !existingHashes.has(image.hash))
      ),
      ...baseCollection.images,
    ],
  })
  const next = [
    nextCollection,
    ...current.filter(
      (collection) =>
        collectionNameKey(collection) !== collectionNameKey(nextCollection)
    ),
  ]

  await writeImageCollectionsFile(next)
  return {
    collection: nextCollection,
    imported: importedImages.length,
  }
}

function collectionKey(collection: StoredImageCollection) {
  return `${collection.name}::${collection.created_at}`
}

function collectionNameKey(collection: Pick<StoredImageCollection, "name">) {
  return clean(collection.name).toLowerCase()
}

function normalizeCollection(
  collection: StoredImageCollection
): StoredImageCollection {
  return {
    name: clean(collection.name) || "Untitled collection",
    created_at: clean(collection.created_at) || new Date().toISOString(),
    pinned: collection.pinned === true,
    images: Array.isArray(collection.images)
      ? collection.images.flatMap((image) => {
          const imageLink = clean(image.image_link)
          if (!imageLink) {
            return []
          }
          const hash = clean(image.hash)
          return [
            {
              image_link: imageLink,
              caption: clean(image.caption),
              ...(hash ? { hash } : {}),
            },
          ]
        })
      : [],
  }
}

async function collectionWithLocalImageHashes(
  collection: StoredImageCollection
): Promise<StoredImageCollection> {
  if (!Array.isArray(collection.images)) {
    return collection
  }

  const images = await Promise.all(
    collection.images.map(async (image) => {
      if (clean(image.hash)) {
        return image
      }
      const filePath = localCollectionFilePath(clean(image.image_link))
      if (!filePath) {
        return image
      }
      try {
        const bytes = await readAssetBytes(filePath)
        return {
          ...image,
          hash: createHash("sha256").update(bytes).digest("hex"),
        }
      } catch {
        return image
      }
    })
  )

  return {
    ...collection,
    images,
  }
}

async function deleteUnusedLocalCollectionFiles(
  deletedCollections: StoredImageCollection[],
  remainingCollections: StoredImageCollection[]
) {
  const remainingLocalLinks = new Set(
    remainingCollections.flatMap((collection) =>
      collection.images
        .map((image) => clean(image.image_link))
        .filter((imageLink) => localCollectionFilePath(imageLink))
    )
  )
  const filesToDelete = new Map<string, string>()

  for (const collection of deletedCollections) {
    for (const image of collection.images) {
      const imageLink = clean(image.image_link)
      if (remainingLocalLinks.has(imageLink)) {
        continue
      }
      const filePath = localCollectionFilePath(imageLink)
      if (filePath) {
        filesToDelete.set(filePath, imageLink)
      }
    }
  }

  for (const filePath of filesToDelete.keys()) {
    await deleteAssetFromAppwrite(filePath)
  }

  return filesToDelete.size
}

function localCollectionFilePath(imageLink: string) {
  if (!imageLink.startsWith(`${IMAGE_COLLECTION_PUBLIC_PREFIX}/`)) {
    return null
  }

  const encodedFileName = imageLink
    .slice(`${IMAGE_COLLECTION_PUBLIC_PREFIX}/`.length)
    .split(/[?#]/)[0]
  let fileName = ""
  try {
    fileName = decodeURIComponent(encodedFileName)
  } catch {
    return null
  }

  if (!fileName || fileName.includes("/") || fileName.includes("\\")) {
    return null
  }

  const root = path.resolve(IMAGE_COLLECTION_FILES_DIR)
  const filePath = path.resolve(root, fileName)
  return filePath.startsWith(`${root}${path.sep}`) ? filePath : null
}

async function readImageCollectionsFile(): Promise<StoredImageCollection[]> {
  return readJsonArrayStore({
    rootDir: path.dirname(IMAGE_COLLECTIONS_DB_PATH),
    fileName: path.basename(IMAGE_COLLECTIONS_DB_PATH),
    key: "collections",
    normalize: normalizeCollection,
  })
}

async function collectionsWithLastUsedAt(
  collections: StoredImageCollection[]
): Promise<StoredImageCollection[]> {
  const lastUsedByKey = await readImageLastUsedDates()
  if (lastUsedByKey.size === 0) {
    return collections
  }

  return collections.map((collection) => ({
    ...collection,
    images: collection.images.map((image) => {
      const lastUsedAt =
        (image.hash ? lastUsedByKey.get(image.hash) : undefined) ??
        lastUsedByKey.get(image.image_link)
      return lastUsedAt ? { ...image, last_used_at: lastUsedAt } : image
    }),
  }))
}

async function readImageLastUsedDates() {
  const records = await readJsonArrayStore<{
    kind?: string
    key?: string
    used_at?: string
  }>({
    rootDir: path.dirname(IMAGE_COLLECTIONS_DB_PATH),
    fileName: "usage-ledger.json",
    key: "usage",
    normalize: (record) => {
      const key = clean(record.key)
      const usedAt = clean(record.used_at)
      return record.kind === "image" && key && usedAt
        ? { kind: "image", key, used_at: usedAt }
        : null
    },
  })
  const lastUsedByKey = new Map<string, string>()
  for (const record of records) {
    const previous = lastUsedByKey.get(record.key!)
    if (!previous || Date.parse(record.used_at!) > Date.parse(previous)) {
      lastUsedByKey.set(record.key!, record.used_at!)
    }
  }
  return lastUsedByKey
}

async function writeImageCollectionsFile(collections: StoredImageCollection[]) {
  await writeJsonArrayStore({
    rootDir: path.dirname(IMAGE_COLLECTIONS_DB_PATH),
    fileName: path.basename(IMAGE_COLLECTIONS_DB_PATH),
    key: "collections",
    records: collections,
  })
}

function dedupeImportImages(
  images: { url?: string; caption?: string; sourceUrl?: string }[]
) {
  const seen = new Set<string>()
  const next = []
  for (const image of images) {
    const url = clean(image.url)
    if (!safeHttpUrl(url) || seen.has(url)) {
      continue
    }
    seen.add(url)
    next.push({
      url,
      caption: clean(image.caption),
      sourceUrl: clean(image.sourceUrl),
    })
  }
  return next
}

async function downloadImageToCollectionFile(input: {
  url: string
  sourceUrl?: string
  index: number
  fetchImpl?: typeof fetch
}) {
  const response = await (input.fetchImpl ?? fetch)(input.url, {
    headers: {
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      Referer: safeHttpUrl(input.sourceUrl || "") || "https://www.tumblr.com/",
      "User-Agent":
        "Mozilla/5.0 (compatible; cfarm-image-collection-import/1.0)",
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to download image ${input.index + 1}`)
  }

  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ||
    ""
  if (!contentType.startsWith("image/")) {
    throw new Error(`Imported URL ${input.index + 1} was not an image`)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > MAX_IMPORT_IMAGE_BYTES) {
    throw new Error(`Image ${input.index + 1} is too large to import`)
  }
  const hash = createHash("sha256").update(bytes).digest("hex")

  const extension = extensionForImage(input.url, contentType)
  const fileName = `${Date.now()}-${randomUUID()}${extension}`
  await persistAsset(path.join(IMAGE_COLLECTION_FILES_DIR, fileName), bytes)

  return {
    fileName,
    hash,
    publicUrl: `${IMAGE_COLLECTION_PUBLIC_PREFIX}/${encodeURIComponent(fileName)}`,
  }
}

function extensionForImage(url: string, contentType: string) {
  const byType: Record<string, string> = {
    "image/avif": ".avif",
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
  }
  if (byType[contentType]) {
    return byType[contentType]
  }

  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase()
    return [".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"].includes(
      extension
    )
      ? extension
      : ".jpg"
  } catch {
    return ".jpg"
  }
}

function safeHttpUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return ""
    }
    return url.toString()
  } catch {
    return ""
  }
}
