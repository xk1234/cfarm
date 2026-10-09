import { describe, expect, it } from "vitest"

import {
  compositionPrompt,
  publishGateContent,
  publishGateMedia,
} from "@/lib/content-composition"
import type { ContentOutput } from "@/lib/content-outputs"

const output = (value: Partial<ContentOutput>): ContentOutput => ({
  id: "output-1",
  templateId: "template-1",
  kind: "text",
  status: "draft",
  title: "A title",
  text: "Generated text",
  media: [],
  createdAt: "2026-08-06T00:00:00.000Z",
  updatedAt: "2026-08-06T00:00:00.000Z",
  ...value,
})

describe("content composition", () => {
  it("turns outputs into processor context", () => {
    expect(compositionPrompt([output({})])).toContain("Input 1 (text)")
    expect(compositionPrompt([output({})])).toContain("Generated text")
  })

  it("creates publish copy only at the gate", () => {
    expect(
      publishGateContent([output({})], {
        caption: "Caption",
        description: "Description",
        hashtags: ["#astrology", "zodiac"],
      })
    ).toBe("Caption\n\nDescription\n\nGenerated text\n\n#astrology #zodiac")
  })

  it("combines composable media in output order", () => {
    expect(
      publishGateMedia([
        output({
          kind: "slideshow",
          media: [
            { kind: "image", url: "/second.jpg", order: 2 },
            { kind: "image", url: "/first.jpg", order: 1 },
          ],
        }),
      ]).map((item) => item.url)
    ).toEqual(["/first.jpg", "/second.jpg"])
  })
})
