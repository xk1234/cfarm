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
    const analytics = await postizRequest(`/analytics/${encodeURIComponent(integrationId)}`, {
      query: {
        date: searchParams.get("days") ?? 30,
      },
    })
    return NextResponse.json({ analytics })
  } catch (error) {
    return postizRouteError(error)
  }
}
