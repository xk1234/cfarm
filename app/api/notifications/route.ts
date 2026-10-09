import { NextResponse } from "next/server"

import { listNotifications } from "@/lib/notifications"
import { publishingRoute, requireWorkspace } from "@/lib/publishing/http"

export const dynamic = "force-dynamic"

/** In-app inbox: `GET /api/notifications?cursor=&limit=&unread=1`. */
export const GET = publishingRoute(async (request) => {
  const { workspaceId } = await requireWorkspace()
  const params = new URL(request.url).searchParams
  const limit = Number(params.get("limit"))
  const inbox = await listNotifications(workspaceId, {
    cursor: params.get("cursor"),
    limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
    unreadOnly: params.get("unread") === "1" || params.get("unread") === "true",
  })
  return NextResponse.json(inbox)
})
