import { describe, expect, it } from "vitest"

import { expandAllHookCombinations, expandHook } from "@/lib/hook-expansion"
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

  it("resolves capitalized slots against lowercase collections without a slot map", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("month", ["January", "February"]),
      wordCollection("number", ["3", "5"]),
    ]

    expect(
      expandHook(
        "[[Number]] things about [[Month]]",
        undefined,
        collections,
        () => 0
      )
    ).toEqual({
      text: "3 things about January",
      template: "[[Number]] things about [[Month]]",
      substitutions: {
        Number: "3",
        Month: "January",
      },
    })
  })

  it("draws different values for a repeated variable when noDuplicates is on", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("zodiac", ["aries", "taurus"]),
    ]

    const result = expandHook(
      "[[ZODIAC]] VERSUS [[ZODIAC]]",
      undefined,
      collections,
      () => 0,
      { noDuplicates: true }
    )

    expect(result.text).toBe("Aries VERSUS Taurus")
    expect(result.substitutions).toEqual({
      ZODIAC: "Aries",
      ZODIAC_2: "Taurus",
    })
  })

  it("repeats the same value for a repeated variable when noDuplicates is off", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("zodiac", ["aries", "taurus"]),
    ]

    expect(
      expandHook(
        "[[ZODIAC]] loves another [[ZODIAC]]",
        undefined,
        collections,
        () => 0
      ).text
    ).toBe("Aries loves another Aries")
  })

  it("enumerates distinct pairs for repeated variables in combinations", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("zodiac", ["aries", "taurus"]),
    ]

    const combos = expandAllHookCombinations(
      "[[ZODIAC]] VERSUS [[ZODIAC]]",
      undefined,
      collections,
      { noDuplicates: true }
    )

    expect(combos.map((combo) => combo.text).sort()).toEqual([
      "Aries VERSUS Taurus",
      "Taurus VERSUS Aries",
    ])
  })

  it("never repeats a word when two slots share one collection", () => {
    const collections: WordCollectionRecord[] = [
      wordCollection("zodiac", ["aries", "taurus"]),
    ]

    const result = expandHook(
      "[[zodiac]] VERSUS [[zodiac_2]]",
      { zodiac_2: "zodiac" },
      collections,
      () => 0
    )

    expect(result.text).toBe("Aries VERSUS Taurus")
    expect(result.substitutions).toEqual({
      zodiac: "Aries",
      zodiac_2: "Taurus",
    })
  })

  it("fails when a hook slot is not backed by database words", () => {
    expect(() => expandHook("hello [[missing]]", {}, [], () => 0)).toThrow(
      "Hook slot missing has no words in database collection missing"
    )
  })

  it("resolves runtime date variables without a random collection", () => {
    const options = {
      now: new Date("2026-12-31T16:30:00.000Z"),
      timeZone: "Asia/Singapore",
    }

    expect(
      expandHook(
        "Today is [[current_month]] [[current_day]], [[current_year]]",
        undefined,
        [],
        () => 0.99,
        options
      )
    ).toEqual({
      text: "Today is January 1, 2027",
      template: "Today is [[current_month]] [[current_day]], [[current_year]]",
      substitutions: {
        current_month: "January",
        current_day: "1",
        current_year: "2027",
      },
    })
    expect(
      expandAllHookCombinations(
        "[[current_year]] plans for [[current_year]]",
        undefined,
        [],
        { ...options, noDuplicates: true }
      ).map((item) => item.text)
    ).toEqual(["2027 plans for 2027"])
  })

  it("resolves SLIDE_COUNT from the selected body-slide count", () => {
    expect(
      expandHook("[[SLIDE_COUNT]] things you need", undefined, [], () => 0, {
        slideCount: 7,
      })
    ).toEqual({
      text: "7 things you need",
      template: "[[SLIDE_COUNT]] things you need",
      substitutions: { SLIDE_COUNT: "7" },
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
      expandHook(
        "[[zodiac]]s are loyal",
        { zodiac: "zodiac" },
        collections,
        () => 0
      ).text
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
