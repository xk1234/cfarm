import { describe, expect, it, vi } from "vitest"

import {
  benchmarkXRun,
  characterLimitFor,
  defaultXAutomation,
  normalizeXAutomation,
  xAutomationToAutomation,
} from "@/lib/x-automation"
import { xPostArchetypes } from "@/lib/x-post-presets"
import { generateXAutomationRun } from "@/lib/x-automation-generation"
import { publishXAutomationRun } from "@/lib/x-automation-publishing"
import {
  discoverTrendCandidates,
  normalizeCandidate,
} from "@/lib/x-trend-discovery"

describe("X automation domain", () => {
  it("defaults scheduled posts to auto-publish", () => {
    expect(defaultXAutomation().publishing.autoPost).toBe(true)
  })

  it("keeps text automation data separate and preserves shared scheduling", () => {
    const automation = defaultXAutomation({ id: "x-test" })
    expect(automation.output.contentType).toBe("thread")
    expect(automation.schedule.timezone).toBe("Asia/Singapore")
    expect(automation).not.toHaveProperty("formatting")
    expect(
      normalizeXAutomation(JSON.parse(JSON.stringify(automation)))?.id
    ).toBe("x-test")
  })

  it("preserves accounts and posting times for the shared automation card", () => {
    const engine = defaultXAutomation({ id: "x-card" })
    engine.status = "live"
    engine.publishing.integrations = [
      {
        provider: "x",
        integration_id: "x-1",
        name: "Founder account",
        profile: "founder",
      },
    ]
    engine.schedule.posting_times = [
      { time: "9:00 AM", days: ["Mon"], enabled: true },
      { time: "6:00 PM", days: ["Fri"], enabled: false },
    ]

    const automation = xAutomationToAutomation(engine)

    expect(automation.account).toBe("Founder account")
    expect(automation.handle).toBe("X · @founder")
    expect(automation.times).toEqual(["9:00 AM"])
    expect(automation.schedule).toBe(engine.schedule)
    expect(automation.timezone).toBe("Asia/Singapore")
  })

  it("maps explicit single post length settings", () => {
    expect(characterLimitFor("short")).toBe(140)
    expect(characterLimitFor("standard")).toBe(280)
    expect(characterLimitFor("long")).toBe(4_000)
  })

  it("exposes all seven Phantom Profit post archetypes", () => {
    expect(
      xPostArchetypes
        .filter((item) => item.id !== "pattern_drop")
        .map((item) => item.id)
    ).toEqual([
      "educational_thread",
      "data_drop",
      "contrarian_take",
      "numbered_list",
      "comparison",
      "mistake_breakdown",
      "opinion_framework",
    ])
  })

  it("benchmarks overflow and weak specificity", () => {
    const text = "x".repeat(300)
    const score = benchmarkXRun({
      contentType: "single",
      hook: "a useful thought",
      content: [text],
      cta: "",
      posts: [
        { id: "post-1", text, characterCount: text.length, role: "content" },
      ],
      maxCharacters: 280,
    })
    expect(score.formatFit).toBeLessThan(100)
    expect(score.notes.join(" ")).toContain("exceed")
    expect(score.notes.join(" ")).toContain("supported number")
  })

  it("scores Threads completeness without requiring a formal CTA", () => {
    const score = benchmarkXRun({
      platform: "threads",
      contentType: "single",
      hook: "hot take: your chart is not a verdict",
      content: ["astrology gives you a pattern to question. what resonates?"],
      cta: "",
      posts: [],
      maxCharacters: 500,
    })

    expect(score.stageCompleteness).toBe(100)
    expect(score.cta).toBe(100)
    expect(score.notes.join(" ")).not.toContain("explicit, low-friction action")
  })

  it("keeps explicit X platform scoring identical to the default", () => {
    const input = {
      contentType: "single" as const,
      hook: "a useful thought",
      content: ["one concrete idea"],
      cta: "",
      posts: [],
      maxCharacters: 280,
    }

    expect(benchmarkXRun({ ...input, platform: "x" })).toEqual(
      benchmarkXRun(input)
    )
  })

  it("normalizes social discovery payloads from heterogeneous actors", () => {
    const candidate = normalizeCandidate(
      "tiktok",
      {
        id: "viral-1",
        webVideoUrl: "https://www.tiktok.com/@creator/video/1",
        description: "Three creator automation mistakes",
        playCount: 100_000,
        diggCount: 8_000,
        commentCount: 500,
        shareCount: 1_000,
        authorName: "Creator",
      },
      0,
      "creator automation"
    )
    expect(candidate?.metrics.views).toBe(100_000)
    expect(candidate?.engagementRate).toBeCloseTo(0.095)
    expect(candidate?.relevanceScore).toBeGreaterThan(50)
  })

  it("uses the small-batch X actor without requiring an extra env alias", async () => {
    const automation = defaultXAutomation({ id: "x-discovery" })
    automation.niche.label = "astrology"
    automation.discovery.sources = ["x"]
    automation.discovery.minimumViews = 0
    automation.discovery.minimumEngagementRate = 0
    const fetchImpl = vi.fn(
      async (_url: URL | RequestInfo, init?: RequestInit) =>
        Response.json([
          {
            id: "tweet-1",
            url: "https://x.com/example/status/1",
            text: "astrology chart reading",
            viewCount: 1000,
            likeCount: 100,
          },
        ])
    )
    await discoverTrendCandidates({
      automation,
      query: "astrology",
      source: "x",
      token: "test-token",
      fetchImpl: fetchImpl as typeof fetch,
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toContain("apidojo~twitter-scraper-lite")
    expect(JSON.parse(String(init?.body))).toMatchObject({
      searchTerms: ["astrology"],
      maxItems: 40,
      sort: "Latest + Top",
    })
  })

  it.skip("legacy six-stage generation (replaced by structured preset generation)", async () => {
    const responses = [
      {
        niche: "AI video analysis",
        audience: "creators evaluating video tools",
        promise: "explain why motion context matters",
        angle: "frame sampling removes the useful signal",
        pillars: ["video understanding", "creator workflows"],
        keywords: ["video analysis", "frame sampling"],
        painPoint: "tools that mistake screenshots for video understanding",
        voice: "concise, technical, native to X",
        archetype: "educational_thread",
        hookDirection: "contrast motion with screenshots",
        contentDirection: "teach the mechanism step by step",
        ctaDirection: "ask readers to test the first step",
        exclusions: ["unsupported benchmark claims"],
      },
      {
        candidates: ["Most creators sample frames"],
        selected: "Video analysis needs motion, not screenshots",
      },
      {
        setup:
          "Frame sampling deletes the transitions that explain what happened.",
      },
      {
        sections: [
          "1. Parse the timeline",
          "2. Track scene changes",
          "3. Compare motion and audio",
        ],
      },
      {
        proof:
          "Example: two identical frames can sit inside completely different actions.",
      },
      {
        curiosityGap:
          "The useful signal appears between the frames—what are you currently missing?",
      },
      {
        options: ["Bookmark this workflow"],
        selected: "Bookmark this workflow and test step one.",
      },
      {
        total: 78,
        hook: 82,
        specificity: 76,
        readability: 84,
        cta: 80,
        archetypeFit: 75,
        nativeVoice: 74,
        factualAccuracy: 88,
        benchmarkFit: 71,
        verdict: "revise",
        confidence: 86,
        summary:
          "Useful and clear, but still more tutorial-like than native X.",
        factualRisks: [],
        notes: ["Tighten the setup."],
        matchedBenchmarkId: "mho-video-skill",
      },
      {
        posts: [
          "Video analysis needs motion, not screenshots.",
          "Frame sampling removes the transitions that explain what changed.",
          "1. Parse the timeline.",
          "2. Track scene changes.",
          "3. Compare motion and audio.",
          "Example: identical frames can occur inside different actions.",
          "The useful signal often appears between frames. What are you missing?",
          "Bookmark this workflow and test step one.",
        ],
      },
      {
        total: 90,
        hook: 90,
        specificity: 86,
        readability: 92,
        cta: 88,
        archetypeFit: 91,
        nativeVoice: 89,
        factualAccuracy: 95,
        benchmarkFit: 84,
        verdict: "ready",
        confidence: 92,
        summary: "A concise, specific and publishable educational thread.",
        factualRisks: [],
        notes: [],
        matchedBenchmarkId: "mho-video-skill",
      },
    ]
    const fetchImpl = vi.fn(async () =>
      Response.json({
        choices: [
          { message: { content: JSON.stringify(responses.shift() ?? {}) } },
        ],
      })
    ) as typeof fetch
    const automation = defaultXAutomation({ id: "six-stage" })
    const run = await generateXAutomationRun({
      automation,
      topic: "AI video analysis",
      apiKey: "test-key",
      fetchImpl,
      now: new Date("2026-07-14T00:00:00.000Z"),
    })

    expect(fetchImpl).toHaveBeenCalledTimes(10)
    expect(run.posts.map((post) => post.role)).toEqual([
      "hook",
      "setup",
      "content",
      "content",
      "content",
      "proof",
      "gap",
      "cta",
    ])
    expect(run.benchmark.stageCompleteness).toBe(100)
    expect(run.benchmark.comparison.archetype).toBe("educational_thread")
    expect(run.benchmark).toMatchObject({
      evaluator: "ai",
      total: 90,
      factualAccuracy: 95,
      verdict: "ready",
      revision: { applied: true, previousTotal: 78 },
    })
    expect(run.inferredBrief).toMatchObject({
      audience: "creators evaluating video tools",
      archetype: "educational_thread",
    })
  })

  it("keeps unsupported reply-chain threads as drafts instead of flattening them", async () => {
    const automation = defaultXAutomation({ id: "thread-autopost" })
    automation.publishing.autoPost = true
    automation.publishing.integrations = [
      { provider: "x", integration_id: "x-1", name: "X account" },
    ]
    const result = await publishXAutomationRun({
      automation,
      run: {
        id: "run-1",
        automationId: automation.id,
        automationName: automation.name,
        topic: "topic",
        contentType: "thread",
        platform: "x",
        reactionMode: "none",
        hook: "Hook",
        setup: "Setup",
        content: ["Body"],
        proof: "Proof",
        curiosityGap: "Gap?",
        cta: "Follow",
        posts: [],
        imageUrls: [],
        benchmark: benchmarkXRun({
          contentType: "thread",
          hook: "Hook",
          content: ["Body"],
          cta: "Follow",
          posts: [],
          maxCharacters: 280,
        }),
        status: "draft",
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
      },
    })
    expect(result.published).toBe(0)
    expect(result.skippedReason).toContain("reply-chain")
  })
})
