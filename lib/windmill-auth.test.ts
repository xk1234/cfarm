import { afterEach, describe, expect, it, vi } from "vitest"

import { authorizeWindmillRequest } from "@/lib/windmill-auth"

afterEach(() => vi.unstubAllEnvs())

describe("authorizeWindmillRequest", () => {
  it("accepts only the configured bearer secret", () => {
    vi.stubEnv("WINDMILL_SHARED_SECRET", "shared-secret")

    expect(authorizeWindmillRequest("Bearer shared-secret")).toBe(true)
    expect(authorizeWindmillRequest("Bearer wrong-secret")).toBe(false)
    expect(authorizeWindmillRequest(null)).toBe(false)
  })

  it("stays closed when no secret is configured", () => {
    vi.stubEnv("WINDMILL_SHARED_SECRET", "")
    expect(authorizeWindmillRequest("Bearer anything")).toBe(false)
  })
})
