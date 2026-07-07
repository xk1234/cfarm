import { describe, expect, it } from "vitest"

import {
  buildCharacterPostprocessFfmpegCommand,
  buildMicroCutSegments,
  buildMicroCutFilter,
  isAudioFilePath,
} from "@/lib/character-video-postprocess"

describe("character video postprocess helpers", () => {
  it("creates deterministic 0.2-0.3 second micro-cut segments", () => {
    const segments = buildMicroCutSegments({
      duration: 6,
      seed: 42,
      count: 3,
    })

    expect(segments).toHaveLength(3)
    expect(segments.every((segment) => segment.end > segment.start)).toBe(true)
    expect(
      segments.every((segment) => segment.end - segment.start >= 0.2)
    ).toBe(true)
    expect(
      segments.every((segment) => segment.end - segment.start <= 0.3)
    ).toBe(true)
    expect(segments[0].start).toBeGreaterThanOrEqual(0.5)
    expect(segments.at(-1)?.end).toBeLessThanOrEqual(5.5)
  })

  it("builds a select filter that removes the micro cuts", () => {
    expect(
      buildMicroCutFilter([
        { start: 1, end: 1.25 },
        { start: 3, end: 3.2 },
      ])
    ).toBe(
      "select='not(between(t,1.000,1.250)+between(t,3.000,3.200))',setpts=N/FRAME_RATE/TB"
    )
  })

  it("recognizes local audio files for random music selection", () => {
    expect(isAudioFilePath("data/music/song.mp3")).toBe(true)
    expect(isAudioFilePath("data/music/song.WAV")).toBe(true)
    expect(isAudioFilePath("data/music/video.mp4")).toBe(false)
  })

  it("builds the Rendi FFmpeg command with aliases instead of local paths", () => {
    expect(
      buildCharacterPostprocessFfmpegCommand({
        videoFilter: "setpts=N/FRAME_RATE/TB",
        hasMusic: true,
      })
    ).toBe(
      '-i {{in_video}} -stream_loop -1 -i {{in_music}} -vf "setpts=N/FRAME_RATE/TB" -map 0:v:0 -map 1:a:0 -shortest -af volume=0.45 -c:v libx264 -pix_fmt yuv420p -movflags +faststart {{out_video}}'
    )
  })
})
