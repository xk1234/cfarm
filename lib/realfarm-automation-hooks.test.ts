import { describe, expect, it } from "vitest"

import {
  automationHookId,
  automationHookItems,
  automationHooks,
  defaultAutomationSchema,
  schemaWithAutomationHookItems,
} from "@/lib/realfarm-automation"

function schema() {
  return defaultAutomationSchema({
    id: "1",
    name: "Hook demo",
    status: "live",
    account: "",
    handle: "",
    times: [],
    theme: "",
    socialIntegrations: [],
    favorite: false,
    automationKind: "slideshow",
  })
}

describe("automation hook catalog", () => {
  it("uses only the canonical hook catalog", () => {
    const value = schema()
    delete (value as Partial<typeof value>).hooks
    value.prompt_formatting.narrative = "First hook\n2. Second hook"

    expect(automationHookItems(value)).toEqual([])
  })

  it("keeps disabled hooks in the catalog but removes them from selection", () => {
    const value = schemaWithAutomationHookItems(schema(), [
      {
        id: "enabled",
        text: "Eligible hook",
        enabled: true,
        createdAt: "2026-07-18T00:00:00.000Z",
      },
      {
        id: "disabled",
        text: "Retired hook",
        enabled: false,
        createdAt: "2026-07-18T00:00:00.000Z",
      },
    ])

    expect(automationHookItems(value)).toHaveLength(2)
    expect(automationHooks(value)).toEqual(["Eligible hook"])
  })

  it("does not use formatting or narrative text as hooks", () => {
    const value = schema()
    value.formatting = value.formatting.map((section) =>
      section.id === "hook"
        ? {
            ...section,
            textItems: [
              { ...section.textItems[0], contentDirection: "Old legacy hook" },
            ],
          }
        : section
    )
    value.hooks = []
    value.prompt_formatting.narrative = "Narrative direction"

    expect(automationHookItems(value)).toEqual([])
    expect(automationHooks(value)).toEqual([])
  })

  it("updates hooks without overwriting narrative direction", () => {
    const value = schema()
    value.prompt_formatting.narrative = "Keep this narrative direction"

    const updated = schemaWithAutomationHookItems(value, [
      {
        id: automationHookId("A canonical hook"),
        text: "A canonical hook",
        enabled: true,
        createdAt: "2026-07-18T00:00:00.000Z",
      },
    ])

    expect(updated.prompt_formatting.narrative).toBe(
      "Keep this narrative direction"
    )
  })
})
