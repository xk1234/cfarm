import "server-only"

import {
  getCurrentUser,
  getUserPreferences,
  updateUserPreferences,
} from "@/lib/auth"
import {
  normalizeInfluLabCollections,
  type InfluLabCollectionsResponse,
} from "@/lib/influlab-collections"
import { systemOwnerId } from "@/lib/system-owner-context"

export type InfluLabConnection = {
  baseUrl: string
  accessToken: string
  accountEmail: string
  connectedAt: string
}

export function normalizeInfluLabBaseUrl(value: string) {
  const url = new URL(value.trim())
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("InfluLab URL must use http or https.")
  }
  if (url.username || url.password) {
    throw new Error("InfluLab URL cannot contain credentials.")
  }
  url.pathname = ""
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/$/, "")
}

export async function getInfluLabConnection(ownerId: string) {
  const preferences = await getUserPreferences(ownerId)
  const value = preferences.influlabConnection
  if (!value || typeof value !== "object") return null
  const connection = value as Partial<InfluLabConnection>
  if (!connection.baseUrl || !connection.accessToken) return null
  return {
    baseUrl: normalizeInfluLabBaseUrl(connection.baseUrl),
    accessToken: connection.accessToken,
    accountEmail: connection.accountEmail ?? "",
    connectedAt: connection.connectedAt ?? "",
  } satisfies InfluLabConnection
}

export async function connectInfluLabAccount(input: {
  ownerId: string
  baseUrl: string
  accessToken: string
  fetchImpl?: typeof fetch
}) {
  const baseUrl = normalizeInfluLabBaseUrl(input.baseUrl)
  const accessToken = input.accessToken.trim()
  if (!accessToken) throw new Error("InfluLab access token is required.")
  const remote = await fetchInfluLabCollections(
    { baseUrl, accessToken },
    input.fetchImpl
  )
  const connection: InfluLabConnection = {
    baseUrl,
    accessToken,
    accountEmail: remote.accountEmail,
    connectedAt: new Date().toISOString(),
  }
  await updateUserPreferences(input.ownerId, { influlabConnection: connection })
  return { connection, collections: remote.collections }
}

export async function disconnectInfluLabAccount(ownerId: string) {
  await updateUserPreferences(ownerId, { influlabConnection: null })
}

export async function listCurrentInfluLabCollections() {
  const ownerId = await currentDataOwnerId()
  if (!ownerId) return []
  const connection = await getInfluLabConnection(ownerId)
  if (!connection) return []
  return (await fetchInfluLabCollections(connection)).collections
}

export async function fetchInfluLabCollections(
  connection: Pick<InfluLabConnection, "baseUrl" | "accessToken">,
  fetchImpl: typeof fetch = fetch
) {
  const response = await fetchImpl(
    `${normalizeInfluLabBaseUrl(connection.baseUrl)}/api/integrations/lumenclip/collections`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${connection.accessToken}` },
      signal: AbortSignal.timeout(12_000),
    }
  )
  const payload = (await response.json().catch(() => null)) as
    InfluLabCollectionsResponse | { error?: string } | null
  if (!response.ok) {
    throw new Error(
      (payload && "error" in payload && payload.error) ||
        `InfluLab returned ${response.status}.`
    )
  }
  if (
    !payload ||
    !("account" in payload) ||
    !Array.isArray(payload.collections)
  ) {
    throw new Error("InfluLab returned an invalid collections response.")
  }
  return {
    accountEmail: String(payload.account?.email ?? ""),
    collections: normalizeInfluLabCollections(payload.collections),
  }
}

async function currentDataOwnerId() {
  const workerOwner = systemOwnerId()
  if (workerOwner) return workerOwner
  try {
    const user = await getCurrentUser()
    if (user) return user.$id
  } catch {
    // Background workers do not have a Next request context.
  }
  return process.env.LUMENCLIP_SYSTEM_OWNER_ID?.trim() || null
}
