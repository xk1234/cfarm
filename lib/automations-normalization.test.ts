import { describe, expect, it } from "vitest"

import { normalizeReelfarmAutomation } from "@/lib/automations"

describe("automation record normalization", () => {
  it("treats the retired draft status as unknown", () => {
    expect(
      normalizeReelfarmAutomation({
        id: "retired-draft",
        name: "Retired draft",
        status: "draft",
      }).status
    ).toBe("unknown")
  })
})
