import { NextResponse } from "next/server"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import {
  inviteWorkspaceMember,
  listWorkspaceMembers,
} from "@/lib/workspace-members"

export async function GET() {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ members: await listWorkspaceMembers(user.$id) })
}

const schema = z.object({ email: z.string().trim().email().toLowerCase() })

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 })
  if (parsed.data.email === user.email.toLowerCase())
    return NextResponse.json(
      { error: "You are already the workspace owner." },
      { status: 400 }
    )
  try {
    const member = await inviteWorkspaceMember({
      owner: user,
      email: parsed.data.email,
      redirectUrl: new URL("/team-invite", request.url).toString(),
    })
    return NextResponse.json({ member }, { status: 201 })
  } catch (error) {
    const code = (error as { code?: number }).code
    return NextResponse.json(
      {
        error:
          code === 409
            ? "This person has already been invited."
            : "Invitation could not be sent.",
      },
      { status: code === 409 ? 409 : 500 }
    )
  }
}
