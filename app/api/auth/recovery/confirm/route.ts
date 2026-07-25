import { NextResponse } from "next/server"
import { z } from "zod"

import { confirmPasswordRecovery } from "@/lib/auth"

// Mirrors the register route's rule: 8+ characters with at least one letter and
// one digit, so a recovery cannot set a weaker password than signup allows.
const schema = z.object({
  userId: z.string().min(1).max(64),
  secret: z.string().min(1).max(512),
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
      { error: "Use a password with 8+ characters and a number." },
      { status: 400 }
    )
  }

  try {
    await confirmPasswordRecovery(
      parsed.data.userId,
      parsed.data.secret,
      parsed.data.password
    )
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 }
    )
  }
}
