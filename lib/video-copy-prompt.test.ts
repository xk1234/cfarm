import { describe, expect, it } from "vitest"

import {
  buildVideoCopySystemPrompt,
  buildVideoCopyUserPrompt,
} from "@/lib/video-copy-prompt"

describe("video copy prompt builders", () => {
  it("builds the system prompt with the narrative and safety rules", () => {
    const prompt = buildVideoCopySystemPrompt({
      requiresCommentGate: false,
    })

    expect(prompt).toContain("ONE continuous narrative")
    expect(prompt).toContain(
      "Every overlay must stay inside its stated word range"
    )
    expect(prompt).toContain("Never refer to an assumed visual")
    expect(prompt).toContain("Never invent numbers")
  })

  it("includes the comment-gate rule only when required", () => {
    const standardPrompt = buildVideoCopySystemPrompt({
      requiresCommentGate: false,
    })
    const commentGatePrompt = buildVideoCopySystemPrompt({
      requiresCommentGate: true,
    })

    expect(standardPrompt).not.toContain("This is a comment-gate format")
    expect(commentGatePrompt).toContain("This is a comment-gate format")
    expect(commentGatePrompt).toContain(
      "exactly ONE memorable alphabetic trigger word"
    )
  })

  it("builds the user prompt with automation context and native exemplars", () => {
    const prompt = buildVideoCopyUserPrompt({
      automationName: "Moon Story",
      videoFormat: "story_over_broll",
      tone: "Casual",
      style: "Short and direct",
      hook: "why your moon sign explains that breakup",
      segmentRoles: [
        {
          id: "payoff",
          label: "Payoff",
          guidance: "reveal the pattern",
        },
      ],
      metadataPromptLines: ["- title: test metadata line"],
      requiresCommentGate: true,
      lowercase: true,
      items: [
        {
          id: "overlay-1",
          segmentLabel: "Payoff",
          guidance: "support the hook",
          contentDirection: "explain the pattern",
          wordLengthMin: 5,
          wordLengthMax: 9,
          count: 2,
        },
      ],
    })

    expect(prompt).toContain("Automation: Moon Story")
    expect(prompt).toContain("Video format: story_over_broll")
    expect(prompt).toContain(
      'The video opens with this hook: "why your moon sign explains that breakup"'
    )
    expect(prompt).toContain("1. Payoff [payoff]: reveal the pattern")
    expect(prompt).toContain("- title: test metadata line")
    expect(prompt).toContain("Native overlay exemplars")
    expect(prompt).toContain("comment 'PLAN' and I'll send you the free PDF")
    expect(prompt).toContain("comment 'MOON' for your moon-sign reading")
    expect(prompt).toContain("- id: overlay-1")
    expect(prompt).toContain("variations: 2 (one per clip, in story order)")
  })
})
