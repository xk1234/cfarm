import { getRailwayDatabase } from "../../lib/railway/database"
import { systemOwnerId } from "../../lib/system-owner-context"

export type AuthUser = {
  $id: string
  email: string
  name: string
  emailVerification: boolean
}

export type LumenClipUserPreferences = Record<string, unknown>

export async function getCurrentUser(): Promise<AuthUser | null> {
  const ownerId = systemOwnerId()
  return ownerId
    ? {
        $id: ownerId,
        email: "windmill@lumenclip.internal",
        name: "Windmill workflow",
        emailVerification: true,
      }
    : null
}

export async function getUserPreferences(
  userId: string
): Promise<LumenClipUserPreferences> {
  const sql = getRailwayDatabase()
  const [row] = await sql<
    Array<{ preferences: LumenClipUserPreferences }>
  >`SELECT preferences FROM app_users WHERE id = ${userId}`
  return row?.preferences ?? {}
}

export async function updateUserPreferences(
  userId: string,
  patch: Partial<LumenClipUserPreferences>
) {
  const current = await getUserPreferences(userId)
  const preferences = { ...current, ...patch }
  const sql = getRailwayDatabase()
  await sql`
    UPDATE app_users
    SET preferences = ${sql.json(JSON.parse(JSON.stringify(preferences)))},
        updated_at = now()
    WHERE id = ${userId}
  `
  return preferences
}
