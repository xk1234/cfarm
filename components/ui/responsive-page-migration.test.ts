import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const responsiveSurfaces = [
  "features/composer/ui/composer-screen.tsx",
  "app/app/ugc/[id]/page.tsx",
  "components/realfarm/automations-view.tsx",
  "features/collections/ui/collections-view.tsx",
  "features/collections/ui/collection-detail-view.tsx",
  "features/analytics/ui/post-analytics-page.tsx",
] as const

describe("responsive page migration", () => {
  it.each(responsiveSurfaces)(
    "uses the shared responsive shell in %s",
    (file) => {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8")

      expect(source).toContain("ResponsivePage")
    }
  )

  it("uses dynamic viewport units in the workspace shell", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "features/workspace/ui/workspace-shell.tsx"),
      "utf8"
    )

    expect(source).toContain("h-svh")
    expect(source).toContain("min-w-0 flex-1")
  })
})
