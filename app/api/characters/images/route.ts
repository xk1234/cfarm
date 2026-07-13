import { clean } from "@/lib/guards"
import path from "node:path"

import { NextResponse } from "next/server"

import { withHandler } from "@/lib/api"
import { persistAsset } from "@/lib/asset-storage"

import {
  listCharacterImageGenerations,
  upsertCharacterImageGeneration,
} from "@/lib/character-image-generations"
import { listCharacterVideoGenerations } from "@/lib/character-video-generations"
import { composeCharacterGenerationView } from "@/lib/realfarm-character-ui"

export const dynamic = "force-dynamic"

const allowedImageTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const characterId = searchParams.get("characterId")?.trim() || undefined
  const [images, videos] = await Promise.all([
    listCharacterImageGenerations({ characterId }),
    listCharacterVideoGenerations({ characterId }),
  ])
  const videosByGeneration = new Map(
    videos.map((video) => [video.generationId, video])
  )
  const generations = images.map((image) =>
    composeCharacterGenerationView(image, videosByGeneration.get(image.id))
  )

  return NextResponse.json({ generations })
}

export const POST = withHandler(async (request: Request) => {
  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required" }, { status: 400 })
  }
  if (file.type && !allowedImageTypes.has(file.type)) {
    return NextResponse.json(
      { error: "Only image files are supported" },
      { status: 400 }
    )
  }

  const characterId = clean(formData.get("characterId")) || undefined
  const aspectRatio = clean(formData.get("aspectRatio")) || "9:16"
  const extension = imageExtension(file)
  const safeBaseName = safeFileBaseName(file.name)
  const fileName = `${Date.now()}-uploaded-${safeBaseName}${extension}`
  const folder = path.join(process.cwd(), "data", "characters", "images")
  await persistAsset(
    path.join(folder, fileName),
    Buffer.from(await file.arrayBuffer())
  )

  const imageUrl = `/api/local-assets/characters/images/${encodeURIComponent(fileName)}`
  const generation = await upsertCharacterImageGeneration({
    id: `uploaded-${path.basename(fileName, extension)}`,
    characterId,
    prompt:
      clean(formData.get("prompt")) || `Uploaded source image: ${file.name}`,
    model: "Uploaded image",
    createdAt: new Date().toISOString(),
    attachments: [],
    aspectRatio,
    status: "ready",
    imageUrl,
    progress: 100,
    workflowLabel: "Uploaded Source",
    workflowMetadata: {
      workflow: "free_generate",
      workflowLabel: "Uploaded Source",
      recipe: { source: "drag_drop_upload", originalFileName: file.name },
    },
  })

  return NextResponse.json({ imageUrl, generation }, { status: 201 })
})


function imageExtension(file: File) {
  const extension = path.extname(file.name).toLowerCase()
  if ([".avif", ".gif", ".jpeg", ".jpg", ".png", ".webp"].includes(extension)) {
    return extension === ".jpeg" ? ".jpg" : extension
  }
  if (file.type === "image/jpeg") return ".jpg"
  if (file.type === "image/webp") return ".webp"
  if (file.type === "image/gif") return ".gif"
  if (file.type === "image/avif") return ".avif"
  return ".png"
}

function safeFileBaseName(fileName: string) {
  const baseName = path.basename(fileName, path.extname(fileName))
  return (
    baseName
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "source"
  )
}

