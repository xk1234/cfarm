import { describe, expect, it } from "vitest"

import {
  renderHref,
  workspaceLocationFromUrl,
  workspaceViewHref,
} from "./workspace-navigation"

describe("workspace navigation", () => {
  it.each([
    ["home", "/app"],
    ["new", "/app/new"],
    ["schedule", "/app?view=schedule"],
    ["collections", "/app/collections"],
  ] as const)("maps %s to its shareable URL", (view, href) => {
    expect(workspaceViewHref(view)).toBe(href)
  })

  it("restores tabs, render details and collection details from browser history URLs", () => {
    expect(workspaceLocationFromUrl("/app", "?view=schedule")).toEqual({
      view: "schedule",
    })
    expect(workspaceLocationFromUrl("/app/new")).toEqual({ view: "new" })
    expect(workspaceLocationFromUrl(renderHref("rnd 1"))).toEqual({
      view: "render",
      renderId: "rnd 1",
    })
    expect(workspaceLocationFromUrl("/app/collections")).toEqual({
      view: "collections",
    })
    expect(
      workspaceLocationFromUrl("/app/collections/mystical%20pictures")
    ).toEqual({
      view: "collections",
      collectionId: "mystical pictures",
    })
  })

  it("falls back to home for unknown or removed workspace URLs", () => {
    expect(workspaceLocationFromUrl("/app", "?view=unknown")).toEqual({
      view: "home",
    })
    expect(workspaceLocationFromUrl("/app", "?view=templates")).toEqual({
      view: "home",
    })
    expect(workspaceLocationFromUrl("/app", "?view=render")).toEqual({
      view: "home",
    })
    expect(workspaceLocationFromUrl("/app/analytics")).toEqual({
      view: "home",
    })
  })
})
