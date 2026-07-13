import { NextResponse } from "next/server"

import {
  getUserFromSession,
  sendEmailVerification,
  SESSION_COOKIE,
} from "@/lib/auth"

export async function POST(request: Request) {
  const session = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1)

  if (!session) {
    return NextResponse.json(
      { error: "Log in to resend the email." },
      { status: 401 }
    )
  }

  const decodedSession = decodeURIComponent(session)
  const user = await getUserFromSession(decodedSession)
  if (!user) {
    return NextResponse.json(
      { error: "Your session has expired. Log in again." },
      { status: 401 }
    )
  }
  if (user.emailVerification) {
    return NextResponse.json({ ok: true, alreadyVerified: true })
  }

  try {
    await sendEmailVerification(
      decodedSession,
      new URL("/verify-email", request.url).toString()
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "We couldn't send the email. Try again in a moment." },
      { status: 429 }
    )
  }
}
