import { NextResponse } from "next/server"

import { createUploadedAssetRecord } from "@/lib/assets"
import {
  buildReferenceAnalysisOpenRouterRequest,
  parseReferenceAnalysisContent,
} from "@/lib/character-workflows"

export const dynamic = "force-dynamic"

type OpenRouterResponse = {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}

export async function POST(request: Request) {
  try {
    const reference = await readReferenceImageInput(request)
    if ("error" in reference) {
      return NextResponse.json({ error: reference.error }, { status: 400 })
    }

    const analysis = await analyzeReferenceImage(reference.analysisImageUrl)
    const asset = await createUploadedAssetRecord({
      fileName: reference.fileName,
      mimeType: reference.mimeType,
      bytes: reference.bytes,
      scope: "ugc_avatar",
      category: "reference",
      name: reference.name || "Reference image",
      metadata: {
        analysisStatus: "ready",
        analysis,
        ...(reference.sourceUrl ? { sourceUrl: reference.sourceUrl } : {}),
        ...(reference.sourceUpload ? { sourceUpload: true } : {}),
      },
    })

    return NextResponse.json({ asset }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import reference image",
      },
      { status: 500 }
    )
  }
}

async function readReferenceImageInput(request: Request): Promise<
  | {
      fileName: string
      mimeType: string
      bytes: Buffer
      analysisImageUrl: string
      name: string
      sourceUrl?: string
      sourceUpload?: boolean
    }
  | { error: string }
> {
  const contentType = request.headers.get("content-type") ?? ""
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return { error: "Reference image file is required" }
    }
    const mimeType = file.type || mimeTypeForFileName(file.name)
    if (!mimeType.startsWith("image/")) {
      return { error: "Reference upload must be an image" }
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    return {
      fileName: file.name || `reference.${extensionForMimeType(mimeType)}`,
      mimeType,
      bytes,
      analysisImageUrl: `data:${mimeType};base64,${bytes.toString("base64")}`,
      name: clean(formData.get("name")) || "Reference image",
      sourceUpload: true,
    }
  }

  const payload = (await request.json()) as {
    imageUrl?: string
    name?: string
  }
  const imageUrl = clean(payload.imageUrl)
  if (!imageUrl) {
    return { error: "Missing reference image URL" }
  }

  const imageResponse = await fetch(imageUrl)
  if (!imageResponse.ok) {
    return { error: "Failed to download reference image" }
  }
  const mimeType = imageResponse.headers.get("content-type") ?? "image/png"
  if (!mimeType.startsWith("image/")) {
    return { error: "Reference URL must point to an image" }
  }
  return {
    fileName: fileNameForReferenceUrl(imageUrl, mimeType),
    mimeType,
    bytes: Buffer.from(await imageResponse.arrayBuffer()),
    analysisImageUrl: imageUrl,
    name: clean(payload.name) || "Reference image",
    sourceUrl: imageUrl,
  }
}

async function analyzeReferenceImage(referenceImageUrl: string) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    throw new Error("Missing OPENROUTER_API_KEY")
  }
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "CFarm Reference Asset Import",
      },
      body: JSON.stringify(
        buildReferenceAnalysisOpenRouterRequest({ referenceImageUrl })
      ),
    }
  )
  const body = (await response.json().catch(() => ({}))) as OpenRouterResponse
  if (!response.ok) {
    throw new Error(
      body.error?.message || `Reference analysis failed with ${response.status}`
    )
  }
  return parseReferenceAnalysisContent(body.choices?.[0]?.message?.content)
}

function fileNameForReferenceUrl(imageUrl: string, mimeType: string) {
  try {
    const pathname = new URL(imageUrl).pathname
    const name = pathname.split("/").pop()?.trim()
    if (name) {
      return name
    }
  } catch {}
  return `reference.${extensionForMimeType(mimeType)}`
}

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("jpeg")) return "jpg"
  if (mimeType.includes("webp")) return "webp"
  if (mimeType.includes("gif")) return "gif"
  return "png"
}

function mimeTypeForFileName(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase()
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg"
  if (extension === "webp") return "image/webp"
  if (extension === "gif") return "image/gif"
  return "image/png"
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}
