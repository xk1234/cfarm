import { describe, expect, it, vi } from "vitest"

import { uploadPostFastMediaSources } from "@/lib/postfast-media-upload"

describe("uploadPostFastMediaSources", () => {
  it("loads rendered media, uploads it, and preserves slide order", async () => {
    const requestMock = vi.fn(async (_path: string, _options: unknown) => [
      { key: "image/slide-1.png", signedUrl: "https://upload.test/1" },
      { key: "image/slide-2.png", signedUrl: "https://upload.test/2" },
    ])
    const request = async <T>(path: string, options: unknown) =>
      (await requestMock(path, options)) as T
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.startsWith("https://source.test/")) {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "image/png" },
        })
      }
      return new Response(null, { status: 200 })
    })

    const media = await uploadPostFastMediaSources({
      urls: [
        "https://source.test/slide-1.png",
        "https://source.test/slide-2.png",
      ],
      request,
      fetcher,
    })

    expect(requestMock).toHaveBeenCalledWith("/file/get-signed-upload-urls", {
      body: { contentType: "image/png", count: 2 },
    })
    expect(media).toEqual([
      { key: "image/slide-1.png", type: "IMAGE", sortOrder: 0 },
      { key: "image/slide-2.png", type: "IMAGE", sortOrder: 1 },
    ])
    expect(fetcher).toHaveBeenCalledWith(
      "https://upload.test/1",
      expect.objectContaining({ method: "PUT" })
    )
  })

  it("refuses to create a caption-only post when rendered media is missing", async () => {
    await expect(uploadPostFastMediaSources({ urls: [] })).rejects.toThrow(
      "no media"
    )
  })
})
