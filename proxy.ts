import { NextResponse, type NextRequest } from "next/server"

import { getUserFromSession, SESSION_COOKIE } from "@/lib/auth"

export async function proxy(request: NextRequest) {
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
  matcher: ["/login", "/app/:path*", "/api/((?!auth/).*)"],
}
