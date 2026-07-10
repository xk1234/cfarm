import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import path from "node:path"

import { clean } from "../lib/guards"
import { readJsonArrayStore, writeJsonArrayStore } from "../lib/json-store"

type StoredImageCollection = {
  name: string
  created_at: string
  images: {
    image_link: string
    caption: string
    hash?: string
  }[]
}

const rootDir = path.join(process.cwd(), "data")
const fileName = "image-collections.json"
const publicPrefix = "/api/local-assets/image-collections/files"
const filesDir = path.join(rootDir, "image-collections", "files")

async function main() {
  const collections = await readJsonArrayStore<StoredImageCollection>({
    rootDir,
    fileName,
    key: "collections",
    normalize: normalizeCollection,
  })
  let updatedImages = 0

  const nextCollections = await Promise.all(
    collections.map(async (collection) => {
      const images = await Promise.all(
        collection.images.map(async (image) => {
          if (image.hash) {
            return image
          }
          const filePath = localCollectionFilePath(image.image_link)
          if (!filePath) {
            return image
          }
          try {
            const bytes = await readFile(filePath)
            updatedImages += 1
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
    })
  )

  await writeJsonArrayStore({
    rootDir,
    fileName,
    key: "collections",
    records: nextCollections,
  })
  console.log(
    `Backfilled ${updatedImages} image hash${updatedImages === 1 ? "" : "es"}.`
  )
}

function normalizeCollection(
  raw: StoredImageCollection
): StoredImageCollection | null {
  const name = clean(raw.name)
  const createdAt = clean(raw.created_at)
  if (!name || !createdAt || !Array.isArray(raw.images)) {
    return null
  }
  return {
    name,
    created_at: createdAt,
    images: raw.images.flatMap((image) => {
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
    }),
  }
}

function localCollectionFilePath(imageLink: string) {
  if (!imageLink.startsWith(`${publicPrefix}/`)) {
    return null
  }

  const encodedFileName = imageLink
    .slice(`${publicPrefix}/`.length)
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

  const root = path.resolve(filesDir)
  const filePath = path.resolve(root, fileName)
  return filePath.startsWith(`${root}${path.sep}`) ? filePath : null
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
