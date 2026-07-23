import { describe, expect, it, vi } from "vitest"

import {
  benchmarkXRun,
  characterLimitFor,
  defaultXAutomation,
  normalizeXAutomation,
  xAutomationToAutomation,
} from "@/lib/x-automation"
import { xPostArchetypes } from "@/lib/x-post-presets"
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
    const fetchImpl = vi.fn(async (...args: Parameters<typeof fetch>) => {
      void args
      return Response.json([
        {
          id: "tweet-1",
          url: "https://x.com/example/status/1",
          text: "astrology chart reading",
          viewCount: 1000,
          likeCount: 100,
        },
      ])
    })
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
