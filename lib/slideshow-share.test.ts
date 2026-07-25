import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createSlideshowShareToken,
  verifySlideshowShareToken,
} from "@/lib/slideshow-share"

describe("slideshow public share tokens", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("binds a token to the owner, output, and expiry", () => {
    vi.stubEnv("SLIDESHOW_SHARE_SECRET", "test-secret")
    const token = createSlideshowShareToken({
      ownerId: "owner-1",
      outputId: "slideshow-1",
      expiresAt: new Date(Date.now() + 60_000),
    })

    expect(verifySlideshowShareToken(token, "slideshow-1")).toMatchObject({
      ownerId: "owner-1",
      outputId: "slideshow-1",
    })
    expect(verifySlideshowShareToken(token, "slideshow-2")).toBeNull()
    expect(verifySlideshowShareToken(`${token}x`, "slideshow-1")).toBeNull()
  })
})
