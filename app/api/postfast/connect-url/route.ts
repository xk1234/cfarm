import { NextResponse } from "next/server"

import { normalizePostFastConnectUrl, postfastRequest } from "@/lib/postfast-client"
import { postfastRouteError } from "@/lib/postfast-route"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const expiryDays = Number(searchParams.get("expiryDays") ?? 7)

  try {
    const result = await postfastRequest("/social-media/connect-link", {
      body: {
        expiryDays: Number.isFinite(expiryDays)
          ? Math.max(1, Math.min(30, Math.round(expiryDays)))
          : 7,
        sendEmail: false,
      },
    })
    const url = normalizePostFastConnectUrl(result)
    if (!url) {
      return NextResponse.json({ error: "PostFast did not return a connect URL" }, { status: 502 })
    }
    return NextResponse.json({ url })
  } catch (error) {
    return postfastRouteError(error)
  }
}
