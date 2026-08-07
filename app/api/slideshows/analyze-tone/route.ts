import { NextResponse } from "next/server"

import {
  analyzeSlideshowTone,
  slideshowToneToAutomationFields,
  transcribeTikTokSlideshow,
} from "@/lib/slideshow-tone-analysis"
import { normalizeTikTokSlideshowUrls } from "@/lib/tiktok-slideshow-transcription"

export const dynamic = "force-dynamic"
// Scraping the slideshow and transcribing its slides both happen inline. A
// measured real scrape took over 45s, so this needs the long end of the
// platform budget.
export const maxDuration = 300

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    url?: unknown
  } | null
  const url = typeof payload?.url === "string" ? payload.url.trim() : ""
  if (!url) {
    return NextResponse.json(
      { error: "A public TikTok slideshow URL is required" },
      { status: 400 }
    )
  }

  try {
    normalizeTikTokSlideshowUrls([url])
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Use a public TikTok /photo/ slideshow URL",
      },
      { status: 400 }
    )
  }

  let transcript: Awaited<ReturnType<typeof transcribeTikTokSlideshow>>
  try {
    transcript = await transcribeTikTokSlideshow(url)
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The TikTok slideshow could not be fetched",
      },
      { status: 404 }
    )
  }
  if (!transcript) {
    return NextResponse.json(
      { error: "The TikTok slideshow could not be found" },
      { status: 404 }
    )
  }

  const warning = transcript.transcriptionFallback
    ? "OpenRouter is not configured. Slide 1 uses the post caption and remaining slides are blank; this is not a full transcription."
    : undefined

  try {
    const analysis = await analyzeSlideshowTone(transcript)
    return NextResponse.json({
      transcript,
      analysis,
      suggestedFields: slideshowToneToAutomationFields(analysis),
      ...(warning ? { warning } : {}),
    })
  } catch {
    return NextResponse.json(
      {
        error: "The slideshow tone model is temporarily unavailable",
        transcript,
        ...(warning ? { warning } : {}),
      },
      { status: 503 }
    )
  }
}
