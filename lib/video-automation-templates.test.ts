import { describe, expect, it } from "vitest"

import { normalizeVideoFormat } from "@/lib/realfarm-automation"
import {
  videoAutomationTemplatePreset,
  videoSegmentPlaysFull,
} from "@/lib/video-automation-templates"

describe("screen-record video template", () => {
  it("only requires one full video for intro, demo, and outro", () => {
    const format = videoAutomationTemplatePreset("screen_record").buildFormat()

    expect(format.segments.map((segment) => segment.id)).toEqual([
      "screen-intro",
      "screen-demo",
      "screen-outro",
    ])
    expect(
      format.segments.map((segment) => videoSegmentPlaysFull(format, segment))
    ).toEqual([true, true, true])
    expect(format.segments.every((segment) => segment.clipCount === 1)).toBe(
      true
    )
  })

  it("keeps the behavior for older saved screen-record schemas", () => {
    const format = videoAutomationTemplatePreset("screen_record").buildFormat()
    const legacySegment = { ...format.segments[0], playFullVideo: undefined }

    expect(videoSegmentPlaysFull(format, legacySegment)).toBe(true)
  })
})

describe("greenscreen-meme video template", () => {
  it("uses separate meme-video and background-image collections", () => {
    const format =
      videoAutomationTemplatePreset("greenscreen_meme").buildFormat()

    expect(format.hookPlacement).toBe("global")
    expect(format.globalTextItems).toHaveLength(1)
    expect(format.segments).toMatchObject([
      {
        id: "greenscreen-meme",
        mediaSource: "collection",
        mediaKind: "video",
        collectionId: "collection-greenscreen-memes",
        clipCount: 1,
        playFullVideo: true,
      },
      {
        id: "greenscreen-background",
        mediaSource: "collection",
        mediaKind: "image",
        clipCount: 1,
      },
    ])
    expect(normalizeVideoFormat(format)?.template).toBe("greenscreen_meme")
  })
})

describe("react-and-reveal video template", () => {
  it("plays one collection video and one demo video in full", () => {
    const format = videoAutomationTemplatePreset("react_reveal").buildFormat()
    const [anticipation, reveal] = format.segments

    expect(anticipation).toMatchObject({
      id: "react-anticipation",
      mediaSource: "collection",
      mediaKind: "video",
      clipCount: 1,
      playFullVideo: true,
    })
    expect(reveal).toMatchObject({
      id: "react-reveal",
      mediaSource: "demo_asset",
      mediaKind: "video",
      clipCount: 1,
      playFullVideo: true,
    })
    expect(
      format.segments.map((segment) => videoSegmentPlaysFull(format, segment))
    ).toEqual([true, true])
  })

  it("keeps full-video behavior for older saved segments", () => {
    const format = videoAutomationTemplatePreset("react_reveal").buildFormat()
    const legacySegments = format.segments.map((segment) => ({
      ...segment,
      playFullVideo: undefined,
    }))

    expect(
      legacySegments.map((segment) => videoSegmentPlaysFull(format, segment))
    ).toEqual([true, true])
  })

  it("migrates older saved media choices to the fixed two-step workflow", () => {
    const legacy = videoAutomationTemplatePreset("react_reveal").buildFormat()
    legacy.segments = legacy.segments.map((segment) =>
      segment.id === "react-reveal"
        ? {
            ...segment,
            mediaSource: "collection",
            mediaKind: "image",
            clipCount: 2,
            playFullVideo: false,
          }
        : { ...segment, playFullVideo: false }
    )

    const normalized = normalizeVideoFormat(legacy)

    expect(normalized?.segments[0]).toMatchObject({
      mediaSource: "collection",
      mediaKind: "video",
      clipCount: 1,
      playFullVideo: true,
    })
    expect(normalized?.segments[1]).toMatchObject({
      mediaSource: "demo_asset",
      mediaKind: "video",
      clipCount: 1,
      playFullVideo: true,
    })
  })
})

describe.each(["story_over_broll", "faceless_reel"] as const)(
  "%s video template normalization",
  (templateId) => {
    it("round-trips its template id through normalization", () => {
      const format = videoAutomationTemplatePreset(templateId).buildFormat()

      expect(normalizeVideoFormat(format)?.template).toBe(templateId)
    })
  }
)

describe("story-over-broll video template", () => {
  it("builds the four planned story beats with exact copy bounds", () => {
    const format =
      videoAutomationTemplatePreset("story_over_broll").buildFormat()

    expect(format.hookPlacement).toBe("first_segment")
    expect(format.globalTextItems).toHaveLength(0)
    expect(
      format.segments.map((segment) => ({
        id: segment.id,
        clipCount: segment.clipCount,
        clipDurationMs: segment.clipDurationMs,
        transition: segment.transition,
        textItemCount: segment.textItems.length,
        wordBounds: segment.textItems.map((item) => [
          item.wordLengthMin,
          item.wordLengthMax,
        ]),
      }))
    ).toEqual([
      {
        id: "story-hook",
        clipCount: 1,
        clipDurationMs: 2800,
        transition: "cut",
        textItemCount: 1,
        wordBounds: [[6, 14]],
      },
      {
        id: "story-journey",
        clipCount: 2,
        clipDurationMs: 2600,
        transition: "cut",
        textItemCount: 1,
        wordBounds: [[5, 12]],
      },
      {
        id: "story-payoff",
        clipCount: 1,
        clipDurationMs: 3000,
        transition: "cut",
        textItemCount: 1,
        wordBounds: [[5, 12]],
      },
      {
        id: "story-cta",
        clipCount: 1,
        clipDurationMs: 2800,
        transition: "cut",
        textItemCount: 1,
        wordBounds: [[8, 16]],
      },
    ])
    expect(
      format.segments.every(
        (segment) =>
          segment.mediaSource === "collection" && segment.mediaKind === "video"
      )
    ).toBe(true)
  })
})

describe("faceless-reel video template", () => {
  it("builds one long clip with claim and comment-gate overlays", () => {
    const format = videoAutomationTemplatePreset("faceless_reel").buildFormat()

    expect(format.hookPlacement).toBe("global")
    expect(
      format.globalTextItems.map((item) => ({
        position: item.textPosition,
        wordBounds: [item.wordLengthMin, item.wordLengthMax],
      }))
    ).toEqual([
      { position: "center", wordBounds: [8, 18] },
      { position: "bottom", wordBounds: [8, 14] },
    ])
    expect(format.segments).toHaveLength(1)
    expect(format.segments[0]).toMatchObject({
      id: "faceless-clip",
      mediaSource: "collection",
      mediaKind: "video",
      clipCount: 1,
      clipDurationMs: 9000,
      transition: "cut",
      textItems: [],
    })
  })
})
