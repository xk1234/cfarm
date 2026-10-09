import { NextResponse } from "next/server"

import { ApiKeyInputError, API_KEY_SCOPES, createWorkspaceApiKey, listWorkspaceApiKeys } from "@/lib/api-keys"
import { getCurrentUser } from "@/lib/auth"
import { getRepositories } from "@/lib/data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Lists the workspace's API keys (prefix and metadata only, never secrets). */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const apiKeys = await listWorkspaceApiKeys(getRepositories(), user.$id)
  return NextResponse.json({ apiKeys, scopes: API_KEY_SCOPES })
}

/** Creates a key. The plaintext `secret` is returned once and never stored. */
export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  try {
    const created = await createWorkspaceApiKey(getRepositories(), user.$id, body ?? {}, user.$id)
    return NextResponse.json(created, { status: 201, headers: { "cache-control": "no-store" } })
  } catch (error) {
    if (error instanceof ApiKeyInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}
