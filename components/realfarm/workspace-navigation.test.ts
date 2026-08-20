import { describe, expect, it } from "vitest"

import {
  legacyWorkspaceViewHref,
  workspaceLocationFromUrl,
  workspaceViewHref,
} from "./workspace-navigation"

describe("workspace navigation", () => {
  it.each([
    ["home", "/app"],
    ["compose", "/app/compose"],
    ["schedule", "/app/schedule"],
    ["analytics", "/app/analytics"],
    ["collections", "/app/collections"],
    ["templates", "/app/templates"],
  ] as const)("maps %s to its shareable URL", (view, href) => {
    expect(workspaceViewHref(view)).toBe(href)
  })

  it("redirects legacy view URLs and preserves template deep links", () => {
    expect(legacyWorkspaceViewHref({ view: "schedule" })).toBe("/app/schedule")
    expect(
      legacyWorkspaceViewHref({
        view: "templates",
        templateId: "template & one",
        runId: "run/one",
      })
    ).toBe("/app/templates?template=template+%26+one&run=run%2Fone")
    expect(legacyWorkspaceViewHref({ view: "home" })).toBeNull()
    expect(legacyWorkspaceViewHref({ view: "removed" })).toBeNull()
  })

  it("restores tabs and collection details from browser history URLs", () => {
    expect(workspaceLocationFromUrl("/app", "?view=schedule")).toEqual({
      view: "schedule",
    })
    expect(workspaceLocationFromUrl("/app/schedule")).toEqual({
      view: "schedule",
    })
    expect(workspaceLocationFromUrl("/app/analytics")).toEqual({
      view: "analytics",
    })
    expect(workspaceLocationFromUrl("/app/social-templates")).toEqual({
      view: "templates",
    })
    expect(workspaceLocationFromUrl("/app/templates")).toEqual({
      view: "templates",
    })
    expect(workspaceLocationFromUrl("/app", "?view=templates")).toEqual({
      view: "templates",
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
    expect(workspaceLocationFromUrl("/app", "?view=viral-tracker")).toEqual({
      view: "home",
    })
  })
})
