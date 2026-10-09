import { NextResponse } from "next/server"

import { publishingRoute, requireWorkspace } from "@/lib/publishing/http"
import { getPublishingStatus } from "@/lib/publishing/service"

export const dynamic = "force-dynamic"

/** `{ configured: true, provider }` or `{ configured: false, message: "SocialBu not connected" }`. */
export const GET = publishingRoute(async () => {
  await requireWorkspace()
  return NextResponse.json({ status: getPublishingStatus() })
})
