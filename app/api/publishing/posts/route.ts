import { NextResponse } from "next/server"
import { z } from "zod"

import { ApiError, validate } from "@/lib/api"
import { publishingRoute, readJson, requireWorkspace } from "@/lib/publishing/http"
import { listPostsInRange, listRenderPosts, publishRender } from "@/lib/publishing/service"

export const dynamic = "force-dynamic"

const MAX_RANGE_MS = 62 * 24 * 60 * 60 * 1000

/**
 * Posts for one render (`?renderId=…`) or, for the calendar, posts in
 * `[from, to)` joined with render titles, covers and account names.
 */
export const GET = publishingRoute(async (request) => {
  const { workspaceId } = await requireWorkspace()
  const params = new URL(request.url).searchParams
  const renderId = params.get("renderId")?.trim()
  if (renderId) return NextResponse.json({ posts: await listRenderPosts(workspaceId, renderId) })
  const from = Date.parse(params.get("from") ?? "")
  const to = Date.parse(params.get("to") ?? "")
  if (!Number.isFinite(from) || !Number.isFinite(to)) throw new ApiError(400, "renderId, or from and to, is required")
  if (to <= from) throw new ApiError(400, "to must be after from")
  if (to - from > MAX_RANGE_MS) throw new ApiError(400, "The range can span at most 62 days")
  const range = { from: new Date(from).toISOString(), to: new Date(to).toISOString() }
  return NextResponse.json({ posts: await listPostsInRange(workspaceId, range) })
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
