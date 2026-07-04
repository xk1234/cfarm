import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("automation delete UI", () => {
  it("wires the drawer delete button to the persisted automation delete route", () => {
    const drawerSource = readFileSync(path.join(process.cwd(), "components", "realfarm", "automation-settings.tsx"), "utf8")
    const workspaceSource = readFileSync(path.join(process.cwd(), "components", "realfarm-workspace.tsx"), "utf8")

    expect(drawerSource).toContain("onDelete")
    expect(drawerSource).toContain("Delete automation")
    expect(workspaceSource).toContain('fetchJsonWithTimeout(`/api/automations?id=${encodeURIComponent(id)}`')
    expect(workspaceSource).toContain('method: "DELETE"')
  })
})
