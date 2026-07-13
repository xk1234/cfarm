import { describe, expect, it } from "vitest"

import {
  expandAllHookCombinations,
  expandHook,
} from "@/lib/hook-expansion"
import type { WordCollectionRecord } from "@/lib/word-collections"

describe("expandHook", () => {
  it("expands brace and double-bracket hook slots with stable substitutions", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("zodiac", ["aries", "taurus", "gemini"]),
      wordCollection("charm", ["bracelet", "jade ring"]),
    ]

    expect(
      expandHook(
        "POV: you're a [[zodiac]] and someone gifts you a {charm}",
        {
          zodiac: "zodiac",
          charm: "charm",
        },
        collections,
        () => 0.6
      )
    ).toEqual({
      text: "POV: you're a Taurus and someone gifts you a jade ring",
      template: "POV: you're a [[zodiac]] and someone gifts you a {charm}",
      substitutions: {
        zodiac: "Taurus",
        charm: "jade ring",
      },
    })
  })

  it("leaves unknown slots visible so bad automation config is obvious", () => {
    expect(expandHook("hello [[missing]]", {}, [], () => 0)).toEqual({
      text: "hello [[missing]]",
      template: "hello [[missing]]",
      substitutions: {},
    })
  })

  it("uses a same-name word collection when no explicit slot mapping is saved", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("test", ["first value", "second value"]),
    ]

    expect(
      expandHook("try [[test]] today", undefined, collections, () => 1)
    ).toEqual({
      text: "try second value today",
      template: "try [[test]] today",
      substitutions: {
        test: "second value",
      },
    })
  })

  it("corrects a/an before vowel-starting slot substitutions and title-cases proper slots", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("zodiac", ["aries"]),
      wordCollection("occasion", ["birthday"]),
    ]

    expect(
      expandHook(
        "POV: you're a [[zodiac]] planning a [[occasion]]",
        {
          zodiac: "zodiac",
          occasion: "occasion",
        },
        collections,
        () => 0
      )
    ).toMatchObject({
      text: "POV: you're an Aries planning a birthday",
      substitutions: {
        zodiac: "Aries",
        occasion: "birthday",
      },
    })
  })

  it("does not append a second s to pluralized slot values already ending in s", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("zodiac", ["aries", "pisces"]),
    ]

    expect(
      expandHook("[[zodiac]]s are loyal", { zodiac: "zodiac" }, collections, () => 0)
        .text
    ).toBe("Aries are loyal")
    expect(
      expandAllHookCombinations(
        "[[zodiac]]s are loyal",
        { zodiac: "zodiac" },
        collections
      ).map((item) => item.text)
    ).toEqual(["Aries are loyal", "Pisces are loyal"])
  })

  it("enumerates every possible multi-slot hook combination exactly once", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("occasion", ["wedding", "birthday"]),
      wordCollection("style", ["minimal", "colorful"]),
    ]

    const combinations = expandAllHookCombinations(
      "a [[style]] setup for a [[occasion]]",
      { style: "style", occasion: "occasion" },
      collections
    )

    expect(combinations.map((item) => item.text)).toEqual([
      "a minimal setup for a wedding",
      "a minimal setup for a birthday",
      "a colorful setup for a wedding",
      "a colorful setup for a birthday",
    ])
    expect(new Set(combinations.map((item) => item.text)).size).toBe(4)
  })
})

function wordCollection(id: string, words: string[]): WordCollectionRecord {
  return {
    id,
    name: id,
    words,
    source: "manual",
    created_at: "2026-07-07T00:00:00.000Z",
    updated_at: "2026-07-07T00:00:00.000Z",
  }
}
