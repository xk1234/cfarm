import { NextResponse, type NextRequest } from "next/server"

import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"
import { internalToolsEnabled } from "@/lib/internal-tools"

const INTERNAL_PATH_PREFIXES = [
  "/debug",
  "/api/debug",
  "/api/temp/testing-center",
] as const

export async function proxy(request: NextRequest) {
  if (
    !internalToolsEnabled() &&
    INTERNAL_PATH_PREFIXES.some(
      (prefix) =>
        request.nextUrl.pathname === prefix ||
        request.nextUrl.pathname.startsWith(`${prefix}/`)
    )
  ) {
    return new NextResponse(null, { status: 404 })
  }

  if (
    request.nextUrl.pathname === "/api/search" ||
    request.nextUrl.pathname === "/api/telegram/webhook"
  ) {
    return NextResponse.next()
  }

  const user = await getUserFromSession(
    request.cookies.get(SESSION_COOKIE)?.value
  )
  if (user) {
    if (request.nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/app", request.url))
    }
    return NextResponse.next()
  }

  if (request.nextUrl.pathname === "/login") {
    return NextResponse.next()
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    )
  }

  const login = new URL("/login", request.url)
  login.searchParams.set("next", request.nextUrl.pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ["/login", "/app/:path*", "/debug/:path*", "/api/((?!auth/).*)"],
}
