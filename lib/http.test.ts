import { describe, expect, it } from "vitest"

import { providerErrorMessage } from "@/lib/http"

const res = (status: number) => new Response("", { status })

describe("providerErrorMessage", () => {
  it("keeps the provider's reason and metadata, not just a label", () => {
    // The bare-label version of this hid a robots.txt refusal for hours.
    const message = providerErrorMessage("AI image matching failed")(
      res(400),
      {
        error: {
          message: "Provider returned error",
          metadata: { raw: "This URL is disallowed by the website's robots.txt file." },
        },
      }
    )
    expect(message).toContain("AI image matching failed (400)")
    expect(message).toContain("Provider returned error")
    expect(message).toContain("robots.txt")
  })

  it("falls back to a body snippet when there is no error object", () => {
    const message = providerErrorMessage("Thing failed")(res(500), {
      unexpected: "shape",
    })
    expect(message).toContain("Thing failed (500)")
    expect(message).toContain("unexpected")
  })

  it("still reports the status when the body is empty", () => {
    expect(providerErrorMessage("Thing failed")(res(502), null)).toBe(
      "Thing failed (502)"
    )
  })
})
