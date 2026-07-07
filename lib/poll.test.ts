import { describe, expect, it, vi } from "vitest"

import { pollUntil } from "@/lib/poll"

describe("pollUntil", () => {
  it("returns the first non-null result and waits between attempts", async () => {
    vi.useFakeTimers()
    const results: Array<string | null> = [null, null, "done"]
    const fn = vi.fn(() => results.shift() ?? null)

    const pending = pollUntil(fn, {
      intervalMs: 1000,
      maxAttempts: 3,
      description: "test operation",
    })

    await vi.advanceTimersByTimeAsync(2000)

    await expect(pending).resolves.toBe("done")
    expect(fn).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it("throws a descriptive timeout after the final attempt", async () => {
    vi.useFakeTimers()
    const pending = pollUntil(() => null, {
      intervalMs: 250,
      maxAttempts: 2,
      description: "test operation",
    })

    await vi.advanceTimersByTimeAsync(250)

    await expect(pending).rejects.toThrow(
      "Timed out waiting for test operation after 2 attempts"
    )
    vi.useRealTimers()
  })
})
