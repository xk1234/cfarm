import { NextResponse } from "next/server"

import { withSystemOwner } from "@/lib/system-owner-context"
import {
  captureOwnerId,
  getTikTokStudioCaptureManifest,
  ingestTikTokStudioAnalyticsCapture,
} from "@/lib/tiktok-studio-analytics"
import { syncTikTokStudioSnapshotToCloud } from "@/lib/tiktok-studio-cloud-sync"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"))
    const ownerId = captureOwnerId(token)
    const manifest = await withSystemOwner(ownerId, () =>
      getTikTokStudioCaptureManifest(token)
    )
    return json(manifest)
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Analytics manifest failed",
      },
      401
    )
  }
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request.headers.get("authorization"))
    const contentLength = Number(request.headers.get("content-length") || 0)
    if (contentLength > 2_500_000) {
      return json({ error: "Capture payload is too large" }, 413)
    }
    const text = await request.text()
    if (Buffer.byteLength(text, "utf8") > 2_500_000) {
      return json({ error: "Capture payload is too large" }, 413)
    }
    const body = JSON.parse(text) as {
      captureId?: unknown
      studioUrl?: unknown
      payload?: unknown
    }
    if (typeof body.studioUrl !== "string" || body.payload === undefined) {
      return json({ error: "studioUrl and payload are required" }, 400)
    }
    const ownerId = captureOwnerId(token)
    const result = await withSystemOwner(ownerId, () =>
      ingestTikTokStudioAnalyticsCapture({
        token,
        captureId:
          typeof body.captureId === "string" ? body.captureId : undefined,
        studioUrl: body.studioUrl as string,
        payload: body.payload,
        payloadBytes: Buffer.byteLength(text, "utf8"),
      })
    )
    const cloudSync =
      "snapshot" in result && result.snapshot
        ? await syncTikTokStudioSnapshotToCloud({
            snapshot: result.snapshot,
            requestUrl: request.url,
          })
        : { synced: false as const }
    return json({
      accepted: result.accepted,
      importId: result.import.id,
      status: result.import.status,
      capturedSections: result.import.capturedSections,
      autoLinked:
        ("autoLinked" in result ? result.autoLinked : undefined) ??
        result.import.status === "linked",
      snapshotId:
        "snapshot" in result ? result.snapshot?.id : undefined,
      cloudSynced: cloudSync.synced,
    })
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Analytics capture failed",
      },
      401
    )
  }
}

function bearerToken(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) throw new Error("Capture token is required")
  return match[1]
}

function json(value: object, status = 200) {
  return NextResponse.json(value, { status, headers: corsHeaders })
}
