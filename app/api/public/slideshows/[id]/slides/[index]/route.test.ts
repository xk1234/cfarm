import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loadSharedSlideshow: vi.fn(),
  railwayFileResponse: vi.fn(),
}))

vi.mock("@/lib/slideshow-share", () => ({
  loadSharedSlideshow: mocks.loadSharedSlideshow,
}))
vi.mock("@/lib/railway/storage-response", () => ({
  railwayFileResponse: mocks.railwayFileResponse,
}))

import { GET } from "@/app/api/public/slideshows/[id]/slides/[index]/route"

describe("public slideshow image route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadSharedSlideshow.mockResolvedValue({
      output_images: [
        "/api/local-assets/slideshows/outputs/output-1/slide-001.png",
      ],
    })
    mocks.railwayFileResponse.mockResolvedValue(
      new Response("image", {
        headers: { "content-type": "image/png" },
      })
    )
  })

  it("serves a signed slide from Railway object storage", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/public/slideshows/output-1/slides/1?token=signed"
      ),
      { params: Promise.resolve({ id: "output-1", index: "1" }) }
    )

    expect(response.status).toBe(200)
    expect(mocks.loadSharedSlideshow).toHaveBeenCalledWith("output-1", "signed")
    expect(mocks.railwayFileResponse).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png" })
    )
  })

  it("does not expose arbitrary output paths", async () => {
    mocks.loadSharedSlideshow.mockResolvedValue({
      output_images: ["/api/local-assets/assets/files/private.png"],
    })
    const response = await GET(
      new Request(
        "https://app.example.com/api/public/slideshows/output-1/slides/1?token=signed"
      ),
      { params: Promise.resolve({ id: "output-1", index: "1" }) }
    )
    expect(response.status).toBe(404)
    expect(mocks.railwayFileResponse).not.toHaveBeenCalled()
  })
})
