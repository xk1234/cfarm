import { afterEach, describe, expect, it, vi } from "vitest"

import { providerFetch } from "@/lib/provider-fetch"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("providerFetch", () => {
  it("retries transient provider responses with a bounded budget", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: "busy" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ error: "busy" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)
    const response = await providerFetch("https://provider.test/transient", {
      retries: 2,
    })

    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("does not retry a non-transient client error", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: "invalid" }, { status: 400 }))
    vi.stubGlobal("fetch", fetchMock)
    const response = await providerFetch("https://provider.test/invalid", {
      retries: 2,
    })

    expect(response.status).toBe(400)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
