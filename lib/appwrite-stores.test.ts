import { describe, expect, it } from "vitest"

import { ownedRowIdFor, PUBLIC_STORE_TABLES } from "@/lib/appwrite-stores"

describe("Appwrite ownership keys", () => {
  it("namespaces the same domain record for different users", () => {
    const first = ownedRowIdFor("automations", "user-a", "automation-1", 0)
    const second = ownedRowIdFor("automations", "user-b", "automation-1", 0)

    expect(first).not.toBe(second)
    expect(first).toHaveLength(36)
    expect(second).toHaveLength(36)
  })

  it("keeps only template catalogs public", () => {
    expect(PUBLIC_STORE_TABLES).toEqual(
      new Set(["automation_templates", "automation_template_runs"])
    )
    expect(PUBLIC_STORE_TABLES.has("automations")).toBe(false)
    expect(PUBLIC_STORE_TABLES.has("swipes")).toBe(false)
    expect(PUBLIC_STORE_TABLES.has("results")).toBe(false)
  })
})
