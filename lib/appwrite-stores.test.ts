import crypto from "node:crypto"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { ownedRowIdFor, routeForStore } from "@/lib/appwrite-stores"

describe("Appwrite ownership keys", () => {
  it("namespaces the same domain record for different users", () => {
    const first = ownedRowIdFor("templates", "user-a", "automation-1", 0)
    const second = ownedRowIdFor("templates", "user-b", "automation-1", 0)

    expect(first).not.toBe(second)
    expect(first).toHaveLength(36)
    expect(second).toHaveLength(36)
  })

  it("uses canonical template table names in physical row ids", () => {
    const expected = `u${crypto
      .createHash("sha256")
      .update("templates:user-a:template-1")
      .digest("hex")
      .slice(0, 35)}`
    const retired = `u${crypto
      .createHash("sha256")
      .update("automations:user-a:template-1")
      .digest("hex")
      .slice(0, 35)}`

    expect(ownedRowIdFor("templates", "user-a", "template-1", 0)).toBe(expected)
    expect(expected).not.toBe(retired)
  })

  it("routes the shared template catalog to local Appwrite reference rows", () => {
    const rootDir = path.join(process.cwd(), "data", "starter-templates")

    expect(routeForStore(rootDir, "templates.json")).toMatchObject({
      table: "permanent_assets",
      sourceKey: "starter_template",
      public: true,
    })
    expect(routeForStore(rootDir, "example-runs.json")).toMatchObject({
      table: "permanent_assets",
      sourceKey: "starter_template_example",
      public: true,
    })
  })
})
