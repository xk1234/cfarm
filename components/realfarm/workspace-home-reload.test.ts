import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("RealFarmWorkspace initial view", () => {
  it("does not leave the home page on reload because of an existing swipe hash", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm-workspace.tsx"), "utf8")

    expect(source).toContain('const [view, setView] = useState<ViewKey>("home")')
    expect(source).toContain("const initialHash = window.location.hash")
    expect(source).toContain("let ignoredInitialHashChange = false")
    expect(source).not.toContain("\n    syncSwipeHashView()\n")
    expect(source).toContain("window.location.hash === initialHash")
    expect(source).toContain('window.addEventListener("hashchange", syncSwipeHashView)')
  })

  it("keeps the left sidebar outside the right pane scroll container", () => {
    const workspaceSource = readFileSync(path.join(process.cwd(), "components", "realfarm-workspace.tsx"), "utf8")
    const navigationSource = readFileSync(path.join(process.cwd(), "components", "realfarm", "navigation.tsx"), "utf8")

    expect(workspaceSource).toContain('className="h-svh overflow-hidden bg-[#f6f6f2] text-[#242421]"')
    expect(workspaceSource).toContain('className="flex h-svh"')
    expect(workspaceSource).toContain('className="min-w-0 flex-1 overflow-y-auto px-5 py-5 lg:px-7"')
    expect(navigationSource).toContain("hidden h-svh w-[214px] shrink-0 overflow-y-auto")
  })
})
