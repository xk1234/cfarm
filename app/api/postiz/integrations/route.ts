import { NextResponse } from "next/server"

import { postizRequest } from "@/lib/postiz-client"
import { postizRouteError } from "@/lib/postiz-route"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  try {
    const integrations = await postizRequest("/integrations", {
      query: {
        group: searchParams.get("group") ?? undefined,
      },
    })
    return NextResponse.json({ integrations, configured: true })
  } catch (error) {
    return postizRouteError(error)
  }
}
