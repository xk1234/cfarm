import { NextResponse } from "next/server"

import { postfastRequest } from "@/lib/postfast-client"
import { postfastRouteError } from "@/lib/postfast-route"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const integrations = await postfastRequest(
      "/social-media/my-social-accounts"
    )
    return NextResponse.json({ integrations, configured: true })
  } catch (error) {
    return postfastRouteError(error)
  }
}
