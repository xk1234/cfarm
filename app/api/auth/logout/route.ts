import { NextResponse } from "next/server"

import {
  deleteCurrentSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth"

export async function POST(request: Request) {
  const session = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)
  if (session)
    await deleteCurrentSession(decodeURIComponent(session)).catch(
      () => undefined
    )
  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions(),
    maxAge: 0,
  })
  return response
}
