import { NextResponse } from "next/server"

import { withSystemOwner } from "@/lib/system-owner-context"
import {
  getTikTokCommentCompanionManifest,
  ingestTikTokComments,
  recordTikTokCommentSendResults,
  tiktokCommentCaptureOwnerId,
} from "@/lib/tiktok-comments"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
}
const MAX_BYTES = 2_500_000

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"))
    const ownerId = tiktokCommentCaptureOwnerId(token)
    const manifest = await withSystemOwner(ownerId, () =>
      getTikTokCommentCompanionManifest(token)
    )
    return json(manifest)
  } catch (error) {
    return json({ error: message(error, "Comment manifest failed") }, 401)
  }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"))
    if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) {
      return json({ error: "Capture payload is too large" }, 413)
    }
    const text = await request.text()
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) {
      return json({ error: "Capture payload is too large" }, 413)
    }
    const body = JSON.parse(text)
    const ownerId = tiktokCommentCaptureOwnerId(token)
    const result = await withSystemOwner(ownerId, async () => {
      const sendResults = Array.isArray(body.sendResults)
        ? await recordTikTokCommentSendResults({
            collectionId: String(body.collectionId || ""),
            results: body.sendResults,
          })
        : []
      const capture =
        Array.isArray(body.comments) && !Array.isArray(body.sendResults)
          ? await ingestTikTokComments({
              token,
              collectionId: String(body.collectionId || ""),
              postId: String(body.postId || ""),
              comments: body.comments,
              complete: body.complete,
              error: typeof body.error === "string" ? body.error : undefined,
            })
          : { accepted: 0, collection: undefined }
      return { ...capture, sendResults }
    })
    return json({
      accepted: result.accepted,
      collection: result.collection,
      sendResults: result.sendResults,
    })
  } catch (error) {
    return json({ error: message(error, "Comment capture failed") }, 401)
  }
}

function bearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) throw new Error("Capture token is required")
  return match[1]
}
function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}
function json(value: object, status = 200) {
  return NextResponse.json(value, { status, headers: corsHeaders })
}
