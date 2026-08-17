import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const responsiveSurfaces = [
  "app/app/compose/compose-demo.tsx",
  "app/app/ugc/[id]/page.tsx",
  "components/realfarm/home-view.tsx",
  "components/realfarm/automations-view.tsx",
  "components/realfarm/collections-view.tsx",
  "components/realfarm/collections/collection-detail-view.tsx",
  "components/realfarm/content-calendar/content-calendar-view.tsx",
  "components/realfarm/analytics/analytics-view.tsx",
  "components/realfarm/analytics/post-analytics-page.tsx",
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
      path.join(process.cwd(), "components/realfarm-workspace.tsx"),
      "utf8"
    )

    expect(source).toContain("h-dvh")
    expect(source).toContain("w-full min-w-0 flex-1")
  })
})
