import { describe, expect, it } from "vitest"
import { publicOrigin } from "./public-origin"

const headers = (h: Record<string, string>) => new Headers(h)

describe("publicOrigin", () => {
  it("prefers BASE_URL", () => {
    expect(
      publicOrigin(
        "http://localhost:3000/api/v1/renders",
        headers({ "x-forwarded-host": "x.dev" }),
        { BASE_URL: "https://lumenclip.com/" }
      )
    ).toBe("https://lumenclip.com")
  })
  it("uses forwarded host and proto behind a proxy", () => {
    expect(
      publicOrigin(
        "http://localhost:3000/a",
        headers({
          "x-forwarded-host": "lumenclip.com",
          "x-forwarded-proto": "https",
        }),
        {}
      )
    ).toBe("https://lumenclip.com")
  })
  it("falls back to the request origin", () => {
    expect(publicOrigin("http://localhost:3000/a", headers({}), {})).toBe(
      "http://localhost:3000"
    )
  })
})
