import { afterEach, describe, expect, it, vi } from "vitest"

import {
  absoluteAssetUrl,
  configuredBaseUrl,
  slideshowDeliveryLinks,
} from "@/lib/asset-urls"
import { verifySlideshowShareToken } from "@/lib/slideshow-share"

const originalBaseUrl = process.env.BASE_URL
const originalSecret = process.env.SLIDESHOW_SHARE_SECRET
const originalApiKey = process.env.APPWRITE_API_KEY

afterEach(() => {
  vi.unstubAllEnvs()
  if (originalBaseUrl === undefined) delete process.env.BASE_URL
  else process.env.BASE_URL = originalBaseUrl
  if (originalSecret === undefined) delete process.env.SLIDESHOW_SHARE_SECRET
  else process.env.SLIDESHOW_SHARE_SECRET = originalSecret
  if (originalApiKey === undefined) delete process.env.APPWRITE_API_KEY
  else process.env.APPWRITE_API_KEY = originalApiKey
})

describe("absoluteAssetUrl", () => {
  it("prefixes relative paths with BASE_URL, stripping its trailing slash", () => {
    vi.stubEnv("BASE_URL", "https://studio.example.com/")
    expect(
      absoluteAssetUrl(
        "/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png"
      )
    ).toBe(
      "https://studio.example.com/api/local-assets/slideshows/outputs/slideshow-1/slide-001.png"
    )
  })

  it("leaves already-absolute http(s) URLs untouched", () => {
    vi.stubEnv("BASE_URL", "https://studio.example.com")
    expect(absoluteAssetUrl("https://example.com/output.jpg")).toBe(
      "https://example.com/output.jpg"
    )
    expect(absoluteAssetUrl("http://example.com/output.jpg")).toBe(
      "http://example.com/output.jpg"
    )
  })

  it("returns the relative path unchanged when BASE_URL is unset", () => {
    delete process.env.BASE_URL
    expect(configuredBaseUrl()).toBe("")
    expect(
      absoluteAssetUrl("/api/local-assets/slideshows/outputs/s-1/slide-001.png")
    ).toBe("/api/local-assets/slideshows/outputs/s-1/slide-001.png")
  })
})

describe("slideshowDeliveryLinks", () => {
  it("returns signed public preview and direct ZIP URLs with one token", () => {
    vi.stubEnv("BASE_URL", "https://studio.example.com/")
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "test-secret")

    const delivery = slideshowDeliveryLinks({
      ownerId: "owner-1",
      outputId: "slideshow-1",
    })

    expect(delivery).not.toBeNull()
    expect(delivery?.previewUrl).toMatch(
      /^https:\/\/studio\.example\.com\/share\/slideshows\/slideshow-1\?token=/
    )
    expect(delivery?.downloadUrl).toMatch(
      /^https:\/\/studio\.example\.com\/api\/public\/slideshows\/slideshow-1\/download\?token=/
    )
    const previewToken = new URL(delivery?.previewUrl ?? "").searchParams.get(
      "token"
    )
    const downloadToken = new URL(delivery?.downloadUrl ?? "").searchParams.get(
      "token"
    )
    expect(downloadToken).toBe(previewToken)
    expect(
      verifySlideshowShareToken(downloadToken ?? "", "slideshow-1")
    ).toMatchObject({
      ownerId: "owner-1",
      outputId: "slideshow-1",
    })
  })

  it("returns relative delivery paths without BASE_URL", () => {
    delete process.env.BASE_URL
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "test-secret")

    expect(
      slideshowDeliveryLinks({
        ownerId: "owner-1",
        outputId: "slideshow-1",
      })
    ).toMatchObject({
      previewUrl: expect.stringMatching(
        /^\/share\/slideshows\/slideshow-1\?token=/
      ),
      downloadUrl: expect.stringMatching(
        /^\/api\/public\/slideshows\/slideshow-1\/download\?token=/
      ),
    })
  })

  it("returns null when sharing is not configured", () => {
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "")
    vi.stubEnv("APPWRITE_API_KEY", "")

    expect(
      slideshowDeliveryLinks({
        ownerId: "owner-1",
        outputId: "slideshow-1",
      })
    ).toBeNull()
  })
})
