import { NextResponse } from "next/server"
import { z } from "zod"

import { confirmEmailVerification } from "@/lib/auth"

const schema = z.object({
  userId: z.string().min(1).max(64),
  secret: z.string().min(1).max(512),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid verification link." },
      { status: 400 }
    )
  }

  try {
    await confirmEmailVerification(parsed.data.userId, parsed.data.secret)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "This verification link is invalid or has expired." },
      { status: 400 }
    )
  }
}
