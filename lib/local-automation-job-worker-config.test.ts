import { describe, expect, it } from "vitest"

import { localAutomationJobTypes } from "@/lib/local-automation-job-worker-config"

describe("local automation job worker config", () => {
  it("does not claim cloud slideshow jobs by default", () => {
    expect(localAutomationJobTypes()).toEqual(["sync-post-analytics"])
  })

  it("never claims cloud slideshow jobs", () => {
    expect(localAutomationJobTypes()).not.toContain("run-automation")
  })
})
