import { NextResponse } from "next/server"

import { ApiError, readRouteId } from "@/lib/api"
import { publishingRoute, requireWorkspace } from "@/lib/publishing/http"
import { refreshPostStatus } from "@/lib/publishing/service"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Re-reads the post's status from SocialBu. */
export const POST = publishingRoute<Context>(async (_request, context) => {
  const { workspaceId } = await requireWorkspace()
  const id = await readRouteId(context.params)
  if (!id) throw new ApiError(400, "Post id is required")
  return NextResponse.json({ post: await refreshPostStatus(workspaceId, id) })
})
