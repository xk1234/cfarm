import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("Realfarm navigation", () => {
  it("does not expose a creators tab", () => {
    const navigationSource = readFileSync(path.join(process.cwd(), "components", "realfarm", "navigation.tsx"), "utf8")
    const workspaceSource = readFileSync(path.join(process.cwd(), "components", "realfarm-workspace.tsx"), "utf8")

    expect(navigationSource).not.toContain('"creators"')
    expect(navigationSource).not.toContain('label: "Creators"')
    expect(workspaceSource).not.toContain("CreatorsView")
    expect(workspaceSource).not.toContain('view === "creators"')
  })
})
