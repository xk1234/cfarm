import "server-only"

import { ApiError } from "@/lib/api"
import { getCurrentUser } from "@/lib/auth"

/**
 * Workspace of the signed-in Clerk user (single-user workspaces: the
 * workspace id is the user id). Throws ApiError(401) when signed out, which
 * `withHandler` turns into a 401 response.
 */
export async function requireWorkspaceId(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) throw new ApiError(401, "Authentication required")
  return user.$id
}
