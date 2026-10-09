import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, validate } from "@/lib/api"
import { publishingRoute, readJson, requireWorkspace } from "@/lib/publishing/http"
import { listRenderPosts, publishRender } from "@/lib/publishing/service"

export const dynamic = "force-dynamic"

/** Posts for one render: `GET /api/publishing/posts?renderId=…`. */
export const GET = publishingRoute(async (request) => {
  const { workspaceId } = await requireWorkspace()
  const renderId = new URL(request.url).searchParams.get("renderId")?.trim()
  if (!renderId) throw new ApiError(400, "renderId is required")
  return NextResponse.json({ posts: await listRenderPosts(workspaceId, renderId) })
})

const PublishBody = z.object({
  renderId: z.string().trim().min(1).max(64),
  accountIds: z.array(z.string().trim().min(1).max(64)).min(1).max(20),
  caption: z.string().max(10_000).default(""),
  /** ISO 8601 with offset; omitted/null = publish now. */
  publishAt: z.string().datetime({ offset: true }).nullish(),
  /** SocialBu `options` keyed by provider, e.g. `{ tiktok: { privacy_status: "SELF_ONLY" } }`. */
  platformOptions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  idempotencyKey: z.string().trim().min(1).max(128).nullish(),
})

/**
 * Publishes or schedules a finished render to SocialBu accounts: uploads the
 * rendered slides, creates one SocialBu post per account, stores `posts` rows.
 */
export const POST = publishingRoute(async (request) => {
  const { workspaceId, userId } = await requireWorkspace()
  const body = validate(PublishBody, await readJson(request))
  const result = await publishRender(workspaceId, {
    renderId: body.renderId,
    accountIds: body.accountIds,
    caption: body.caption,
    publishAt: body.publishAt ?? null,
    platformOptions: body.platformOptions,
    idempotencyKey: body.idempotencyKey ?? null,
    createdBy: userId,
  })
  return NextResponse.json(result, { status: 201 })
})
