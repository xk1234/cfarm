import { z } from "zod"

import { getCurrentUser } from "@/lib/auth"
import {
  connectInfluLabAccount,
  disconnectInfluLabAccount,
  fetchInfluLabCollections,
  getInfluLabConnection,
  normalizeInfluLabBaseUrl,
} from "@/lib/influlab"

export const dynamic = "force-dynamic"

const connectionSchema = z.object({
  baseUrl: z.string().trim().min(1).max(2048),
  accessToken: z.string().trim().min(1).max(8192),
})

export async function GET() {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Authentication required." }, { status: 401 })
  const connection = await getInfluLabConnection(user.$id)
  const defaultBaseUrl = configuredBaseUrl()
  if (!connection) {
    return Response.json({ connected: false, defaultBaseUrl })
  }
  try {
    const remote = await fetchInfluLabCollections(connection)
    return Response.json({
      connected: true,
      healthy: true,
      baseUrl: connection.baseUrl,
      accountEmail: connection.accountEmail || remote.accountEmail,
      connectedAt: connection.connectedAt,
      collectionCount: remote.collections.length,
      defaultBaseUrl,
    })
  } catch (error) {
    return Response.json({
      connected: true,
      healthy: false,
      baseUrl: connection.baseUrl,
      accountEmail: connection.accountEmail,
      connectedAt: connection.connectedAt,
      collectionCount: 0,
      error:
        error instanceof Error ? error.message : "InfluLab is unavailable.",
      defaultBaseUrl,
    })
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Authentication required." }, { status: 401 })
  const parsed = connectionSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success) {
    return Response.json(
      { error: "Enter a valid InfluLab URL and access token." },
      { status: 400 }
    )
  }
  try {
    const result = await connectInfluLabAccount({
      ownerId: user.$id,
      baseUrl: parsed.data.baseUrl,
      accessToken: parsed.data.accessToken,
    })
    return Response.json({
      connected: true,
      healthy: true,
      baseUrl: result.connection.baseUrl,
      accountEmail: result.connection.accountEmail,
      connectedAt: result.connection.connectedAt,
      collectionCount: result.collections.length,
    })
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not connect InfluLab.",
      },
      { status: 400 }
    )
  }
}

export async function DELETE() {
  const user = await getCurrentUser()
  if (!user)
    return Response.json({ error: "Authentication required." }, { status: 401 })
  await disconnectInfluLabAccount(user.$id)
  return new Response(null, { status: 204 })
}

function configuredBaseUrl() {
  const value = process.env.INFLULAB_URL?.trim()
  if (!value) return ""
  try {
    return normalizeInfluLabBaseUrl(value)
  } catch {
    return ""
  }
}
