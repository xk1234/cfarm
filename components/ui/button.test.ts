import { describe, expect, it } from "vitest"

import { buttonVariants } from "./button"

describe("buttonVariants", () => {
  it("exposes app-specific action and control variants", () => {
    expect(buttonVariants({ variant: "action", size: "appDefault" })).toContain("bg-app-action")
    expect(buttonVariants({ variant: "blueAction", size: "appDefault" })).toContain("bg-app-blue-action")
    expect(buttonVariants({ variant: "softControl", size: "appDefault" })).toContain("border-app-panel-border")
    expect(buttonVariants({ variant: "iconControl", size: "icon-control" })).toContain("text-app-muted-text")
  })

  it("exposes app-specific button sizes", () => {
    expect(buttonVariants({ variant: "action", size: "largeAction" })).toContain("h-12")
    expect(buttonVariants({ variant: "action", size: "dialogAction" })).toContain("h-14")
    expect(buttonVariants({ variant: "softControl", size: "compact" })).toContain("h-8")
  })
})
