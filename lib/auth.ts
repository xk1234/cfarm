import "server-only"

import { cache } from "react"

import { auth, clerkClient } from "@clerk/nextjs/server"

import { getRailwayDatabase } from "@/lib/railway/database"

const userCache = new Map<string, { expiresAt: number; user: AuthUser }>()
const userCacheTtlMs = Math.max(
  30_000,
  Number(process.env.CLERK_USER_CACHE_TTL_MS ?? 5 * 60_000)
)

export type AuthUser = {
  $id: string
  email: string
  name: string
  emailVerification: boolean
}

export type LumenClipUserPreferences = Record<string, unknown> & {
  postfastDisconnectedIntegrationIds?: string[]
  influlabConnection?: {
    baseUrl: string
    accessToken: string
    accountEmail: string
    connectedAt: string
  } | null
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

function verifiedEmail(user: {
  primaryEmailAddress?: {
    verification?: { status?: string | null } | null
  } | null
}) {
  return user.primaryEmailAddress?.verification?.status === "verified"
}

async function ownerIdFor(input: {
  clerkUserId: string
  externalId: string | null
  email: string
}) {
  if (input.externalId) return input.externalId

  const sql = getRailwayDatabase()
  const [existing] = await sql<Array<{ id: string }>>`
    SELECT id FROM app_users WHERE lower(email) = ${input.email.toLowerCase()}
  `
  if (!existing) return input.clerkUserId

  const client = await clerkClient()
  await client.users
    .updateUser(input.clerkUserId, { externalId: existing.id })
    .catch(() => undefined)
  return existing.id
}

async function persistUser(user: AuthUser) {
  const sql = getRailwayDatabase()
  await sql`
    INSERT INTO app_users (
      id, email, name, email_verified, preferences
    ) VALUES (
      ${user.$id}, ${user.email.toLowerCase()}, ${user.name},
      ${user.emailVerification}, '{}'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      email = excluded.email,
      name = excluded.name,
      email_verified = excluded.email_verified,
      updated_at = now()
  `
}

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const { userId } = await auth()
  if (!userId) return null

  const cached = userCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.user

  const client = await clerkClient()
  const clerkUser = await client.users.getUser(userId)
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress
  if (!email) return null

  const user: AuthUser = {
    $id: await ownerIdFor({
      clerkUserId: clerkUser.id,
      externalId: clerkUser.externalId,
      email,
    }),
    email,
    name: userName(clerkUser),
    emailVerification: verifiedEmail(clerkUser),
  }
  await persistUser(user)
  userCache.set(userId, { user, expiresAt: Date.now() + userCacheTtlMs })
  return user
})

export async function getUserPreferences(
  userId: string
): Promise<LumenClipUserPreferences> {
  const sql = getRailwayDatabase()
  const [row] = await sql<Array<{ preferences: LumenClipUserPreferences }>>`
    SELECT preferences FROM app_users WHERE id = ${userId}
  `
  if (!row) throw Object.assign(new Error("User not found."), { code: 404 })
  return row.preferences ?? {}
}

export async function updateUserPreferences(
  userId: string,
  patch: Partial<LumenClipUserPreferences>
) {
  const sql = getRailwayDatabase()
  const [row] = await sql<Array<{ preferences: LumenClipUserPreferences }>>`
    UPDATE app_users
    SET preferences = preferences || ${sql.json(JSON.parse(JSON.stringify(patch)))},
        updated_at = now()
    WHERE id = ${userId}
    RETURNING preferences
  `
  if (!row) {
    throw Object.assign(new Error("User not found."), { code: 404 })
  }
  return row.preferences
}
