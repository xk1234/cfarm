import { NextResponse } from "next/server"
import { z } from "zod"

import {
  createEmailSession,
  createUser,
  sendEmailVerification,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth"

const schema = z.object({
  name: z.string().trim().min(2).max(128),
  email: z.string().trim().email().toLowerCase(),
  password: z
    .string()
    .min(8)
    .max(256)
    .regex(/[A-Za-z]/)
    .regex(/[0-9]/),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Use a valid email and a password with 8+ characters and a number.",
      },
      { status: 400 }
    )
  }
  try {
    await createUser(parsed.data)
    const session = await createEmailSession(
      parsed.data.email,
      parsed.data.password
    )
    let verificationSent = true
    try {
      await sendEmailVerification(
        session.secret,
        new URL("/verify-email", request.url).toString()
      )
    } catch {
      verificationSent = false
    }
    const response = NextResponse.json(
      { ok: true, verificationSent },
      { status: 201 }
    )
    response.cookies.set(
      SESSION_COOKIE,
      session.secret,
      sessionCookieOptions(session.expire)
    )
    return response
  } catch (error) {
    const code = (error as { code?: number }).code
    return NextResponse.json(
      {
        error:
          code === 409
            ? "An account already exists for this email."
            : "Account creation failed. Please try again.",
      },
      { status: code === 409 ? 409 : 500 }
    )
  }
}
