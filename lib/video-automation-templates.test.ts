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
