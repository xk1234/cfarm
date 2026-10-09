import { NextResponse } from "next/server"

import { revokeWorkspaceApiKey } from "@/lib/api-keys"
import { getCurrentUser } from "@/lib/auth"
import { DataNotFoundError, getRepositories } from "@/lib/data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Revokes a key; it stops authenticating immediately. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  try {
    await revokeWorkspaceApiKey(getRepositories(), user.$id, id)
  } catch (error) {
    if (error instanceof DataNotFoundError) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 })
    }
    throw error
  }
  return new NextResponse(null, { status: 204 })
}
