import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  ownedRowIdFor,
  PUBLIC_STORE_TABLES,
  routeForStore,
} from "@/lib/appwrite-stores"

describe("Appwrite ownership keys", () => {
  it("namespaces the same domain record for different users", () => {
    const first = ownedRowIdFor("automations", "user-a", "automation-1", 0)
    const second = ownedRowIdFor("automations", "user-b", "automation-1", 0)

    expect(first).not.toBe(second)
    expect(first).toHaveLength(36)
    expect(second).toHaveLength(36)
  })

  it("does not expose user-owned store tables as public", () => {
    expect(PUBLIC_STORE_TABLES).toEqual(new Set())
    expect(PUBLIC_STORE_TABLES.has("automations")).toBe(false)
    expect(PUBLIC_STORE_TABLES.has("results")).toBe(false)
  })

  it("routes the shared template catalog to local Appwrite reference rows", () => {
    const rootDir = path.join(process.cwd(), "data", "automation-templates")

    expect(routeForStore(rootDir, "templates.json")).toMatchObject({
      table: "permanent_assets",
      sourceKey: "automation_template",
      public: true,
    })
    expect(routeForStore(rootDir, "example-runs.json")).toMatchObject({
      table: "permanent_assets",
      sourceKey: "automation_template_example",
      public: true,
    })
  })
})
