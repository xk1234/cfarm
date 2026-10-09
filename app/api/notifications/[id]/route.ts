import { NextResponse } from "next/server"

import { ApiError, readRouteId } from "@/lib/api"
import { getRepositories } from "@/lib/data"
import { publishingRoute, requireWorkspace } from "@/lib/publishing/http"

export const dynamic = "force-dynamic"

type Context = { params: Promise<{ id: string }> }

/** Marks one notification as read. */
export const PATCH = publishingRoute<Context>(async (_request, context) => {
  const { workspaceId } = await requireWorkspace()
  const id = await readRouteId(context.params)
  if (!id) throw new ApiError(400, "Notification id is required")
  const repos = getRepositories()
  const notification = await repos.notifications.markRead(workspaceId, id)
  return NextResponse.json({ notification, unreadCount: await repos.notifications.unreadCount(workspaceId) })
})
