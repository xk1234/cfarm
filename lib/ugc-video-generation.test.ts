import { describe, expect, it, vi } from "vitest"

import { fetchProductPage, validateUgcScriptPlan } from "@/lib/ugc-video-generation"

describe("UGC product fetching", () => {
  it("rejects private network URLs before fetch", async () => {
    const fetchImpl = vi.fn()
    await expect(
      fetchProductPage({ url: "http://127.0.0.1/secret", fetchImpl })
    ).rejects.toThrow(/private|local/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("validates all narrative phases", () => {
    expect(() =>
      validateUgcScriptPlan({
        hook: "Hi",
        segments: [{ phase: "hook", spokenText: "Hi", durationSeconds: 2 }],
        caption: "",
        hashtags: [],
      })
    ).toThrow(/problem/i)
  })
})
