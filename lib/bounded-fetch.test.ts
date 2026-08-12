import { describe, expect, it } from "vitest"

import { PayloadTooLargeError, readResponseBytes } from "@/lib/bounded-fetch"

describe("readResponseBytes", () => {
  it("rejects oversized declared responses before buffering", async () => {
    const response = new Response("small", {
      headers: { "content-length": "100" },
    })
    await expect(readResponseBytes(response, 10)).rejects.toBeInstanceOf(
      PayloadTooLargeError
    )
  })

  it("aborts a chunked response as soon as it crosses the byte limit", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.enqueue(new Uint8Array([4, 5, 6]))
          controller.close()
        },
      })
    )
    await expect(readResponseBytes(response, 5)).rejects.toBeInstanceOf(
      PayloadTooLargeError
    )
  })
})
