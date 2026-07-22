import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const workspaceSource = readFileSync(
  path.join(process.cwd(), "components/realfarm-workspace.tsx"),
  "utf8"
)
const workspacePageSource = readFileSync(
  path.join(
    process.cwd(),
    "components/realfarm/routes/workspace-route.tsx"
  ),
  "utf8"
)
const collectionsHookSource = readFileSync(
  path.join(
    process.cwd(),
    "components/realfarm/collections/use-collections-data.ts"
  ),
  "utf8"
)

describe("workspace feature boundaries", () => {
  it("lazy-loads heavyweight workspace views and modals", () => {
    expect(workspaceSource).toContain('import dynamic from "next/dynamic"')

    for (const modulePath of [
      "analytics/analytics-view",
      "content-calendar/content-calendar-view",
      "collections-view",
      "automations-view",
      "automation-settings",
      "x-automation-studio",
      "social-account-picker",
      "user-settings-modal",
    ]) {
      expect(workspaceSource).toContain(
        `import("@/components/${
          modulePath === "x-automation-studio"
            ? modulePath
            : `realfarm/${modulePath}`
        }")`
      )
    }
  })

  it("keeps analytics and grid libraries out of the workspace shell", () => {
    expect(workspaceSource).not.toContain('from "recharts"')
    expect(workspaceSource).not.toContain('from "ag-grid-react"')
    expect(workspaceSource).not.toContain('from "luxon"')
  })

  it("defers feature data until the corresponding workspace view opens", () => {
    expect(workspacePageSource).toContain(
      "loadRealFarmData({ mediaAssets: [] })"
    )
    expect(workspaceSource).toContain('"/api/media-library"')
    expect(workspaceSource).toContain('view !== "automations"')
    expect(collectionsHookSource).toContain('"/api/image-collections"')
    expect(workspaceSource).toContain("workspaceAssetsLoaded")
    expect(collectionsHookSource).toContain("productCollectionsLoaded")
  })
})
