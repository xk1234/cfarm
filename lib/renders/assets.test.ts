import { describe, expect, it } from "vitest"

import { AssetLoadError } from "@/lib/render/engine"
import { fetchRemoteImage, imageDimensions, sniffImageMime } from "@/lib/renders/assets"
import { TINY_PNG } from "@/lib/renders/test-fakes"

const publicOnly = async (url: string) => {
  if (/\/\/(127\.|10\.|169\.254\.|localhost)/.test(url)) throw new Error("private address")
}

describe("fetchRemoteImage", () => {
  it("fetches a public image and sniffs its type", async () => {
    const asset = await fetchRemoteImage("https://cdn.example/a", {
      guard: publicOnly,
      fetch: async () => new Response(TINY_PNG, { headers: { "content-type": "application/octet-stream" } }),
    })
    expect(asset.mime).toBe("image/png")
    expect(asset.bytes.byteLength).toBe(TINY_PNG.byteLength)
  })

  it("re-checks every redirect target against the SSRF guard", async () => {
    const error = await fetchRemoteImage("https://cdn.example/a", {
      guard: publicOnly,
      fetch: async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }),
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AssetLoadError)
    expect((error as AssetLoadError).code).toBe("asset.fetch_failed")
  })

  it("enforces the size cap while streaming", async () => {
    const error = await fetchRemoteImage("https://cdn.example/big", {
      guard: publicOnly,
      maxBytes: 10,
      fetch: async () => new Response(new Uint8Array(64)),
    }).catch((e: unknown) => e)
    expect((error as AssetLoadError).code).toBe("asset.too_large")
  })

  it("rejects non-images", async () => {
    const error = await fetchRemoteImage("https://cdn.example/page", {
      guard: publicOnly,
      fetch: async () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    }).catch((e: unknown) => e)
    expect((error as AssetLoadError).code).toBe("asset.unsupported_type")
  })
})

describe("image sniffing", () => {
  it("reads PNG type and dimensions", () => {
    expect(sniffImageMime(TINY_PNG)).toBe("image/png")
    expect(imageDimensions(TINY_PNG)).toEqual({ width: 1, height: 1 })
  })
})
