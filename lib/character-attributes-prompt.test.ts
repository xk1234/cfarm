import { describe, expect, it } from "vitest"

import { buildCharacterAttributesPrompt } from "@/lib/character-attributes-prompt"

describe("character attributes prompt builder", () => {
  it("builds the messages from the character and source image config", () => {
    const messages = buildCharacterAttributesPrompt({
      name: "  Jade  ",
      sourceImageDataUrl: "data:image/png;base64,aW1hZ2U=",
      currentAttributes: {
        age: 27,
        gender: "female",
      },
    })
    const userContent = messages[1].content as Array<{
      type: string
      text?: string
      image_url?: { url: string }
    }>

    expect(messages[0].content).toContain(
      "Extract a UGC character attribute JSON object"
    )
    expect(userContent[0].text).toContain("Preferred name: Jade.")
    expect(userContent[0].text).toContain(
      'Existing attributes to preserve only when not contradicted by the image: {"age":27,"gender":"female"}'
    )
    expect(userContent[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,aW1hZ2U=" },
    })
  })
})
