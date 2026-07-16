import { afterEach, describe, expect, it, vi } from "vitest"

import {
  effectivePostingMode,
  postFastSchedulePayload,
  renderSlideshowVideo,
  slideshowRunId,
} from "./slideshow-automation.js"
import { renderedSlideSvg as cloudRenderedSlideSvg } from "./slideshow-renderer.js"
import { renderedSlideSvg as appRenderedSlideSvg } from "../../../../lib/slideshow-renderer"

describe("cloud slideshow automation", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("derives a stable Appwrite-safe run id from automation and slot", () => {
    const first = slideshowRunId("automation-123", "2026-07-15T09:00:00.000Z")
    expect(first).toBe(
      slideshowRunId("automation-123", "2026-07-15T09:00:00.000Z")
    )
    expect(first).toMatch(/^arun[a-f0-9]{32}$/)
    expect(first).not.toBe(
      slideshowRunId("automation-123", "2026-07-15T10:00:00.000Z")
    )
  })

  it("defaults scheduled automation publishing to auto and respects overrides", () => {
    expect(
      effectivePostingMode({
        posting_mode: "manual",
        tiktok_post_settings: { auto_post: false },
      })
    ).toBe("manual")
    expect(
      effectivePostingMode({
        tiktok_post_settings: { auto_post: false },
      })
    ).toBe("auto")
  })

  it("always gives PostFast the durable job slot as a scheduled post", () => {
    expect(
      postFastSchedulePayload({
        content: "caption",
        integrationId: "tiktok-1",
        provider: "tiktok",
        scheduledFor: "2026-07-15T09:00:00.000Z",
        media: [{ key: "slide-1", type: "IMAGE", sortOrder: 0 }],
      })
    ).toMatchObject({
      status: "SCHEDULED",
      posts: [
        {
          scheduledAt: "2026-07-15T09:00:00.000Z",
          socialMediaId: "tiktok-1",
          status: "SCHEDULED",
          mediaItems: [{ key: "slide-1", type: "IMAGE", sortOrder: 0 }],
        },
      ],
    })
  })

  it("keeps the cloud SVG renderer byte-for-byte aligned with the app renderer", () => {
    const slide = {
      id: "slide-1",
      image_url: "source.jpg",
      imageFit: "cover",
      overlay: true,
      textItems: [
        {
          id: "hook",
          text: "a specific hook",
          fontSize: "14px",
          textSize: { width: 74, height: 18 },
          textStyle: "outline",
          textAlign: "center",
          textAnchor: "padded",
          textVerticalAnchor: "padded",
          textPlacement: "top",
          textPosition: { x: 50, y: 16 },
        },
      ],
    }
    const source = "data:image/jpeg;base64,YQ=="
    expect(
      cloudRenderedSlideSvg(slide, source, undefined, {
        aspectRatio: "9:16",
        font: "TikTok Display Medium",
      })
    ).toBe(
      appRenderedSlideSvg(slide, source, undefined, {
        aspectRatio: "9:16",
        font: "TikTok Display Medium",
      })
    )
  })

  it("exports requested video slideshows through Rendi and stores both artifacts in Appwrite", async () => {
    vi.stubEnv("RENDI_API_KEY", "test-rendi-key")
    vi.stubGlobal(
      "fetch",
      vi.fn(async (rawUrl) => {
        const url = String(rawUrl)
        if (url.endsWith("/v1/files/init-upload")) {
          return Response.json({
            file_id: "file-1",
            part_size: 1024,
            upload_urls: ["https://uploads.rendi.test/part-1"],
          })
        }
        if (url === "https://uploads.rendi.test/part-1") {
          return new Response(null, {
            status: 200,
            headers: { etag: "part-etag" },
          })
        }
        if (url.endsWith("/v1/files/file-1/complete-upload")) {
          return Response.json({
            file_id: "file-1",
            status: "STORED",
            storage_url: "https://storage.rendi.test/slide.png",
          })
        }
        if (url.endsWith("/v1/run-ffmpeg-command")) {
          return Response.json({ command_id: "command-1" })
        }
        if (url.endsWith("/v1/commands/command-1")) {
          return Response.json({
            status: "SUCCESS",
            output_files: {
              out_video: {
                storage_url: "https://storage.rendi.test/export.mp4",
              },
            },
          })
        }
        if (url === "https://storage.rendi.test/export.mp4") {
          return new Response(Buffer.from("online mp4"), { status: 200 })
        }
        throw new Error(`Unexpected fetch: ${url}`)
      })
    )
    const storage = {
      createFile: vi.fn(async () => ({})),
      deleteFile: vi.fn(async () => ({})),
    }

    const result = await renderSlideshowVideo({
      storage,
      slideshowId: "slideshow-run-1",
      renderedBuffers: [Buffer.from("png frame")],
      durationSeconds: 4,
    })

    expect(result.videoUrl).toBe(
      "/api/local-assets/slideshows/outputs/slideshow-run-1/slideshow-export.mp4"
    )
    expect(result.thumbnailUrl).toBe(
      "/api/local-assets/slideshows/outputs/slideshow-run-1/slideshow-thumbnail.png"
    )
    expect(result.buffer.toString()).toBe("online mp4")
    expect(storage.createFile).toHaveBeenCalledTimes(2)
  })

  it("fails requested video exports when Rendi is not configured", async () => {
    vi.stubEnv("RENDI_API_KEY", "")
    await expect(
      renderSlideshowVideo({
        storage: {},
        slideshowId: "slideshow-run-1",
        renderedBuffers: [Buffer.from("png frame")],
        durationSeconds: 4,
      })
    ).rejects.toThrow("RENDI_API_KEY is not configured")
  })
})
