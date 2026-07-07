import { afterEach, describe, expect, it, vi } from "vitest"

const lookupMock = vi.hoisted(() =>
  vi.fn(async () => [{ address: "93.184.216.34", family: 4 }])
)

vi.mock("node:dns", () => ({
  default: {
    promises: {
      lookup: lookupMock,
    },
  },
}))

import { GET } from "./route"

afterEach(() => {
  vi.unstubAllGlobals()
  lookupMock.mockReset()
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
})

describe("GET /api/image-proxy", () => {
  it("rejects non-http image URLs", async () => {
    const response = await GET(new Request("http://localhost/api/image-proxy?url=file:///etc/passwd"))

    expect(response.status).toBe(400)
  })

  it("rejects URLs that resolve to private addresses", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }])

    const response = await GET(
      new Request(
        "http://localhost/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fphoto.jpg"
      )
    )

    expect(response.status).toBe(400)
  })

  it("returns remote image bytes with a safe image content type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "content-length": "3",
        "content-type": "image/jpeg",
      },
    })))

    const response = await GET(new Request("http://localhost/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fphoto.jpg"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/jpeg")
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("revalidates and follows safe redirects", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: {
              location: "https://cdn.example.com/photo.jpg",
            },
          })
        )
        .mockResolvedValueOnce(
          new Response(new Uint8Array([4, 5, 6]), {
            headers: {
              "content-length": "3",
              "content-type": "image/png",
            },
          })
        )
    )

    const response = await GET(
      new Request(
        "http://localhost/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fphoto.jpg"
      )
    )

    expect(response.status).toBe(200)
    expect(lookupMock).toHaveBeenCalledWith("cdn.example.com", { all: true })
  })

  it("rejects unsupported remote content types", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", {
      headers: {
        "content-type": "text/html",
      },
    })))

    const response = await GET(new Request("http://localhost/api/image-proxy?url=https%3A%2F%2Fexample.com%2Fpage"))

    expect(response.status).toBe(415)
  })
})
