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

describe("VidAI-inspired video templates", () => {
  it("builds split screen from two full video sources", () => {
    const format = videoAutomationTemplatePreset("split_screen").buildFormat()

    expect(format.hookPlacement).toBe("global")
    expect(format.segments).toMatchObject([
      {
        id: "split-primary",
        mediaKind: "video",
        clipCount: 1,
        playFullVideo: true,
      },
      {
        id: "split-secondary",
        mediaKind: "video",
        clipCount: 1,
        playFullVideo: true,
      },
    ])
    expect(normalizeVideoFormat(format)?.template).toBe("split_screen")
  })

  it("builds a four-message fake text story over one video", () => {
    const format = videoAutomationTemplatePreset("fake_text").buildFormat()

    expect(format.globalTextItems).toHaveLength(4)
    expect(format.segments).toMatchObject([
      {
        id: "fake-text-background",
        mediaKind: "video",
        clipCount: 1,
        playFullVideo: true,
      },
    ])
    expect(normalizeVideoFormat(format)?.template).toBe("fake_text")
  })

  it("builds faceless shorts as hook, story beats, and payoff", () => {
    const format = videoAutomationTemplatePreset("faceless_short").buildFormat()

    expect(format.segments.map((segment) => segment.id)).toEqual([
      "faceless-hook",
      "faceless-story",
      "faceless-payoff",
    ])
    expect(
      format.segments.reduce((count, segment) => count + segment.clipCount, 0)
    ).toBe(6)
    expect(normalizeVideoFormat(format)?.template).toBe("faceless_short")
  })
})
