import { describe, expect, it } from "vitest"

import { allowedUserIds, isUserAllowed } from "./owner-access"

describe("owner access gate", () => {
  it("allows only listed Clerk users when the allowlist is set", () => {
    const env = { NODE_ENV: "production", LUMENCLIP_ALLOWED_USER_IDS: " user_owner , user_backup " }
    expect(isUserAllowed("user_owner", env)).toBe(true)
    expect(isUserAllowed("user_backup", env)).toBe(true)
    expect(isUserAllowed("user_stranger", env)).toBe(false)
    expect(isUserAllowed(null, env)).toBe(false)
  })

  it("fails closed in production when the allowlist is missing", () => {
    expect(allowedUserIds({ NODE_ENV: "production" })?.size).toBe(0)
    expect(isUserAllowed("user_owner", { NODE_ENV: "production" })).toBe(false)
  })

  it("stays open outside production when unset", () => {
    expect(allowedUserIds({ NODE_ENV: "development" })).toBeNull()
    expect(isUserAllowed("user_any", { NODE_ENV: "test" })).toBe(true)
  })
})
