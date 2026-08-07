import { NextResponse } from "next/server"

import { createTikTokCommentCollectionForDevice } from "@/lib/tiktok-comment-device"
import { captureDeviceOwnerId } from "@/lib/tiktok-studio-analytics"
import { withSystemOwner } from "@/lib/system-owner-context"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"))
    const ownerId = captureDeviceOwnerId(token)
    const body = (await request.json().catch(() => null)) as {
      platformPostId?: unknown
    } | null
    const result = await withSystemOwner(ownerId, () =>
      createTikTokCommentCollectionForDevice({
        ownerId,
        platformPostId:
          typeof body?.platformPostId === "string" ? body.platformPostId : "",
      })
    )
    return json({
      collection: result.collection,
      companion: {
        version: 1 as const,
        endpoint: new URL(
          "/api/tiktok-comments/capture",
          request.url
        ).toString(),
        token: result.token,
        expiresAt: result.collection.expiresAt,
      },
    })
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Comment collection could not be started",
      },
      400
    )
  }
}

function bearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) throw new Error("Pair the TikTok companion first")
  return match[1]
}

function json(value: object, status = 200) {
  return NextResponse.json(value, { status, headers: corsHeaders })
}
