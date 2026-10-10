/**
 * Local end-to-end auth seam. Clerk is an external identity provider, so the
 * Playwright suite cannot sign in through it. When, and only when, all of
 * these hold, requests are treated as signed in as `LUMENCLIP_E2E_USER_ID`:
 *
 * - `NODE_ENV !== "production"` (never in a production build or deploy),
 * - `LUMENCLIP_DATA_BACKEND === "memory"` (never against Appwrite data),
 * - `LUMENCLIP_E2E_USER_ID` is set.
 *
 * Edge-safe (used by proxy.ts): no Node or server-only imports.
 */
type Env = Record<string, string | undefined>

export const E2E_USER_ID_ENV = "LUMENCLIP_E2E_USER_ID"

/** The e2e user id when the seam is active, otherwise null. */
export function e2eAuthUserId(env: Env = process.env): string | null {
  if (env.NODE_ENV === "production") return null
  if (env.LUMENCLIP_DATA_BACKEND?.trim().toLowerCase() !== "memory") return null
  const id = env[E2E_USER_ID_ENV]?.trim()
  return id ? id : null
}

export function isE2eAuthEnabled(env: Env = process.env): boolean {
  return e2eAuthUserId(env) !== null
}

export type E2eUser = { id: string; email: string; name: string }

/** The signed-in identity the seam presents (null when the seam is off). */
export function e2eUser(env: Env = process.env): E2eUser | null {
  const id = e2eAuthUserId(env)
  if (!id) return null
  return { id, email: `${id}@e2e.lumenclip.test`, name: "E2E Owner" }
}
