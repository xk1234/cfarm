import type { AuthUser } from "./auth-shim"

export async function sharedOwnerIdsFor(_user: AuthUser) {
  return [] as string[]
}
