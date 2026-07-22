import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const src = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8")

describe("route-backed workspace features", () => {
  it("provides pages and boundaries for analytics and collections", () => {
    for (const feature of ["analytics", "collections"]) {
      expect(src(`app/app/${feature}/page.tsx`)).toContain("WorkspaceRoute")
      expect(src(`app/app/${feature}/loading.tsx`)).toContain("SkeletonBlock")
      expect(src(`app/app/${feature}/error.tsx`)).toContain("unstable_retry")
    }
  })

  it("exposes Compose as a route-backed workspace destination", () => {
    const navigation = src("components/realfarm/navigation.tsx")
    const page = src("app/app/compose/page.tsx")
    const workspace = src("components/realfarm-workspace.tsx")
    const workspaceRoute = src("components/realfarm/routes/workspace-route.tsx")

    expect(navigation).toContain('label: "Compose"')
    expect(navigation).toContain('return "/app/compose"')
    expect(page).toContain('navigation={{ view: "compose" }}')
    expect(workspace).toContain('view === "compose"')
    expect(workspaceRoute).toContain("composeAccounts={composeAccounts}")
  })

  it("uses stable URLs for collection list and detail navigation", () => {
    const workspace = src("components/realfarm-workspace.tsx")
    const navigation = src("components/realfarm/navigation.tsx")
    expect(workspace).toContain("/app/collections/${encodeURIComponent(id)}")
    expect(navigation).toContain('return "/app/analytics"')
    expect(navigation).toContain('return "/app/collections"')
    expect(src("app/app/collections/[id]/page.tsx")).toContain("collectionId: id")
  })

  it("keeps feature fetching in focused hooks", () => {
    expect(src("components/realfarm/analytics/use-analytics-data.ts")).toContain(
      '"/api/analytics/report"'
    )
    expect(
      src("components/realfarm/collections/use-collections-data.ts")
    ).toContain('"/api/image-collections"')
  })
})
