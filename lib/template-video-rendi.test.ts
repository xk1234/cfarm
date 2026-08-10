import { describe, expect, it } from "vitest"

import { buildTemplateVideoRenderPlan } from "@/lib/template-video-rendi"

describe("generic video template Rendi plan", () => {
  it("preserves ordered clips, cover-fill rendering, captions, and soundtrack", () => {
    const plan = buildTemplateVideoRenderPlan({
      components: {
        template: "compilation",
        clips: [
          {
            key: "clips-0",
            kind: "video",
            durationMs: 1800,
            playFullVideo: false,
            transition: "cut",
            texts: [{ text: "first beat", textPosition: "top" }],
          },
          {
            key: "clips-1",
            kind: "image",
            durationMs: 1800,
            playFullVideo: false,
            transition: "fade",
            texts: [],
          },
        ],
        globalTexts: [{ text: "persistent hook", textPosition: "bottom" }],
      },
      stagedMedia: {
        "clips-0": { localFilePath: "/tmp/one.mp4", fileName: "one.mp4" },
        "clips-1": { localFilePath: "/tmp/two.jpg", fileName: "two.jpg" },
        audio: { localFilePath: "/tmp/music.mp3", fileName: "music.mp3" },
      },
    })

    expect(plan.rendiLocalInputs.map((input) => input.alias)).toEqual([
      "clip-0.mp4",
      "clip-1.jpg",
      "soundtrack",
    ])
    expect(plan.rendiCommandRequest.ffmpegCommand).toContain(
      "force_original_aspect_ratio=increase,crop=1080:1920"
    )
    expect(plan.rendiCommandRequest.ffmpegCommand).toContain(
      "concat=n=2:v=1:a=0"
    )
    expect(plan.rendiCommandRequest.ffmpegCommand).toContain("persistent hook")
    expect(plan.rendiCommandRequest.ffmpegCommand).toContain("-map 2:a")
  })

  it("uses a two-panel renderer for split screen", () => {
    const plan = buildTemplateVideoRenderPlan({
      components: {
        template: "split_screen",
        clips: [
          { key: "top", kind: "video", durationMs: 9000 },
          { key: "bottom", kind: "video", durationMs: 9000 },
        ],
        globalTexts: [],
      },
      stagedMedia: {
        top: { localFilePath: "/tmp/top.mp4" },
        bottom: { localFilePath: "/tmp/bottom.mp4" },
      },
    })

    expect(plan.rendiCommandRequest.ffmpegCommand).toContain("vstack=inputs=2")
  })
})
