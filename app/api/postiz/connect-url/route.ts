import { NextResponse } from "next/server"

import { postizRequest } from "@/lib/postiz-client"
import { postizRouteError } from "@/lib/postiz-route"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get("provider")?.trim()

  if (!provider) {
    return NextResponse.json({ error: "A provider is required" }, { status: 400 })
  }

  try {
    const result = await postizRequest(`/social/${encodeURIComponent(provider)}`, {
      query: {
        refresh: searchParams.get("refresh") ?? undefined,
      },
    })
    return NextResponse.json({ result })
  } catch (error) {
    return postizRouteError(error)
  }
}
