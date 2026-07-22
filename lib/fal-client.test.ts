import { describe, expect, it, vi } from "vitest"

import { falSubmitAndWait } from "@/lib/fal-client"

describe("FAL fetch client", () => {
  it("submits, polls and reads a queue result", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: "req-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ images: [{ url: "https://cdn/x.png" }] }), { status: 200 }))
    await expect(falSubmitAndWait({ endpoint: "fal/test", input: {}, apiKey: "key", fetchImpl, pollDelayMs: 0 })).resolves.toMatchObject({ images: expect.any(Array) })
  })
})
