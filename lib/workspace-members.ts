import "server-only"

import type { AuthUser } from "@/lib/auth"

/**
 * LumenClip is single-user: the workspace id is the Clerk user id and no other
 * owner's records are ever shared into a read. Kept as the json-store seam so
 * the backend swap can drop it without touching callers.
 */
export async function sharedOwnerIdsFor(_user: AuthUser): Promise<string[]> {
  return []
}
