import { NextResponse } from "next/server"
import { z } from "zod"

import {
  upsertMetricSnapshot,
  type PostFastMetricSnapshot,
} from "@/lib/postfast-metric-snapshots"
import { withSystemOwner } from "@/lib/system-owner-context"
import {
  authorizeTikTokStudioCloudSync,
  tiktokStudioCloudOwnerId,
} from "@/lib/tiktok-studio-cloud-sync"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const snapshotSchema = z
  .object({
    id: z.string().trim().min(1),
    postId: z.string().trim().min(1),
    platformPostId: z.string().trim().min(1).optional(),
    integrationId: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    capturedAt: z.string().datetime({ offset: true }),
    metrics: z.record(z.string(), z.number()),
    latestMetric: z.record(z.string(), z.unknown()),
    rawMetrics: z.record(z.string(), z.number()),
    observedKeys: z.array(z.string()),
    source: z.literal("tiktok_studio"),
    tiktokStudio: z.object({}).passthrough(),
  })
  .passthrough()

const requestSchema = z.object({ snapshot: snapshotSchema })

export async function POST(request: Request) {
  try {
    if (!authorizeTikTokStudioCloudSync(request.headers.get("authorization"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const ownerId = tiktokStudioCloudOwnerId()
    if (!ownerId) {
      return NextResponse.json(
        { error: "Cloud analytics owner is not configured" },
        { status: 503 }
      )
    }
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null)
    )
    if (!parsed.success) {
      return NextResponse.json(
        { error: "A valid TikTok Studio snapshot is required" },
        { status: 400 }
      )
    }
    const snapshot = await withSystemOwner(ownerId, () =>
      upsertMetricSnapshot(
        parsed.data.snapshot as unknown as PostFastMetricSnapshot
      )
    )
    return NextResponse.json({ synced: true, snapshotId: snapshot.id })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Cloud analytics sync failed",
      },
      { status: 500 }
    )
  }
}
