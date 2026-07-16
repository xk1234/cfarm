import { describe, expect, it } from "vitest"

import { buildHeadshotPrompt } from "@/lib/character-headshot-prompt"
import { defaultCharacterAttributes } from "@/lib/character-model"

describe("character headshot prompt builder", () => {
  it("builds the prompt from the character config and custom direction", () => {
    const prompt = buildHeadshotPrompt({
      name: "Maya",
      attributes: {
        ...defaultCharacterAttributes,
        name: "Old name",
        age: 29,
        hair: {
          ...defaultCharacterAttributes.hair,
          color: "auburn",
        },
      },
      customPrompt: "  warm UGC creator headshot  ",
    })

    expect(prompt).toContain(
      "Generate a photorealistic AI UGC character headshot"
    )
    expect(prompt).toContain('"name": "Maya"')
    expect(prompt).not.toContain('"name": "Old name"')
    expect(prompt).toContain('"age": 29')
    expect(prompt).toContain('"color": "auburn"')
    expect(prompt).toContain("Custom prompt: warm UGC creator headshot")
  })

  it("uses the original default custom prompt when none is provided", () => {
    const prompt = buildHeadshotPrompt({
      name: "Maya",
      attributes: defaultCharacterAttributes,
    })

    expect(prompt).toContain(
      "Custom prompt: professional neutral headshot, white background, passport-style crop but natural UGC realism."
    )
  })
})
