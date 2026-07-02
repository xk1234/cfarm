import { NextResponse } from "next/server"

import { updateImageCollectionCaptions, type StoredImageCollection } from "@/lib/image-collections"

export const dynamic = "force-dynamic"

type CaptionResponse = {
  choices?: {
    message?: {
      content?: string
    }
  }[]
}

export async function POST(request: Request) {
  try {
    const collection = (await request.json()) as StoredImageCollection
    const apiKey = process.env.OPENROUTER_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: "Missing OPENROUTER_API_KEY" }, { status: 500 })
    }

    const captionedImages = await Promise.all(
      collection.images.map(async (image) => {
        if (image.caption?.trim()) {
          return image
        }

        return {
          ...image,
          caption: await captionImage(image.image_link, apiKey),
        }
      })
    )

    const nextCollection: StoredImageCollection = {
      name: collection.name,
      created_at: collection.created_at,
      images: captionedImages,
    }

    const saved = await updateImageCollectionCaptions(nextCollection)
    return NextResponse.json({ collection: saved })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to caption collection images" },
      { status: 500 }
    )
  }
}

async function captionImage(imageUrl: string, apiKey: string) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "CFarm Image Captioner",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
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
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as CaptionResponse & { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(payload.error?.message || `Image caption failed with ${response.status}`)
  }

  return sanitizeCaption(payload.choices?.[0]?.message?.content ?? "")
}

function sanitizeCaption(value: string) {
  return value
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
