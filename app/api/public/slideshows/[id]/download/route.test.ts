import JSZip from "jszip"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loadSharedSlideshow: vi.fn(),
  readAssetBytes: vi.fn(),
}))

vi.mock("@/lib/slideshow-share", () => ({
  loadSharedSlideshow: mocks.loadSharedSlideshow,
}))
vi.mock("@/lib/asset-storage", () => ({
  readAssetBytes: mocks.readAssetBytes,
}))

import { GET } from "@/app/api/public/slideshows/[id]/download/route"

describe("public slideshow ZIP download", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadSharedSlideshow.mockResolvedValue({
      id: "output-1",
      title: "Astrology Test",
      output_images: [
        "/api/local-assets/slideshows/outputs/output-1/slide-001.png",
        "/api/local-assets/slideshows/outputs/output-1/slide-002.png",
      ],
    })
    mocks.readAssetBytes
      .mockResolvedValueOnce(Buffer.from("first"))
      .mockResolvedValueOnce(Buffer.from("second"))
  })

  it("builds the archive from storage without fetching protected URLs", async () => {
    const response = await GET(
      new Request(
        "https://app.example.com/api/public/slideshows/output-1/download?token=signed"
      ),
      { params: Promise.resolve({ id: "output-1" }) }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/zip")
    expect(response.headers.get("content-disposition")).toContain(
      'filename="astrology-test.zip"'
    )
    expect(Number(response.headers.get("content-length"))).toBeGreaterThan(0)
    expect(mocks.readAssetBytes).toHaveBeenCalledTimes(2)

    const zip = await JSZip.loadAsync(await response.arrayBuffer())
    await expect(zip.file("slide-01.png")?.async("string")).resolves.toBe(
      "first"
    )
    await expect(zip.file("slide-02.png")?.async("string")).resolves.toBe(
      "second"
    )
  })
})
