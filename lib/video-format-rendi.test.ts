import { describe, expect, it } from "vitest"

import { buildFixedVideoRenderPlan } from "@/lib/video-format-rendi"

describe("fixed video Rendi plans", () => {
  it("keeps the full anticipation clip before the full reveal", () => {
    const plan = buildFixedVideoRenderPlan("react_reveal", {
      components: {
        hookCaption: "wait for it",
        payoffCaption: "this is the reveal",
      },
      stagedMedia: {
        anticipation: { localFilePath: "/tmp/a.mp4", fileName: "a.mp4" },
        reveal: { localFilePath: "/tmp/b.mp4", fileName: "b.mp4" },
      },
    })

    expect(plan.rendiLocalInputs.map((item) => item.alias)).toEqual([
      "anticipation.mp4",
      "reveal.mp4",
    ])
    expect(plan.rendiCommandRequest.ffmpegCommand).toContain(
      "[anticipation][reveal]concat=n=2:v=1:a=0"
    )
    expect(plan.rendiCommandRequest.ffmpegCommand).not.toContain("-t ")
  })

  it("chroma-keys the full meme over a cover background with its caption", () => {
    const plan = buildFixedVideoRenderPlan("greenscreen_meme", {
      components: { caption: "when the client says one more change" },
      stagedMedia: {
        meme: { localFilePath: "/tmp/meme.mp4", fileName: "meme.mp4" },
        background: {
          localFilePath: "/tmp/background.jpg",
          fileName: "background.jpg",
        },
      },
    })

    expect(plan.rendiCommandRequest.ffmpegCommand).toContain(
      "chromakey=0x00FF00"
    )
    expect(plan.rendiCommandRequest.ffmpegCommand).toContain("overlay=")
    expect(plan.rendiCommandRequest.ffmpegCommand).toContain("drawtext=")
    expect(plan.rendiCommandRequest.ffmpegCommand).toContain("shortest=1")
  })
})
