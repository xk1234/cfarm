/**
 * Single-user access gate. LumenClip has one owner: SocialBu, Pexels and
 * Apify credentials are process-wide, so any other signed-in Clerk user would
 * act on the owner's social accounts and quotas.
 *
 * `LUMENCLIP_ALLOWED_USER_IDS` lists the Clerk user ids (`user_…`, comma
 * separated) that may use the app. When it is unset the app is open to every
 * signed-in user outside production and closed to everyone in production, so a
 * missing variable never exposes the owner's accounts. Restrict Clerk sign-ups
 * in the Clerk dashboard as well.
 *
 * Edge-safe (used by proxy.ts): no Node or server-only imports.
 */
export const ALLOWED_USER_IDS_ENV = "LUMENCLIP_ALLOWED_USER_IDS"

type Env = Record<string, string | undefined>

/** The allowlist, or null when every signed-in user is allowed (non-production, unset). */
export function allowedUserIds(env: Env = process.env): ReadonlySet<string> | null {
  const raw = env[ALLOWED_USER_IDS_ENV]?.trim()
  if (!raw) return env.NODE_ENV === "production" ? new Set() : null
  return new Set(
    raw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  )
}

/** True when the Clerk user may use this instance. */
export function isUserAllowed(clerkUserId: string | null | undefined, env: Env = process.env): boolean {
  if (!clerkUserId) return false
  const allowed = allowedUserIds(env)
  return allowed === null || allowed.has(clerkUserId)
}

export const ACCESS_DENIED_MESSAGE = "This LumenClip workspace is private to its owner."
