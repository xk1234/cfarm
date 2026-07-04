import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

describe("generated video renderer", () => {
  it("does not silently export UGC avatar placeholders when a selected avatar video fails to load", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "generated-video-renderer.ts"), "utf8")

    expect(source).toContain("Selected UGC avatar video could not be loaded")
    expect(source).toContain("input.avatarVideoUrl && !video")
  })

  it("does not silently export greenscreen placeholders when a selected meme video fails to load", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "generated-video-renderer.ts"), "utf8")

    expect(source).toContain("Selected greenscreen video could not be loaded")
    expect(source).toContain("input.memeUrl && !video")
  })

  it("does not draw the canvas progress bar into final UGC ad exports", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "generated-video-renderer.ts"), "utf8")
    const ugcRenderer = source.slice(
      source.indexOf("export async function renderAndUploadUgcAdVideo"),
      source.indexOf("export async function renderAndUploadGreenscreenVideo"),
    )

    expect(ugcRenderer).not.toContain("drawProgressBar")
  })

  it("does not draw the preview progress bar into final Greenscreen exports", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "generated-video-renderer.ts"), "utf8")
    const greenscreenRenderer = source.slice(
      source.indexOf("export async function renderAndUploadGreenscreenVideo"),
      source.indexOf("async function uploadGeneratedVideo"),
    )

    expect(greenscreenRenderer).not.toContain("drawProgressBar")
  })

  it("proxies remote Greenscreen backgrounds before drawing them into canvas", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "generated-video-renderer.ts"), "utf8")

    expect(source).toContain("safeCanvasImageSrc")
    expect(source).toContain("/api/image-proxy?url=")
    expect(source).toContain("encodeURIComponent(url.toString())")
  })

  it("captures and uploads poster thumbnails with generated videos", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "generated-video-renderer.ts"), "utf8")

    expect(source).toContain("thumbnailUrl")
    expect(source).toContain("canvasToBlob")
    expect(source).toContain("-thumbnail.jpg")
  })

  it("records MediaRecorder chunks without duplicating the dataavailable guard", () => {
    const source = readFileSync(path.join(process.cwd(), "components", "realfarm", "generated-video-renderer.ts"), "utf8")
    const recorderBlock = source.slice(source.indexOf('recorder.addEventListener("dataavailable"'), source.indexOf('recorder.addEventListener("error"'))

    expect(recorderBlock.match(/event\.data\.size > 0/g)).toHaveLength(1)
    expect(recorderBlock).toContain("chunks.push(event.data)")
  })
})
