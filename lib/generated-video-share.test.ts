import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createGeneratedVideoShareToken,
  verifyGeneratedVideoShareToken,
} from "@/lib/generated-video-share"

describe("generated-video public share tokens", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("binds a token to the owner, output, and expiry", () => {
    vi.stubEnv("OUTPUT_SHARE_SECRET", "test-secret")
    const token = createGeneratedVideoShareToken({
      ownerId: "owner-1",
      outputId: "video-1",
      expiresAt: new Date(Date.now() + 60_000),
    })

    expect(verifyGeneratedVideoShareToken(token, "video-1")).toMatchObject({
      ownerId: "owner-1",
      outputId: "video-1",
    })
    expect(verifyGeneratedVideoShareToken(token, "video-2")).toBeNull()
    expect(verifyGeneratedVideoShareToken(`${token}x`, "video-1")).toBeNull()
  })

  it("rejects expired tokens", () => {
    vi.stubEnv("OUTPUT_SHARE_SECRET", "test-secret")
    const token = createGeneratedVideoShareToken({
      ownerId: "owner-1",
      outputId: "video-1",
      expiresAt: new Date(Date.now() - 1_000),
    })

    expect(verifyGeneratedVideoShareToken(token, "video-1")).toBeNull()
  })
})
