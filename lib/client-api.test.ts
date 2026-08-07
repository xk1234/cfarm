import { afterEach, describe, expect, it, vi } from "vitest"

import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { toast } from "sonner"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("client API helpers", () => {
  it("includes the Appwrite session cookie on API requests", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)

    await fetchJsonWithTimeout("/api/templates/run", { method: "POST" })

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/templates/run",
      expect.objectContaining({
        credentials: "same-origin",
        method: "POST",
      })
    )
  })

  it("uses API error payloads for visible error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Image generation timed out" }, { status: 504 })
      )
    )

    await expect(
      fetchJsonWithTimeout("/api/image-collections/captions")
    ).rejects.toMatchObject({
      message: "Image generation timed out",
      status: 504,
      timedOut: false,
    })
    expect(toast.error).toHaveBeenCalledWith("Image generation timed out")
  })

  it("allows callers with managed loading toasts to suppress the default alert", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Upload failed" }, { status: 500 })
      )
    )

    await expect(
      fetchJsonWithTimeout("/api/assets/upload", { toastOnError: false })
    ).rejects.toMatchObject({
      message: "Upload failed",
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("marks aborted requests as timeouts with a friendly message", async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(
                Object.assign(new Error("The operation was aborted."), {
                  name: "AbortError",
                })
              )
            })
          })
      )
    )

    const request = fetchJsonWithTimeout("/api/slow", { timeoutMs: 15 })
    const expectation = expect(request).rejects.toMatchObject({
      message: "Request timed out. Please try again.",
      timedOut: true,
    })

    await vi.advanceTimersByTimeAsync(15)
    await expectation
  })

  it("normalizes unknown caught values for toast notifications", () => {
    expect(getApiErrorMessage("nope", "Fallback")).toBe("Fallback")
    expect(getApiErrorMessage(new Error("Specific failure"), "Fallback")).toBe(
      "Specific failure"
    )
  })
})
