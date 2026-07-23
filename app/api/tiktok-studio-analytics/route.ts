import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, validate, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { withSystemOwner } from "@/lib/system-owner-context"
import {
  createTikTokStudioAnalyticsImport,
  createTikTokStudioAnalyticsBatch,
  createTikTokStudioDeviceAuthorization,
  inspectTikTokStudioAnalyticsBatch,
  inspectTikTokStudioAnalyticsImport,
} from "@/lib/tiktok-studio-analytics"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const startSchema = z.object({
  action: z.literal("start"),
  postId: z.string().trim().min(1),
})

const startBatchSchema = z.object({
  action: z.literal("start_batch"),
  integrationIds: z.array(z.string().trim().min(1)).min(1).max(50),
  mode: z.enum(["new", "recent", "all"]),
  recentDays: z.number().int().min(1).max(365).optional(),
})

export const GET = withHandler(async (request: Request) => {
  const user = await requireUser()
  const searchParams = new URL(request.url).searchParams
  const batchId = searchParams.get("batchId")?.trim()
  if (batchId) {
    const batch = await withSystemOwner(user.$id, () =>
      inspectTikTokStudioAnalyticsBatch(batchId)
    )
    return NextResponse.json({ batch })
  }
  const importId = searchParams.get("importId")?.trim()
  if (!importId) throw new ApiError(400, "importId is required")
  const record = await withSystemOwner(user.$id, () =>
    inspectTikTokStudioAnalyticsImport(importId)
  )
  return NextResponse.json({ import: record })
})

export const POST = withHandler(async (request: Request) => {
  const user = await requireUser()
  const body = await request.json().catch(() => null)
  if (body?.action === "start") {
    const input = validate(startSchema, body)
    const session = await safeAnalyticsAction(() =>
      withSystemOwner(user.$id, () =>
        createTikTokStudioAnalyticsImport({
          ownerId: user.$id,
          postId: input.postId,
        })
      )
    )
    const captureEndpoint = new URL(
      "/api/tiktok-studio-analytics/capture",
      request.url
    ).toString()
    const device = createTikTokStudioDeviceAuthorization({
      ownerId: user.$id,
    })
    return NextResponse.json({
      import: session.import,
      companion: {
        version: 3 as const,
        endpoint: captureEndpoint,
        token: device.captureToken,
        expiresAt: device.expiresAt,
      },
    })
  }
  if (body?.action === "start_batch") {
    const input = validate(startBatchSchema, body)
    const session = await safeAnalyticsAction(() =>
      withSystemOwner(user.$id, () =>
        createTikTokStudioAnalyticsBatch({
          ownerId: user.$id,
          integrationIds: input.integrationIds,
          mode: input.mode,
          recentDays: input.recentDays,
        })
      )
    )
    const captureEndpoint = new URL(
      "/api/tiktok-studio-analytics/capture",
      request.url
    ).toString()
    const device = createTikTokStudioDeviceAuthorization({
      ownerId: user.$id,
    })
    return NextResponse.json({
      batch: session.batch,
      companion: {
        version: 3 as const,
        endpoint: captureEndpoint,
        token: device.captureToken,
        expiresAt: device.expiresAt,
      },
    })
  }
  throw new ApiError(400, "action must be start or start_batch")
})

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Authentication required")
  return user
}

async function safeAnalyticsAction<T>(action: () => Promise<T>) {
  try {
    return await action()
  } catch (error) {
    throw new ApiError(
      400,
      error instanceof Error ? error.message : "TikTok Studio import failed"
    )
  }
}
