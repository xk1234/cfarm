import crypto from "node:crypto"
import path from "node:path"

import JSZip from "jszip"

import { persistAsset, readAssetBytes } from "@/lib/asset-storage"
import { dataRoot } from "@/lib/appwrite-stores"
import { assetBackend } from "@/lib/backend-config"
import { slideshowOutputAssetPath } from "@/lib/public-slideshow-assets"
import { getRailwayDatabase } from "@/lib/railway/database"
import type { SlideshowRecord } from "@/lib/slideshows"
import { loadSharedSlideshow } from "@/lib/slideshow-share"
import { slideshowExportSlug } from "@/lib/slideshow-export"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = new URL(request.url).searchParams.get("token") ?? ""
  const slideshow = token ? await loadSharedSlideshow(id, token) : null
  if (!slideshow) return new Response("Not found", { status: 404 })
  if (slideshow.output_images.length === 0) {
    return new Response("This slideshow has no rendered images.", {
      status: 409,
    })
  }

  const archive = await cachedSlideshowArchive(slideshow)
  const body = archive.buffer.slice(
    archive.byteOffset,
    archive.byteOffset + archive.byteLength
  ) as ArrayBuffer
  return new Response(body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${slideshowExportSlug(slideshow.title)}.zip"`,
      "content-length": String(archive.byteLength),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  })
}

async function cachedSlideshowArchive(slideshow: SlideshowRecord) {
  const digest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        id: slideshow.id,
        updatedAt: slideshow.updated_at,
        images: slideshow.output_images,
      })
    )
    .digest("hex")
    .slice(0, 20)
  const cachePath = path.join(
    dataRoot(),
    "exports",
    "slideshows",
    `${slideshow.id}-${digest}.zip`
  )
  const cached = await readCachedArchive(cachePath)
  if (cached) return cached

  if (assetBackend() !== "railway") {
    return buildAndPersistArchive(slideshow, cachePath)
  }
  const reserved = await getRailwayDatabase().reserve()
  try {
    await reserved`SELECT pg_advisory_lock(hashtext(${cachePath}))`
    return (
      (await readCachedArchive(cachePath)) ??
      (await buildAndPersistArchive(slideshow, cachePath))
    )
  } finally {
    await reserved`SELECT pg_advisory_unlock(hashtext(${cachePath}))`.catch(
      () => undefined
    )
    reserved.release()
  }
}

async function readCachedArchive(cachePath: string) {
  try {
    return await readAssetBytes(cachePath)
  } catch (error) {
    const status = Number(
      (error as { code?: number; $metadata?: { httpStatusCode?: number } })
        .code ??
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode
    )
    if (status === 404) return null
    throw error
  }
}

async function buildAndPersistArchive(
  slideshow: SlideshowRecord,
  cachePath: string
) {
  const zip = new JSZip()
  const digits = Math.max(2, String(slideshow.output_images.length).length)
  for (const [index, url] of slideshow.output_images.entries()) {
    const relativePath = slideshowOutputAssetPath(url)
    if (!relativePath) {
      throw new Error(`Slide ${index + 1} has an invalid asset path.`)
    }
    const bytes = await readAssetBytes(path.join(dataRoot(), relativePath))
    zip.file(`slide-${String(index + 1).padStart(digits, "0")}.png`, bytes)
  }
  const archive = Buffer.from(
    await zip.generateAsync({ type: "uint8array", compression: "STORE" })
  )
  await persistAsset(cachePath, archive)
  return archive
}
