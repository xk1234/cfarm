import { NextResponse } from "next/server"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import { acceptWorkspaceInvitation } from "@/lib/workspace-members"

const schema = z.object({
  inviteToken: z.string().min(1).max(128),
})

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json(
      { error: "Log in or create an account first." },
      { status: 401 }
    )
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid invitation link." },
      { status: 400 }
    )
  try {
    await acceptWorkspaceInvitation({ ...parsed.data, user })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "This invitation is invalid or has expired." },
      { status: 400 }
    )
  }
}
