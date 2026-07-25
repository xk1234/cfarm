import { NextResponse } from "next/server"
import { z } from "zod"

import { sendPasswordRecovery } from "@/lib/auth"

const schema = z.object({
  email: z.string().trim().email().toLowerCase(),
})

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 })
  }

  try {
    await sendPasswordRecovery(
      parsed.data.email,
      new URL("/reset-password", request.url).toString()
    )
  } catch {
    // Deliberately not surfaced. Reporting "no such account" here would turn
    // this route into an account-existence oracle, which the login route
    // already avoids by returning one generic message.
  }

  return NextResponse.json({ ok: true })
}
