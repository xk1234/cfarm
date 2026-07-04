import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("new automation template modal", () => {
  it("uses automation template records instead of hardcoded seed templates", () => {
    const workspaceSource = readFileSync(path.join(process.cwd(), "components", "realfarm-workspace.tsx"), "utf8")

    expect(workspaceSource).toContain('"/api/automation-templates"')
    expect(workspaceSource).toContain("templates={templateAutomations}")
    expect(workspaceSource).not.toContain("templates={data.automations}")
  })

  it("shows empty states instead of placeholder templates", () => {
    const templatesSource = readFileSync(path.join(process.cwd(), "components", "realfarm", "templates.tsx"), "utf8")

    expect(templatesSource).toContain("No templates available")
    expect(templatesSource).toContain("No matching templates")
    expect(templatesSource).not.toContain("high-level skills to acquire in your 20s")
  })

  it("does not force the first template card action buttons open", () => {
    const templatesSource = readFileSync(path.join(process.cwd(), "components", "realfarm", "templates.tsx"), "utf8")

    expect(templatesSource).not.toContain("featured={index === 0}")
    expect(templatesSource).not.toContain("featured ? \"opacity-100\"")
    expect(templatesSource).toContain("opacity-0")
    expect(templatesSource).toContain("group-hover:opacity-100")
  })
})
