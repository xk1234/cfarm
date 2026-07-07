import { afterEach, describe, expect, it, vi } from "vitest"

const runPinterestImportMock = vi.hoisted(() =>
  vi.fn(async () => [
    {
      id: "pin-1",
      title: "Pin 1",
      description: "Pinterest result",
      imageUrl: "https://i.pinimg.com/example.jpg",
      sourceUrl: "https://www.pinterest.com/pin/1/",
      dominantColor: "#ffffff",
    },
  ])
)

vi.mock("@/lib/pinterest-search", () => ({
  runPinterestImport: runPinterestImportMock,
}))

import { POST } from "./route"

afterEach(() => {
  vi.unstubAllEnvs()
  runPinterestImportMock.mockClear()
})

describe("POST /api/pinterest/search", () => {
  it("returns a configuration error when APIFY_KEY is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/pinterest/search", {
        method: "POST",
        body: JSON.stringify({
          query: "kitchen",
          apiKey: "client-supplied-key",
        }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toBe("APIFY_KEY is not configured")
    expect(runPinterestImportMock).not.toHaveBeenCalled()
  })

  it("uses the server APIFY_KEY and ignores payload apiKey", async () => {
    vi.stubEnv("APIFY_KEY", "server-key")

    const response = await POST(
      new Request("http://localhost/api/pinterest/search?limit=5", {
        method: "POST",
        body: JSON.stringify({
          query: "kitchen",
          apiKey: "client-supplied-key",
          mode: "board",
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(runPinterestImportMock).toHaveBeenCalledWith(
      "kitchen",
      5,
      "server-key",
      "board"
    )
  })
})
