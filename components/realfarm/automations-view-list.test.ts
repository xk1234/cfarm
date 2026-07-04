import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("automations list view", () => {
  it("uses persisted runs for previews and wires status actions", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "automations-view.tsx"), "utf8")
    const workspaceSource = readFileSync(path.join(process.cwd(), "components", "realfarm-workspace.tsx"), "utf8")

    expect(source).toContain("recentRunsByAutomationId")
    expect(source).toContain("No recent generations")
    expect(source).toContain("text-center")
    expect(source).toContain("backgroundImage: `url(${imageUrl})`")
    expect(source).toContain("onToggleStatus")
    expect(source).toContain("Resume")
    expect(source).toContain("grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3")
    expect(source).toContain("col-span-full")
    expect(source).toContain("AutomationGridCard")
    expect(source).not.toContain("IconFilter")
    expect(source).not.toContain(">Filter<")
    expect(source).not.toContain("AutomationThumb")
    expect(source).not.toContain("AutomationListItem")
    expect(source).not.toContain("space-y-3")
    expect(source).not.toContain("md:grid-cols-[172px_1fr_auto]")
    expect(source).not.toContain("Create New")
    expect(workspaceSource).toContain("/api/automations/runs?limit=100")
    expect(workspaceSource).toContain("toggleAutomationStatus")
    expect(workspaceSource).toContain("status: nextStatus")
  })
})
