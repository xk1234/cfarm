import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("New automation modal data source", () => {
  it("uses automation template database state instead of hardcoded seed automations", () => {
    const workspaceSource = readFileSync(path.join(process.cwd(), "components", "realfarm-workspace.tsx"), "utf8")
    const templateSource = readFileSync(path.join(process.cwd(), "components", "realfarm", "templates.tsx"), "utf8")

    expect(workspaceSource).toContain("templates={templateAutomations}")
    expect(workspaceSource).toContain("createLocalAutomation")
    expect(workspaceSource).toContain('"/api/automation-templates"')
    expect(workspaceSource).toContain('"/api/automations"')
    expect(templateSource).toContain("templates: templateAutomations")
    expect(templateSource).toContain("return templateAutomations")
    expect(templateSource).not.toContain("return data.automations")
  })
})
