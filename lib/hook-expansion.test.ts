import { describe, expect, it } from "vitest"

import { expandHook } from "@/lib/hook-expansion"
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
