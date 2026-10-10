import "server-only"

import { cache } from "react"

import { auth, clerkClient } from "@clerk/nextjs/server"

import { e2eUser } from "@/lib/e2e-auth"
import { isUserAllowed } from "@/lib/owner-access"

export type AuthUser = {
  $id: string
  email: string
  name: string
}

export type LumenClipUserPreferences = Record<string, unknown> & {
  disabledMcpToolNames?: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function userName(user: {
  firstName: string | null
  lastName: string | null
  username: string | null
  primaryEmailAddress?: { emailAddress: string } | null
}) {
  return (
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.username ||
    user.primaryEmailAddress?.emailAddress.split("@")[0] ||
    "LumenClip user"
  )
}

function ownerIdFor(user: {
  id: string
  externalId: string | null
  privateMetadata: Record<string, unknown>
}) {
  const metadataOwnerId = user.privateMetadata.lumenclipOwnerId
  if (typeof metadataOwnerId === "string" && metadataOwnerId) {
    return metadataOwnerId
  }
  return user.externalId || user.id
}

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  // Local e2e seam (lib/e2e-auth.ts): never active in production or on Appwrite.
  const testUser = e2eUser()
  if (testUser) return { $id: testUser.id, email: testUser.email, name: testUser.name }
  const { userId } = await auth()
  if (!userId) return null
  // Single-user instance: other Clerk users get no workspace (lib/owner-access.ts).
  if (!isUserAllowed(userId)) return null

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const email =
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses[0]?.emailAddress
  if (!email) return null

  const ownerId = ownerIdFor(user)
  if (user.privateMetadata.lumenclipOwnerId !== ownerId) {
    await client.users
      .updateUserMetadata(user.id, {
        privateMetadata: { lumenclipOwnerId: ownerId },
      })
      .catch(() => undefined)
  }

  return {
    $id: ownerId,
    email,
    name: userName(user),
  }
})

async function clerkUserForOwnerId(ownerId: string) {
  const client = await clerkClient()
  const byExternalId = await client.users.getUserList({
    externalId: [ownerId],
    limit: 1,
  })
  if (byExternalId.data[0]) return byExternalId.data[0]

  try {
    const byClerkId = await client.users.getUser(ownerId)
    return ownerIdFor(byClerkId) === ownerId ? byClerkId : null
  } catch {
    return null
  }
}

export async function getUserPreferences(
  ownerId: string
): Promise<LumenClipUserPreferences> {
  const user = await clerkUserForOwnerId(ownerId)
  const preferences = user?.privateMetadata.lumenclipPreferences
  return isRecord(preferences) ? preferences : {}
}

export async function updateUserPreferences(
  ownerId: string,
  patch: Partial<LumenClipUserPreferences>
) {
  const user = await clerkUserForOwnerId(ownerId)
  if (!user) {
    throw new Error(`No Clerk user is mapped to owner ${ownerId}`)
  }

  const client = await clerkClient()
  const current = await getUserPreferences(ownerId)
  const preferences = { ...current, ...patch }
  await client.users.updateUserMetadata(user.id, {
    privateMetadata: { lumenclipPreferences: preferences },
  })
  return preferences
}
