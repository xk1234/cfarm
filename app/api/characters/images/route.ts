import { clean } from "@/lib/guards"
import path from "node:path"

import { NextResponse } from "next/server"

import { persistAsset } from "@/lib/asset-storage"

import {
  deleteCharacterImageGeneration,
  listCharacterImageGenerations,
  upsertCharacterImageGeneration,
} from "@/lib/character-image-generations"

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
  const characterId = Number(searchParams.get("characterId"))
  const generations = await listCharacterImageGenerations({
    characterId: Number.isFinite(characterId) ? characterId : undefined,
  })

  return NextResponse.json({ generations })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Image file is required" },
        { status: 400 }
      )
    }
    if (file.type && !allowedImageTypes.has(file.type)) {
      return NextResponse.json(
        { error: "Only image files are supported" },
        { status: 400 }
      )
    }

    const characterId = numberValue(formData.get("characterId"))
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
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload character image",
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")?.trim()
  if (!id) {
    return NextResponse.json(
      { error: "Missing generation id" },
      { status: 400 }
    )
  }

  const result = await deleteCharacterImageGeneration({ id })
  return NextResponse.json(result)
}

function numberValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

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

