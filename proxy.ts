import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"

import { internalToolsEnabled } from "@/lib/internal-tools"

const INTERNAL_PATH_PREFIXES = ["/debug", "/api/debug"] as const

const PUBLIC_API_PATHS = [
  "/api/search",
  "/api/telegram/webhook",
  "/api/tiktok-studio-analytics/capture",
  "/api/tiktok-studio-analytics/cloud-sync",
  "/api/v1/health",
  "/api/v1/openapi.json",
] as const

function isPublicApi(pathname: string) {
  return (
    PUBLIC_API_PATHS.includes(pathname as (typeof PUBLIC_API_PATHS)[number]) ||
    pathname.startsWith("/api/public/")
  )
}

function isAuthPage(pathname: string) {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/sign-up" ||
    pathname.startsWith("/sign-up/")
  )
}

function isProtectedPage(pathname: string) {
  return (
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/debug" ||
    pathname.startsWith("/debug/")
  )
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
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

  const pathname = request.nextUrl.pathname

  if (pathname.startsWith("/__clerk/") || isPublicApi(pathname)) {
    return NextResponse.next()
  }

  const { userId } = await auth()

  if (userId) {
    if (isAuthPage(pathname)) {
      return NextResponse.redirect(new URL("/app", request.url))
    }
    return NextResponse.next()
  }

  if (
    isAuthPage(pathname) ||
    (!isProtectedPage(pathname) && !pathname.startsWith("/api/"))
  ) {
    return NextResponse.next()
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    )
  }

  const login = new URL("/login", request.url)
  login.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(login)
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
}
