import { NextResponse } from "next/server"

import {
  normalizePostFastConnectUrl,
  postfastRequest,
} from "@/lib/postfast-client"
import {
  normalizeSocialBuConnectUrl,
  socialbuRequest,
} from "@/lib/socialbu-client"
import { postfastRouteError } from "@/lib/postfast-route"
import { activePublishingProvider } from "@/lib/social/publishing-provider"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  try {
    if (activePublishingProvider() === "socialbu") {
      const provider = (searchParams.get("provider") ?? "").trim()
      if (!provider) {
        return NextResponse.json(
          { error: "A provider is required to connect a SocialBu account" },
          { status: 400 }
        )
      }
      const result = await socialbuRequest("/accounts", { body: { provider } })
      const url = normalizeSocialBuConnectUrl(result)
      if (!url) {
        return NextResponse.json(
          { error: "SocialBu did not return a connect URL" },
          { status: 502 }
        )
      }
      return NextResponse.json({ url })
    }

    const expiryDays = Number(searchParams.get("expiryDays") ?? 7)
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
      return NextResponse.json(
        { error: "PostFast did not return a connect URL" },
        { status: 502 }
      )
    }
    return NextResponse.json({ url })
  } catch (error) {
    return postfastRouteError(error)
  }
}
