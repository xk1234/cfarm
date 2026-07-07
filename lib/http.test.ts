import { describe, expect, it, vi } from "vitest"

import { fetchJson } from "@/lib/http"

describe("HTTP helpers", () => {
  it("includes status and a truncated body snippet for failed JSON requests", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        "this body is intentionally long enough to be clipped from the error message",
        { status: 502, statusText: "Bad Gateway" }
      )
    })

    await expect(
      fetchJson("https://example.com/api", undefined, {
        fetchImpl,
        bodySnippetLength: 24,
      })
    ).rejects.toThrow(
      "HTTP request failed with 502 Bad Gateway: this body is intention..."
    )
  })

  it("throws a clear error when a successful response is not JSON", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response("<html>not json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    })

    await expect(
      fetchJson("https://example.com/api", undefined, { fetchImpl })
    ).rejects.toThrow(
      "Expected JSON response from https://example.com/api but could not parse body"
    )
  })
})
