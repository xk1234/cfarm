import { NextResponse } from "next/server"

import { getRepositories } from "@/lib/data"
import { publishingRoute, requireWorkspace } from "@/lib/publishing/http"

export const dynamic = "force-dynamic"

/** Marks every delivered notification as read. */
export const POST = publishingRoute(async () => {
  const { workspaceId } = await requireWorkspace()
  const marked = await getRepositories().notifications.markAllRead(workspaceId)
  return NextResponse.json({ marked, unreadCount: 0 })
})
