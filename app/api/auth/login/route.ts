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
  } catch {
    return NextResponse.json(
      { error: "Email or password is incorrect." },
      { status: 401 }
    )
  }
}
