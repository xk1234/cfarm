import { NextResponse } from "next/server"
import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import { getMcpToolSettings, setMcpToolEnabled } from "@/lib/mcp/tool-access"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  toolName: z.string().trim().min(1),
  enabled: z.boolean(),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const tools = await getMcpToolSettings(user.$id)
  return NextResponse.json({ tools })
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid MCP API state." },
      { status: 400 }
    )
  }
  try {
    const tools = await setMcpToolEnabled(
      user.$id,
      parsed.data.toolName,
      parsed.data.enabled
    )
    return NextResponse.json({ tools })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update MCP API."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
