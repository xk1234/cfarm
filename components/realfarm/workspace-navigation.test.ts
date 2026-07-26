import { describe, expect, it } from "vitest"

import {
  workspaceLocationFromUrl,
  workspaceViewHref,
} from "./workspace-navigation"

describe("workspace navigation", () => {
  it.each([
    ["home", "/app"],
    ["compose", "/app/compose"],
    ["schedule", "/app?view=schedule"],
    ["analytics", "/app/analytics"],
    ["collections", "/app/collections"],
    ["automations", "/app?view=automations"],
  ] as const)("maps %s to its shareable URL", (view, href) => {
    expect(workspaceViewHref(view)).toBe(href)
  })

  it("restores tabs and collection details from browser history URLs", () => {
    expect(workspaceLocationFromUrl("/app", "?view=schedule")).toEqual({
      view: "schedule",
    })
    expect(workspaceLocationFromUrl("/app/analytics")).toEqual({
      view: "analytics",
    })
    expect(
      workspaceLocationFromUrl("/app/collections/mystical%20pictures")
    ).toEqual({
      view: "collections",
      collectionId: "mystical pictures",
    })
  })

  it("falls back to home for unknown workspace URLs", () => {
    expect(workspaceLocationFromUrl("/app", "?view=unknown")).toEqual({
      view: "home",
    })
  })
})
