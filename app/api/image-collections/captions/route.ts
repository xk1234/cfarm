import path from "node:path"

import { NextResponse } from "next/server"

import { readAssetBytes } from "@/lib/asset-storage"
import { toDataUrl } from "@/lib/data-url"
import {
  updateImageCollectionCaptions,
  type StoredImageCollection,
} from "@/lib/image-collections"
import { openRouterChatCompletion } from "@/lib/openrouter"
import { openRouterModelForUseCase } from "@/lib/realfarm-generation-model-registry"

export const dynamic = "force-dynamic"

type CaptionResponse = {
  choices?: {
    message?: {
      content?: string
    }
  }[]
}

type CaptionRequestPayload = StoredImageCollection & {
  image_index?: number
}

export async function POST(request: Request) {
  try {
    const collection = (await request.json()) as CaptionRequestPayload
    const apiKey = process.env.OPENROUTER_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENROUTER_API_KEY" },
        { status: 500 }
      )
    }

    const captionedImages = await captionImages(collection, request.url, apiKey)

    const nextCollection: StoredImageCollection = {
      name: collection.name,
      created_at: collection.created_at,
      images: captionedImages,
    }

    const saved = await updateImageCollectionCaptions(nextCollection)
    return NextResponse.json({ collection: saved })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to caption collection images",
      },
      { status: 500 }
    )
  }
}

async function captionImages(
  collection: CaptionRequestPayload,
  requestUrl: string,
  apiKey: string
) {
  const targetIndex = Number.isInteger(collection.image_index)
    ? collection.image_index
    : undefined

  if (targetIndex !== undefined) {
    if (targetIndex < 0 || targetIndex >= collection.images.length) {
      throw new Error("Invalid image caption index")
    }

    const captionedImages = collection.images.map((image) => ({ ...image }))
    const image = captionedImages[targetIndex]
    captionedImages[targetIndex] = {
      ...image,
      caption: await captionImageWithRetry(
        await imageUrlForModel(image.image_link, requestUrl),
        apiKey
      ),
    }
    return captionedImages
  }

  return Promise.all(
    collection.images.map(async (image) => ({
      ...image,
      caption: await captionImageWithRetry(
        await imageUrlForModel(image.image_link, requestUrl),
        apiKey
      ),
    }))
  )
}

async function captionImageWithRetry(imageUrl: string, apiKey: string) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await captionImage(imageUrl, apiKey)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Image caption failed")
}

async function captionImage(imageUrl: string, apiKey: string) {
  const { ok, status, payload: raw } = await openRouterChatCompletion({
    apiKey,
    model: openRouterModelForUseCase("imageCaptioning"),
    headers: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "LumenClip Image Captioner",
    },
    messages: [
      {
        role: "system",
        content:
          "Caption images for a slideshow image collection. Return one concise factual caption only. No markdown, no quotes, no hashtags.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Write a natural one-sentence caption describing this image. Mention the main subject, setting, mood, and useful visual details in under 24 words.",
          },
          {
            type: "image_url",
            image_url: { url: imageUrl },
          },
        ],
      },
    ],
  })

  const payload = raw as CaptionResponse & { error?: { message?: string } }
  if (!ok) {
    throw new Error(
      payload.error?.message || `Image caption failed with ${status}`
    )
  }

  return sanitizeCaption(payload.choices?.[0]?.message?.content ?? "")
}

async function imageUrlForModel(imageUrl: string, requestUrl: string) {
  const cleanUrl = imageUrl.trim()
  if (/^https?:\/\//i.test(cleanUrl) && !isLocalhostUrl(cleanUrl)) {
    return cleanUrl
  }

  if (cleanUrl.startsWith("/api/local-assets/")) {
    return localAssetDataUrl(cleanUrl)
  }

  const absoluteUrl = new URL(cleanUrl, requestUrl).toString()
  const absolutePath = new URL(absoluteUrl).pathname
  return isLocalhostUrl(absoluteUrl) &&
    absolutePath.startsWith("/api/local-assets/")
    ? localAssetDataUrl(absolutePath)
    : absoluteUrl
}

async function localAssetDataUrl(assetPath: string) {
  const encodedPath = assetPath.replace(/^\/api\/local-assets\/?/, "")
  const segments = encodedPath
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
  const dataRoot = path.join(process.cwd(), "data")
  const filePath = path.normalize(path.join(dataRoot, ...segments))

  if (!filePath.startsWith(dataRoot + path.sep)) {
    throw new Error("Invalid local image path")
  }

  const file = await readAssetBytes(filePath)
  return toDataUrl(file, imageMimeType(path.extname(filePath).toLowerCase()))
}

function imageMimeType(extension: string) {
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    case ".webp":
      return "image/webp"
    case ".png":
    default:
      return "image/png"
  }
}

function isLocalhostUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1"
    )
  } catch {
    return false
  }
}

function sanitizeCaption(value: string) {
  const caption = value
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!caption) {
    throw new Error("Image caption failed with empty response")
  }

  return caption
}
