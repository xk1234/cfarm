import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  const appApiKey = process.env.APP_API_KEY
  const hostname = request.nextUrl.hostname

  if (!appApiKey) {
    if (isLocalhost(hostname)) {
      return NextResponse.next()
    }

    return unauthorized()
  }

  if (request.headers.get("x-api-key") === appApiKey) {
    return NextResponse.next()
  }

  const cronSecret = process.env.CRON_SECRET
  if (
    cronSecret &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`
  ) {
    return NextResponse.next()
  }

  return unauthorized()
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1"
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

// Production browser clients must provision APP_API_KEY and update lib/client-api.ts
// to send it with same-origin API requests.
export const config = {
  matcher: "/api/:path*",
}
