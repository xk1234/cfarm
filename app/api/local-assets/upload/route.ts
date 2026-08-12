import path from "node:path"

import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { persistAsset } from "@/lib/asset-storage"
import { mediaLibraryAsset, upsertMediaLibraryAsset } from "@/lib/media-library"

export const dynamic = "force-dynamic"

const allowedAudioTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
])
const allowedExtensions = new Set([".mp3", ".wav"])
const maxUploadBytes = 25 * 1024 * 1024

export const POST = withHandler(async (request: Request) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxUploadBytes) {
    return NextResponse.json(
      { error: "Audio file is too large" },
      { status: 413 }
    )
  }
  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Audio file is required" },
      { status: 400 }
    )
  }
  if (file.size > maxUploadBytes) {
    return NextResponse.json(
      { error: "Audio file is too large" },
      { status: 413 }
    )
  }

  const extension = path.extname(file.name).toLowerCase()
  if (
    !allowedExtensions.has(extension) ||
    (file.type && !allowedAudioTypes.has(file.type))
  ) {
    return NextResponse.json(
      { error: "Only MP3 and WAV audio files are supported" },
      { status: 400 }
    )
  }

  const targetFolder = path.join(
    process.cwd(),
    "data",
    "music",
    "Uploaded Sounds"
  )

  const safeName =
    path
      .basename(file.name)
      .replace(/[^a-zA-Z0-9._ -]/g, "")
      .replace(/\s+/g, " ")
      .trim() || `uploaded-${Date.now()}${extension}`
  const targetPath = path.join(targetFolder, safeName)
  await persistAsset(targetPath, Buffer.from(await file.arrayBuffer()))

  const relativePath = path.join("music", "Uploaded Sounds", safeName)
  const asset = await upsertMediaLibraryAsset(
    mediaLibraryAsset({
      relativePath,
      kind: "audio",
      collection: "music",
    })
  )

  return NextResponse.json({
    asset,
  })
})
