import { describe, expect, it } from "vitest"

import { expiryMilliseconds, isRefreshableKnowledgeSource, knowledgeContext, knowledgeContextPrompt, type KnowledgeBaseRecord } from "@/lib/knowledge-bases"

const record = (id: string, text: string): KnowledgeBaseRecord => ({
  id, name: id.toUpperCase(), description: "", status: "ready", sources: [], compiledText: text,
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
})

describe("knowledge bases", () => {
  it("allows refreshes only for enabled realtime sources", () => {
    expect(isRefreshableKnowledgeSource({ mode: "realtime", enabled: true })).toBe(true)
    expect(isRefreshableKnowledgeSource({ mode: "research", enabled: true })).toBe(false)
    expect(isRefreshableKnowledgeSource({ mode: "realtime", enabled: false })).toBe(false)
  })
  it("maps refresh choices to stable durations", () => {
    expect(expiryMilliseconds("0m")).toBe(0)
    expect(expiryMilliseconds("1h")).toBe(3_600_000)
    expect(expiryMilliseconds("1mo")).toBe(2_592_000_000)
  })

  it("builds bounded context only from selected bases", () => {
    expect(knowledgeContext([record("one", "alpha"), record("two", "beta")], ["two"]))
      .toBe("# TWO\nbeta")
    expect(knowledgeContext([record("one", "123456")], ["one"], 8)).toBe("# ONE\n12")
  })

  it("requires factual knowledge-base claims to cite only supplied sources", () => {
    const prompt = knowledgeContextPrompt(
      "## Market report\nprices declined 0.3% (Example News)"
    )

    expect(prompt).toContain("Every generated slide text item containing a factual claim")
    expect(prompt).toContain("Never invent attribution")
    expect(prompt).toContain("prices declined 0.3% (Example News)")
  })
})
