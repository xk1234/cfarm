import { describe, expect, it, vi } from "vitest"

import {
  gradeXPost,
  nicheMatchedXBenchmarkReferences,
  xBenchmarkInputHash,
  type XBenchmarkCorpusRecord,
} from "@/lib/x-benchmarks"

describe("X and Threads benchmarks", () => {
  it("hashes rubric, model, platform, and text deterministically", () => {
    const a = xBenchmarkInputHash({ platform: "x", text: "hello astrology" })
    const b = xBenchmarkInputHash({ platform: "x", text: "hello astrology" })
    const other = xBenchmarkInputHash({ platform: "threads", text: "hello astrology" })
    expect(a).toBe(b)
    expect(a).not.toBe(other)
  })

  it("keeps references platform-specific and niche matched", () => {
    const corpus = [
      reference("astro-x", "x", "scorpio dating astrology"),
      reference("business-x", "x", "saas revenue funnels"),
      reference("astro-threads", "threads", "scorpio dating astrology"),
    ]
    const matched = nicheMatchedXBenchmarkReferences(
      { platform: "x", niche: "astrology", text: "scorpio dating patterns" },
      corpus,
      2
    )
    expect(matched.map((item) => item.id)).toEqual(["astro-x", "business-x"])
  })

  it("normalizes the independent judge response", async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          choices: [{ message: { content: JSON.stringify({
            scores: { hookLabelPower: 9, scannability: 8, identityPolarity: 9, replyBait: 8 },
            rationales: { hookLabelPower: "polarizing", scannability: "short", identityPolarity: "specific", replyBait: "answerable" },
          }) } }],
        })
    )
    const grade = await gradeXPost({
      platform: "threads",
      niche: "astrology",
      text: "UNPOPULAR OPINION\n\nScorpios remember who changed the rules.",
      apiKey: "test",
      fetchImpl: fetchImpl as typeof fetch,
    })
    expect(grade.scores.overall).toBe(8.5)
    expect(grade.scores.identityPolarity).toBe(9)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      max_tokens?: number
    }
    expect(request.max_tokens).toBe(1_200)
  })

  it("retries one truncated judge response", async () => {
    const valid = JSON.stringify({
      scores: { hookStopPower: 8, valueDensity: 9, voiceFormatFit: 8, replyBait: 9 },
      rationales: { hookStopPower: "specific", valueDensity: "dense", voiceFormatFit: "native", replyBait: "answerable" },
    })
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: "{\"scores\":" } }] }))
      .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: `\`\`\`json\n${valid}\n\`\`\`` } }] })) as typeof fetch

    const grade = await gradeXPost({
      platform: "x",
      text: "unpopular opinion: scorpios notice the exit before you do. which detail gave you away?",
      apiKey: "test",
      fetchImpl,
    })

    expect(grade.scores.overall).toBe(8.5)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

function reference(
  id: string,
  platform: "x" | "threads",
  text: string
): XBenchmarkCorpusRecord {
  return {
    id,
    platform,
    niche: text.includes("astrology") ? "astrology" : "business",
    author: "reference",
    text,
    metrics: {},
    notes: [],
    createdAt: "2026-07-15T00:00:00.000Z",
    grade: {
      scores: { hookStopPower: 8, valueDensity: 8, voiceFormatFit: 8, hookLabelPower: 8, scannability: 8, identityPolarity: 8, replyBait: 8, overall: 8 },
      rationales: {},
      model: "judge",
      inputHash: id,
      gradedAt: "2026-07-15T00:00:00.000Z",
    },
  }
}
