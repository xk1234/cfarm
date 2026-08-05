import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, validate, withHandler } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"
import { listAnalyticsIntegrations } from "@/lib/postfast-analytics"
import { withSystemOwner } from "@/lib/system-owner-context"
import {
  createTikTokStudioAnalyticsImport,
  createTikTokStudioAnalyticsBatch,
  createTikTokStudioAnalyticsDiscoveredBatch,
  createTikTokStudioAnalyticsSeedBatch,
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

const startSeedBatchSchema = z.object({
  action: z.literal("start_seed_batch"),
  integrationId: z.string().trim().min(1),
  postReferences: z.string().trim().min(1).max(10_000),
})

const startDiscoveredBatchSchema = z.object({
  action: z.literal("start_discovered_batch"),
  integrationId: z.string().trim().min(1),
  posts: z
    .array(
      z.object({
        externalPostId: z
          .string()
          .trim()
          .regex(/^\d{10,25}$/),
        releaseUrl: z.string().url().max(2_000),
        content: z.string().max(10_000).optional(),
        publishedAt: z.string().datetime({ offset: true }).optional(),
      })
    )
    .min(1)
    .max(1_000),
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
  if (body?.action === "start_seed_batch") {
    const input = validate(startSeedBatchSchema, body)
    const session = await safeAnalyticsAction(() =>
      withSystemOwner(user.$id, async () => {
        const integration = (await listAnalyticsIntegrations()).find(
          (candidate) =>
            candidate.integration_id === input.integrationId &&
            candidate.provider.toLowerCase().startsWith("tiktok")
        )
        if (!integration) throw new Error("Choose a connected TikTok account")
        return createTikTokStudioAnalyticsSeedBatch({
          ownerId: user.$id,
          integrationId: integration.integration_id,
          postReferences: input.postReferences,
        })
      })
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
  if (body?.action === "start_discovered_batch") {
    const input = validate(startDiscoveredBatchSchema, body)
    const session = await safeAnalyticsAction(() =>
      withSystemOwner(user.$id, async () => {
        const integration = (await listAnalyticsIntegrations()).find(
          (candidate) =>
            candidate.integration_id === input.integrationId &&
            candidate.provider.toLowerCase().startsWith("tiktok")
        )
        if (!integration) throw new Error("Choose a connected TikTok account")
        return createTikTokStudioAnalyticsDiscoveredBatch({
          ownerId: user.$id,
          integrationId: integration.integration_id,
          posts: input.posts,
        })
      })
    )
    return NextResponse.json({
      batch: session.batch,
      companion: companionConfig(request.url, user.$id),
    })
  }
  throw new ApiError(400, "Unknown TikTok Studio analytics action")
})

function companionConfig(requestUrl: string, ownerId: string) {
  const device = createTikTokStudioDeviceAuthorization({ ownerId })
  return {
    version: 3 as const,
    endpoint: new URL(
      "/api/tiktok-studio-analytics/capture",
      requestUrl
    ).toString(),
    token: device.captureToken,
    expiresAt: device.expiresAt,
  }
}

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
