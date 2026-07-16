import { describe, expect, it } from "vitest"

import { llmSlopMatches, llmSlopPromptLine, llmSlopViolations } from "@/lib/llm-slop"

describe("llmSlopMatches", () => {
  it("matches tell-words on word boundaries only", () => {
    expect(llmSlopMatches("Let's delve into growth loops")).toContain("delve")
    expect(llmSlopMatches("The candelabra was seamlessly lit")).toContain("seamlessly")
    expect(llmSlopMatches("the candelver mechanism keeps time")).not.toContain("delve")
  })

  it("matches phrases case-insensitively", () => {
    expect(llmSlopMatches("In Today's Fast-Paced world of sales")).toContain("in today's fast-paced")
    expect(llmSlopMatches("Here's the KICKER: nothing changed")).toContain("here's the kicker")
  })

  it("matches structural patterns", () => {
    expect(llmSlopMatches("It's not about luck, it's about systems")).toContain(
      "not-X-but-Y contrast cliché"
    )
    expect(llmSlopMatches("Great designers aren't just artists")).toContain("isn't-just symmetry")
  })

  it("returns nothing for plain human copy", () => {
    expect(
      llmSlopMatches("Put your phone number in the header. People scanning on mobile won't scroll.")
    ).toEqual([])
  })
})

describe("llmSlopViolations", () => {
  it("formats repair-loop messages", () => {
    const violations = llmSlopViolations("We empower founders to unlock growth")
    expect(violations.some((item) => item.includes('"empower"'))).toBe(true)
    expect(violations.some((item) => item.includes('"unlock"'))).toBe(true)
  })
})

describe("llmSlopPromptLine", () => {
  it("bans the lexicon inline", () => {
    const line = llmSlopPromptLine()
    expect(line).toContain("delve")
    expect(line).toContain("let that sink in")
  })
})
