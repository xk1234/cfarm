import { describe, expect, it, vi } from "vitest"

import { defaultXAutomation, normalizeXAutomation } from "@/lib/x-automation"
import {
  buildPostStructuredOutputSchema,
  generateXAutomationRun,
  normalizeStructuredOutput,
  retrieveViralHookExamples,
  selectPostPlan,
  threadsRecycleCandidate,
  validateGeneratedPost,
} from "@/lib/x-automation-generation"
import { xPostArchetypes } from "@/lib/x-post-presets"

function configuredAutomation() {
  const record = defaultXAutomation({ id: "preset-test" })
  record.niche.label = "creator systems"
  record.brief = {
    audience: "solo creators",
    promise: "repeatable content systems",
    pillars: [
      { label: "workflows", weight: 30 },
      { label: "distribution", weight: 20 },
      { label: "research", weight: 15 },
    ],
    keywords: ["content systems"],
    painPoints: ["inconsistent publishing"],
    derivedAt: "2026-07-15T00:00:00.000Z",
  }
  record.platform = "x"
  record.generation.hookStyles = ["contrarian"]
  return record
}

describe("preset-driven X generation", () => {
  it("migrates manual niche fields and custom stage prompts", () => {
    const migrated = normalizeXAutomation({
      id: "legacy",
      name: "Legacy engine",
      niche: {
        label: "fitness",
        audience: "busy founders",
        promise: "short practical workouts",
        pillars: ["strength", "mobility", "recovery"],
        keywords: ["training"],
        painPoints: ["no time"],
      },
      output: { singleLength: "long", platforms: ["x"] },
      generation: {
        hookPrompt: "Use an unusually direct opening",
        voice: "sound like a pragmatic coach",
      },
    })

    expect(migrated?.brief).toMatchObject({
      audience: "busy founders",
      pillars: [
        { label: "strength", weight: 30 },
        { label: "mobility", weight: 20 },
        { label: "recovery", weight: 15 },
      ],
    })
    expect(migrated?.output.maxCharacters).toBe(4_000)
    expect(migrated?.platform).toBe("x")
    expect(migrated?.output).not.toHaveProperty("platformFlags")
    expect(migrated?.generation.voiceOverride).toContain(
      "sound like a pragmatic coach"
    )
    expect(migrated?.generation.voiceOverride).toContain(
      "Use an unusually direct opening"
    )
  })

  it("migrates legacy platform flags once and normalizes idempotently", () => {
    const migrated = normalizeXAutomation({
      id: "legacy-both",
      output: {
        platformFlags: { x: true, threads: true },
        platforms: ["x", "threads"],
      },
    })!
    expect(migrated.platform).toBe("x")
    expect(migrated.output).not.toHaveProperty("platformFlags")
    expect(normalizeXAutomation(migrated)).toEqual(migrated)
  })

  it("does not repeat the previous archetype and gates proof formats", () => {
    const record = configuredAutomation()
    record.usage.recentArchetypes = [
      { id: "numbered_list", at: "2026-07-15T00:00:00.000Z" },
    ]
    const plan = selectPostPlan(record, {
      platform: "x",
      now: new Date("2026-07-15T01:00:00.000Z"),
      random: () => 0.2,
    })
    expect(plan.archetype.id).not.toBe("numbered_list")
    expect(plan.archetype.needsProof).not.toBe(true)
  })

  it("uses a supplied topic at the configured 70% rate", () => {
    const record = configuredAutomation()
    expect(
      selectPostPlan(record, {
        platform: "x",
        topic: "niche trend",
        random: () => 0.69,
      }).pillar.label
    ).toBe("niche trend")
    expect(
      selectPostPlan(record, {
        platform: "x",
        topic: "niche trend",
        random: () => 0.7,
      }).pillar.label
    ).not.toBe("niche trend")
  })

  it("excludes reply-chain presets when X autopost is enabled", () => {
    const record = configuredAutomation()
    record.publishing.autoPost = true
    for (const random of [0, 0.2, 0.5, 0.9]) {
      expect(
        selectPostPlan(record, { platform: "x", random: () => random })
          .archetype.kind
      ).toBe("single")
    }
  })

  it("allows Threads body recycling only after the two-day cooldown", () => {
    const record = configuredAutomation()
    record.platform = "threads"
    record.usage.recentBodies = [
      { body: "old body", hook: "old hook", at: "2026-07-12T00:00:00.000Z" },
      { body: "new body", hook: "new hook", at: "2026-07-14T12:00:00.000Z" },
    ]
    expect(
      threadsRecycleCandidate(record, new Date("2026-07-15T00:00:00.000Z"))
    ).toMatchObject({ body: "old body" })
  })

  it("builds slot-driven schemas and thread arrays", () => {
    const numbered = xPostArchetypes.find(
      (item) => item.id === "numbered_list"
    )!
    const thread = xPostArchetypes.find(
      (item) => item.id === "educational_thread"
    )!
    expect(buildPostStructuredOutputSchema(numbered).schema.required).toContain(
      "items"
    )
    expect(
      buildPostStructuredOutputSchema(thread).schema.properties
    ).toHaveProperty("posts")
  })

  it("normalizes model slot output to the preset word ceiling", () => {
    const numbered = xPostArchetypes.find(
      (item) => item.id === "numbered_list"
    )!
    const normalized = normalizeStructuredOutput(numbered, {
      items: Array.from({ length: 36 }, (_, index) => `word${index}`).join(" "),
    })

    expect(String(normalized.items).split(/\s+/)).toHaveLength(
      numbered.slots.find((slot) => slot.key === "items")!.maxWords
    )
  })

  it("rejects links and unsupported numeric proof", () => {
    const record = configuredAutomation()
    const plan = selectPostPlan(record, { platform: "x", random: () => 0.5 })
    expect(
      validateGeneratedPost({
        plan,
        record,
        output: {},
        posts: ["I made $10k in 30 days https://example.com"],
      }).join(" ")
    ).toMatch(/links|unsupported proof/)
  })

  it("flags posts with no niche, keyword, or pillar token", () => {
    const record = configuredAutomation()
    const plan = selectPostPlan(record, { platform: "x", random: () => 0.5 })
    const errors = validateGeneratedPost({
      plan,
      record,
      output: {},
      posts: ["the weather is pleasant today"],
    })

    expect(errors).toContain(
      "Off-niche: post never references the niche (creator systems) or any brief keyword."
    )
  })

  it("returns no viral hooks when the corpus has no niche-token match", async () => {
    await expect(
      retrieveViralHookExamples({
        niche: "zzzxxyy",
        topic: "qqqwwwee",
      })
    ).resolves.toEqual([])
  })

  it("enforces X character limits and rejects generic filler", () => {
    const record = configuredAutomation()
    const plan = selectPostPlan(record, { platform: "x", random: () => 0.5 })
    const errors = validateGeneratedPost({
      plan,
      record,
      output: {},
      posts: [`${"a".repeat(281)} believe in yourself`],
    }).join(" ")

    expect(errors).toContain("single X posts must be at most 280 characters")
    expect(errors).toContain("generic or personal-update copy is not allowed")
  })

  it.each([
    ["length", `${"a".repeat(501)}`, "at most 500 characters"],
    [
      "line count",
      "one\n\ntwo\n\nthree\n\nfour\n\nfive",
      "at most 4 short lines",
    ],
    ["spacing", "one\ntwo", "separated by blank lines"],
    ["sentence count", "One. Two. Three.", "at most 2 sentences"],
    ["emoji count", "Insight 😌 ✨ 🫶", "at most 2 emoji"],
    ["hashtags", "A useful thought #astrology", "may not use hashtags"],
  ])("enforces the Threads %s rule", (_rule, post, expected) => {
    const record = configuredAutomation()
    record.platform = "threads"
    const plan = selectPostPlan(record, {
      platform: "threads",
      random: () => 0,
    })
    expect(
      validateGeneratedPost({ plan, record, output: {}, posts: [post] }).join(
        " "
      )
    ).toContain(expected)
  })

  it("uses one generation call and one repair at most", async () => {
    const record = configuredAutomation()
    const valid = {
      hook: "unpopular opinion: tools slow creators",
      belief: "more tools make publishing easier",
      reasons:
        "tools add steps hide choices slow work split focus cost money blur goals block learning and make fixes harder",
      alternative: "use one workflow. which step slows you down?",
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ message: { content: "truncated json" } }] })
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: JSON.stringify(valid) } }],
        })
      )
    const run = await generateXAutomationRun({
      automation: record,
      topic: "workflow sprawl",
      apiKey: "test-key",
      fetchImpl: fetchImpl as typeof fetch,
      random: () => 0,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      max_tokens?: number
      messages?: Array<{ role: string; content: string }>
    }
    expect(request.max_tokens).toBe(2_800)
    expect(request.messages?.[0]?.content).toContain(
      "Niche: creator systems. Audience: solo creators. Promise: repeatable content systems."
    )
    expect(request.messages?.[0]?.content).toContain(
      "Core themes: content systems. Reader pains: inconsistent publishing."
    )
    expect(run.needsReview).toBe(false)
    expect(run.plans?.[0]).toMatchObject({ platform: "x" })
  })

  it("generates Threads with its own short-post plan", async () => {
    const record = configuredAutomation()
    record.platform = "threads"
    record.generation.hookStyles = ["threads_unpopular_opinion"]
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                label: "UNPOPULAR OPINION",
                take: "build trust before reach and serve people before metrics. which one are you choosing?",
              }),
            },
          },
        ],
      })
    ) as typeof fetch

    const run = await generateXAutomationRun({
      automation: record,
      topic: "trust",
      apiKey: "test-key",
      fetchImpl,
      random: () => 0,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(run.posts[0].platform).toBe("threads")
    expect(run.plans?.[0]).toMatchObject({
      platform: "threads",
      archetype: "label_take",
    })
  })
})
