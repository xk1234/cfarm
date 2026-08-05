import { describe, expect, it } from "vitest"

import {
  selectSlideshowHook,
  slideshowHookSourcePrompt,
} from "@/lib/slideshow-generation-engine"

describe("LumenLab hook content", () => {
  it("keeps analyzed direction and content attached to hook selection", () => {
    const selection = selectSlideshowHook({
      hookItems: [
        {
          id: "hook-1",
          text: "Why your videos feel generic",
          contentDirection: "Explain the specificity gap.",
          content: "Compare vague advice with a concrete scene.",
        },
      ],
      wordCollections: [],
      now: new Date("2026-08-02T00:00:00.000Z"),
      selectIndex: () => 0,
    })

    expect(selection.contentDirection).toBe("Explain the specificity gap.")
    expect(slideshowHookSourcePrompt(selection)).toContain(
      "Compare vague advice with a concrete scene."
    )
  })
})
