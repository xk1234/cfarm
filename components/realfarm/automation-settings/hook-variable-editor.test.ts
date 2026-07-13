import { describe, expect, it } from "vitest"

import {
  collectionForHookSlot,
  hookEditorSegments,
} from "./hook-variable-editor"
import type { WordCollectionRecord } from "@/lib/word-collections"

const collections: WordCollectionRecord[] = [
  {
    id: "singapore_areas",
    name: "singapore_areas",
    words: ["Clementi", "Woodlands"],
    source: "manual",
    created_at: "2026-07-12T00:00:00.000Z",
    updated_at: "2026-07-12T00:00:00.000Z",
  },
]

describe("hook variable editor", () => {
  it("separates both supported variable syntaxes from ordinary hook text", () => {
    expect(
      hookEditorSegments("best [[singapore_areas]] deals in {month}")
    ).toEqual([
      { text: "best " },
      { text: "[[singapore_areas]]", slot: "singapore_areas" },
      { text: " deals in " },
      { text: "{month}", slot: "month" },
    ])
  })

  it("resolves same-name and explicitly mapped collections", () => {
    expect(
      collectionForHookSlot({
        slot: "singapore_areas",
        collections,
      })?.words
    ).toEqual(["Clementi", "Woodlands"])
    expect(
      collectionForHookSlot({
        slot: "area",
        hookSlots: { area: "singapore_areas" },
        collections,
      })?.id
    ).toBe("singapore_areas")
  })
})
