import { describe, expect, it } from "vitest"

import {
  automationToneSelection,
  schemaWithAutomationTone,
  type AutomationSchema,
} from "@/lib/realfarm-automation"

function schema(value: string, preset: string) {
  return {
    tone: { value, preset },
  } as unknown as AutomationSchema
}

describe("automation tone presets", () => {
  it("recognizes named tones even when legacy data incorrectly says custom", () => {
    expect(automationToneSelection(schema("Witty & Relatable", "custom"))).toBe(
      "Witty & Relatable"
    )
  })

  it("uses a stored preset when its value contains the full prompt", () => {
    expect(
      automationToneSelection(
        schema("A long detailed conversational prompt", "conversational")
      )
    ).toBe("Conversational & Relatable")
  })

  it("persists preset selections without marking them custom", () => {
    const updated = schemaWithAutomationTone(
      schema("old prompt", "custom"),
      "Practical & Aspirational"
    )
    expect(updated.tone).toMatchObject({
      value: "Practical & Aspirational",
      preset: "practical_aspirational",
    })
  })
})
