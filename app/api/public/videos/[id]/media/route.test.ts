import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loadSharedGeneratedVideo: vi.fn(),
  railwayFileResponse: vi.fn(),
}))

vi.mock("@/lib/generated-video-share", () => ({
  loadSharedGeneratedVideo: mocks.loadSharedGeneratedVideo,
}))
vi.mock("@/lib/railway/storage-response", () => ({
  railwayFileResponse: mocks.railwayFileResponse,
}))

import { GET } from "@/app/api/public/videos/[id]/media/route"

describe("public generated-video media route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadSharedGeneratedVideo.mockResolvedValue({
      videoUrl: "/api/local-assets/ugc_avatar_videos/owner-1/run-1/video.mp4",
      previewUrl:
        "/api/local-assets/ugc_avatar_videos/owner-1/run-1/thumbnail.jpg",
    })
    mocks.railwayFileResponse.mockResolvedValue(new Response("video"))
  })

  it("serves signed video media with range support", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/public/videos/video-1/media?kind=video&token=signed",
        { headers: { range: "bytes=0-1023" } }
      ),
      { params: Promise.resolve({ id: "video-1" }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.loadSharedGeneratedVideo).toHaveBeenCalledWith(
      "video-1",
      "signed"
    )
    expect(mocks.railwayFileResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "video/mp4",
        range: "bytes=0-1023",
      })
    )
  })

  it("supports legacy worker asset URLs during migration", async () => {
    mocks.loadSharedGeneratedVideo.mockResolvedValue({
      videoUrl: "/api/assets/ugc_avatar_videos/owner-1/run-1/video.mp4",
    })

    const response = await GET(
      new Request(
        "https://app.example.com/api/public/videos/video-1/media?token=signed&download=1"
      ),
      { params: Promise.resolve({ id: "video-1" }) }
    )

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="video.mp4"'
    )
  })

  it("does not expose arbitrary output paths", async () => {
    mocks.loadSharedGeneratedVideo.mockResolvedValue({
      videoUrl: "https://example.com/private.mp4",
    })
    const response = await GET(
      new Request(
        "https://app.example.com/api/public/videos/video-1/media?token=signed"
      ),
      { params: Promise.resolve({ id: "video-1" }) }
    )

    expect(response.status).toBe(404)
    expect(mocks.railwayFileResponse).not.toHaveBeenCalled()
  })
})
