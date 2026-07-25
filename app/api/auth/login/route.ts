import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createEmailSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth"

const schema = z.object({
  email: z.string().trim().email().toLowerCase(),
  password: z.string().min(8).max(256),
})

// Appwrite's own discriminator for "the credentials are wrong". Anything else
// is an infrastructure fault.
const INVALID_CREDENTIAL_TYPES = new Set([
  "user_invalid_credentials",
  "user_not_found",
  "user_blocked",
])

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email and password." },
      { status: 400 }
    )
  }
  try {
    const session = await createEmailSession(
      parsed.data.email,
      parsed.data.password
    )
    const response = NextResponse.json({ ok: true })
    response.cookies.set(
      SESSION_COOKIE,
      session.secret,
      sessionCookieOptions(session.expire)
    )
    return response
  } catch (error) {
    const failure = error as { type?: string; code?: number; message?: string }

    if (failure.type && INVALID_CREDENTIAL_TYPES.has(failure.type)) {
      return NextResponse.json(
        { error: "Email or password is incorrect." },
        { status: 401 }
      )
    }

    if (failure.code === 429) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Wait a few minutes and retry." },
        { status: 429 }
      )
    }

    // Configuration, connectivity, or an unregistered platform. Reporting these
    // as a bad password sends people to reset a password that was never the
    // problem, so surface them as a service fault and log the real cause.
    console.error("login failed", {
      type: failure.type,
      code: failure.code,
      message: failure.message,
    })
    return NextResponse.json(
      {
        error: "Sign-in is temporarily unavailable. This is not your password.",
        reason: failure.type || "unknown",
      },
      { status: 503 }
    )
  }
}
