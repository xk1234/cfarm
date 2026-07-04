import { NextResponse } from "next/server"

import { PostizApiError, PostizConfigError } from "@/lib/postiz-client"

export function postizRouteError(error: unknown) {
  if (error instanceof PostizConfigError) {
    return NextResponse.json(
      { error: error.message, code: error.code, configured: false },
      { status: error.status }
    )
  }

  if (error instanceof PostizApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, retryable: error.retryable, details: error.details },
      { status: error.status }
    )
  }

  return NextResponse.json({ error: "Unexpected Postiz error" }, { status: 500 })
}
