import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

import { internalToolsEnabled } from "@/lib/internal-tools"

const INTERNAL_PATH_PREFIXES = ["/debug", "/api/debug"] as const

function isPublicApi(pathname: string) {
  return (
    pathname === "/api/search" ||
    pathname.startsWith("/api/public/") ||
    pathname === "/api/telegram/webhook" ||
    pathname === "/api/tiktok-comments/capture" ||
    pathname === "/api/tiktok-comments/device" ||
    pathname === "/api/tiktok-studio-analytics/capture" ||
    pathname === "/api/tiktok-studio-analytics/cloud-sync"
  )
}

export default clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname

  if (
    !internalToolsEnabled() &&
    INTERNAL_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    )
  ) {
    return new NextResponse(null, { status: 404 })
  }

  if (isPublicApi(pathname)) return NextResponse.next()

  const protectedPage =
    pathname === "/app" ||
    pathname.startsWith("/app/") ||
    pathname === "/debug" ||
    pathname.startsWith("/debug/")
  const protectedApi = pathname.startsWith("/api/")
  if (!protectedPage && !protectedApi) return NextResponse.next()

  const { userId } = await auth()
  if (userId) return NextResponse.next()

  if (protectedApi) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    )
  }

  const entry = new URL("/", request.url)
  entry.searchParams.set("auth", "sign-in")
  entry.searchParams.set("next", `${pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(entry)
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
}
