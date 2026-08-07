import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")
const read = (path: string) => readFileSync(resolve(root, path), "utf8")

describe("Clerk authentication cutover", () => {
  it("uses Clerk middleware with the auto-proxy matcher", () => {
    const source = read("proxy.ts")
    expect(source).toContain("clerkMiddleware")
    expect(source).toContain('"/__clerk/:path*"')
    expect(source).not.toContain("SESSION_COOKIE")
  })

  it("places ClerkProvider inside the root body", () => {
    const source = read("app/layout.tsx")
    expect(source.indexOf("<body")).toBeLessThan(
      source.indexOf("<ClerkProvider")
    )
    expect(source.indexOf("</ClerkProvider>")).toBeLessThan(
      source.indexOf("</body>")
    )
  })

  it("uses the current App Router and Clerk components", () => {
    expect(read("app/login/[[...login]]/page.tsx")).toContain("<SignIn")
    expect(read("app/sign-up/[[...sign-up]]/page.tsx")).toContain("<SignUp")
    expect(read("components/marketing/marketing-shell.tsx")).toContain(
      '<Show when="signed-out">'
    )
  })

  it("has no Appwrite dependency in the runtime auth modules", () => {
    expect(read("lib/auth.ts")).not.toMatch(/appwrite/i)
    expect(read("lib/workspace-members.ts")).not.toMatch(/node-appwrite|Teams/)
  })

  it("imports Railway identities into Clerk without changing owner ids", () => {
    const source = read("scripts/migrate-railway-users-to-clerk.mts")
    expect(source).toContain("FROM app_users")
    expect(source).toContain("external_id: source.id")
    expect(source).toContain("skip_password_requirement: true")
  })
})
