import { NextResponse } from "next/server"

import { PostFastApiError, PostFastConfigError } from "@/lib/postfast-client"
import { SocialBuApiError, SocialBuConfigError } from "@/lib/socialbu-client"

export function postfastRouteError(error: unknown) {
  if (error instanceof PostFastConfigError || error instanceof SocialBuConfigError) {
    return NextResponse.json(
      { error: error.message, code: error.code, configured: false },
      { status: error.status }
    )
  }

  if (error instanceof PostFastApiError || error instanceof SocialBuApiError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        retryable: error.retryable,
        details: error.details,
      },
      { status: error.status }
    )
  }

  return NextResponse.json(
    { error: "Unexpected publishing provider error" },
    { status: 500 }
  )
}
