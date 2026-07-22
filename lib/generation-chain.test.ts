import { describe, expect, it, vi } from "vitest"

import type { BrandProfile } from "@/lib/brand-profile"
import { runGenerationChain } from "@/lib/generation-chain"

const profile: BrandProfile = {
  id: "brand-profile",
  niche: "developer tools",
  audience: "staff engineers",
  voice: ["plainspoken", "precise"],
  pillars: ["reliability"],
  proofPoints: ["used in production"],
  prohibitedClaims: ["guaranteed uptime"],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}

function fetchSequence(payloads: Record<string, unknown>[]) {
  return vi.fn(async () => {
    const payload = payloads.shift()
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(payload) } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  }) as unknown as typeof fetch
}

const stages = {
  generate: { model: "draft-model" },
  humanize: { model: "human-model" },
  review: { model: "review-model" },
}

describe("generation chain", () => {
  it("runs generate, humanize, and review in order", async () => {
    const fetchImpl = fetchSequence([
      { content: "Leverage robust synergies." },
      { content: "Build systems that keep working." },
      {
        verdict: "pass",
        content: "Build systems that keep working.",
        issues: [],
      },
    ])
    const result = await runGenerationChain({
      ...stages,
      input: {
        apiKey: "test",
        prompt: "Write a post",
        brandProfile: profile,
        fetchImpl,
      },
    })
    expect(result).toMatchObject({
      content: "Build systems that keep working.",
      verdict: "pass",
      issues: [],
    })
    expect(result.trace.map((item) => item.stage)).toEqual([
      "generate",
      "humanize",
      "review",
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it("returns the reviewer's repaired publishable content", async () => {
    const fetchImpl = fetchSequence([
      { content: "We guarantee uptime." },
      { content: "We guarantee uptime." },
      {
        verdict: "fix",
        content: "Design for fewer production surprises.",
        issues: ["Removed prohibited guarantee"],
      },
    ])
    const result = await runGenerationChain({
      ...stages,
      input: {
        apiKey: "test",
        prompt: "Write a post",
        brandProfile: profile,
        fetchImpl,
      },
    })
    expect(result.verdict).toBe("fix")
    expect(result.content).toBe("Design for fewer production surprises.")
    expect(result.issues).toEqual(["Removed prohibited guarantee"])
  })

  it("falls back to the original generation pass without a brand profile", async () => {
    const fetchImpl = fetchSequence([{ content: "Original generated copy" }])
    const result = await runGenerationChain({
      ...stages,
      input: { apiKey: "test", prompt: "Write a post", fetchImpl },
    })
    expect(result.content).toBe("Original generated copy")
    expect(result.trace.map((item) => item.stage)).toEqual(["generate"])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
