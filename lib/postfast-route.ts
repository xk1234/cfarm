import { NextResponse } from "next/server"

import { PostFastApiError, PostFastConfigError } from "@/lib/postfast-client"

export function postfastRouteError(error: unknown) {
  if (error instanceof PostFastConfigError) {
    return NextResponse.json(
      { error: error.message, code: error.code, configured: false },
      { status: error.status }
    )
  }

  if (error instanceof PostFastApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, retryable: error.retryable, details: error.details },
      { status: error.status }
    )
  }

  return NextResponse.json({ error: "Unexpected PostFast error" }, { status: 500 })
}
