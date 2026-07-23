import { describe, expect, it } from "vitest"

import {
  migrateLegacyHookVariableReferences,
  runtimeHookVariableValue,
  wordCollectionVariableName,
} from "@/lib/hook-variables"
import type { WordCollectionRecord } from "@/lib/word-collections"

const legacyCollection: WordCollectionRecord = {
  id: "word-collection-0d218126-b128-405f-b817-806dc3299178",
  name: "Audience age",
  words: ["18-24", "25-34"],
  source: "manual",
  created_at: "2026-07-15T00:00:00.000Z",
  updated_at: "2026-07-15T00:00:00.000Z",
}

describe("hook variables", () => {
  it("keeps storage ids hidden behind readable collection tags", () => {
    expect(wordCollectionVariableName(legacyCollection)).toBe("audience_age")
    expect(
      wordCollectionVariableName({ id: "zodiac", name: "Zodiac signs" })
    ).toBe("zodiac")
  })

  it("migrates legacy UUID placeholders and preserves their collection mapping", () => {
    expect(
      migrateLegacyHookVariableReferences({
        text: "For [[word-collection-0d218126-b128-405f-b817-806dc3299178]] in {word-collection-0d218126-b128-405f-b817-806dc3299178}",
        collections: [legacyCollection],
      })
    ).toEqual({
      text: "For [[audience_age]] in {audience_age}",
      hookSlots: {
        audience_age: legacyCollection.id,
      },
      changed: true,
    })
  })

  it("retires the YEAR collection variable in favor of CURRENT_YEAR", () => {
    expect(
      migrateLegacyHookVariableReferences({
        text: "The [[YEAR]] guide and {year} update",
        hookSlots: { Year: "year", zodiac: "zodiac" },
        collections: [],
      })
    ).toEqual({
      text: "The [[current_year]] guide and {current_year} update",
      hookSlots: { zodiac: "zodiac" },
      changed: true,
    })

    expect(runtimeHookVariableValue("YEAR")).toBeUndefined()
  })

  it("resolves runtime dates in the automation timezone", () => {
    const now = new Date("2026-12-31T16:30:00.000Z")
    const input = { now, timeZone: "Asia/Singapore" }

    expect(runtimeHookVariableValue("current_year", input)).toBe("2027")
    expect(runtimeHookVariableValue("current_month", input)).toBe("January")
    expect(runtimeHookVariableValue("current_month_number", input)).toBe("01")
    expect(runtimeHookVariableValue("current_day", input)).toBe("1")
    expect(runtimeHookVariableValue("current_weekday", input)).toBe("Friday")
    expect(runtimeHookVariableValue("current_date", input)).toBe(
      "January 1, 2027"
    )
    expect(runtimeHookVariableValue("current_iso_date", input)).toBe(
      "2027-01-01"
    )
  })
})
