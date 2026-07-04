import { NextResponse } from "next/server"

import { postizRequest } from "@/lib/postiz-client"
import { postizRouteError } from "@/lib/postiz-route"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const integrationId = searchParams.get("integrationId")?.trim()

  if (!integrationId) {
    return NextResponse.json({ error: "An integrationId is required" }, { status: 400 })
  }

  try {
    const slot = await postizRequest(`/find-slot/${encodeURIComponent(integrationId)}`)
    return NextResponse.json({ slot })
  } catch (error) {
    return postizRouteError(error)
  }
}
