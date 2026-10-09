import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const root = process.cwd()

describe("Clerk auth migration", () => {
  it("does not restore removed Appwrite auth surfaces", () => {
    const removedPaths = [
      "app/api/auth/login/route.ts",
      "app/api/auth/logout/route.ts",
      "app/api/auth/register/route.ts",
      "app/api/auth/recovery/request/route.ts",
      "app/api/auth/recovery/confirm/route.ts",
      "app/api/auth/verification/confirm/route.ts",
      "app/api/auth/verification/resend/route.ts",
      "app/reset-password/page.tsx",
      "app/verify-email/page.tsx",
      "components/auth-form.tsx",
      "components/password-reset-card.tsx",
      "components/email-verification-card.tsx",
    ]

    for (const file of removedPaths) {
      expect(existsSync(path.join(root, file)), file).toBe(false)
    }
  })

  it("keeps credential and session handling out of the Appwrite adapter", () => {
    const source = readFileSync(path.join(root, "lib/auth.ts"), "utf8")

    expect(source).not.toContain("node-appwrite")
    expect(source).not.toMatch(/APPWRITE_/)
    expect(source).not.toMatch(/\bAccount\b/)
    expect(source).not.toMatch(/SESSION_COOKIE|lumenclip-session/)
    expect(source).not.toMatch(
      /createEmailPasswordSession|createRecovery|createEmailVerification/
    )
  })

  it("keeps a one-time user and preference importer for the cutover", () => {
    const migration = path.join(
      root,
      "scripts/migrate-appwrite-users-to-clerk.mts"
    )
    expect(existsSync(migration)).toBe(true)
    const source = readFileSync(migration, "utf8")
    expect(source).toContain("external_id: sourceUser.$id")
    expect(source).toContain("lumenclipPreferences: sourceUser.prefs")
  })
})
