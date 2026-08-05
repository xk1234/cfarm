import { describe, expect, it } from "vitest"

import type { AutomationRunRecord } from "@/lib/automation-runner"
import {
  matchPublicationToAutomationRun,
  publicationTextSignature,
} from "@/lib/publication-output-reconciliation"
import type { Post } from "@/lib/posts"

describe("publication output reconciliation", () => {
  it("matches an exact generated caption after removing TikTok hashtags", () => {
    const result = matchPublicationToAutomationRun(
      post({
        content: "5 things a libra will never tell you\n\n#libra #zodiac",
        publishedAt: "2026-08-02T09:19:33.000Z",
      }),
      [
        run({
          caption: "5 things a libra will never tell you",
          createdAt: "2026-08-02T09:16:51.000Z",
        }),
      ]
    )

    expect(result).toMatchObject({
      status: "matched",
      outputId: "slideshow-1",
      evidence: "exact_caption",
      delayMs: 162_000,
    })
  })

  it("refuses ambiguous exact matches instead of guessing", () => {
    const publication = post({
      content: "Five signs a Virgo is annoyed",
      publishedAt: "2026-08-01T12:00:00.000Z",
    })
    const result = matchPublicationToAutomationRun(publication, [
      run({ id: "run-1", outputId: "slideshow-1" }),
      run({ id: "run-2", outputId: "slideshow-2" }),
    ])

    expect(result).toEqual({
      status: "skipped",
      reason: "ambiguous_exact_match",
    })
  })

  it("does not match outputs created after the publication window", () => {
    const result = matchPublicationToAutomationRun(
      post({
        content: "Five signs a Virgo is annoyed",
        publishedAt: "2026-08-01T12:00:00.000Z",
      }),
      [run({ createdAt: "2026-08-01T13:00:00.000Z" })]
    )

    expect(result).toEqual({ status: "skipped", reason: "no_exact_match" })
  })

  it("normalizes written numbers and strips hashtag-only suffixes", () => {
    expect(publicationTextSignature("Five ideas! #ideas #fyp")).toBe("5 ideas")
  })
})

function post(overrides: Partial<Post> = {}): Post {
  return {
    schemaVersion: 1,
    id: "post-1",
    intentId: "external:tiktok:account-1:123",
    ownerId: "owner-1",
    origin: "tiktok_studio_import",
    sourceType: "external",
    sourceId: "123",
    sourceRefs: [{ kind: "external", id: "123" }],
    lifecycleStatus: "published",
    linkState: "externally_linked",
    integrationId: "account-1",
    provider: "tiktok",
    externalPostId: "123",
    statsSources: ["tiktok_studio"],
    content: "Five signs a Virgo is annoyed",
    hashtags: [],
    media: [],
    publishedAt: "2026-08-01T12:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-01T12:00:00.000Z",
    ...overrides,
  }
}

function run(
  input: {
    id?: string
    outputId?: string
    caption?: string
    createdAt?: string
  } = {}
): AutomationRunRecord {
  const createdAt = input.createdAt ?? "2026-08-01T11:55:00.000Z"
  return {
    id: input.id ?? "run-1",
    automationId: "automation-1",
    automationTitle: "Zodiac",
    scheduledFor: createdAt,
    status: "succeeded",
    slideshowId: input.outputId ?? "slideshow-1",
    plan: {
      title: "Virgo",
      caption: input.caption ?? "Five signs a Virgo is annoyed",
      hashtags: "#virgo",
      hook: "Five signs a Virgo is annoyed",
      imageCollectionIds: [],
      slides: [],
      slideCount: { mode: "static", count: 5 },
      publishType: "slideshow",
      autoMusic: false,
      autoPost: false,
      language: "English",
    },
    createdAt,
    updatedAt: createdAt,
  }
}
