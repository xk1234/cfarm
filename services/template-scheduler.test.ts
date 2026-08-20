import { describe, expect, it, vi } from "vitest"

import scheduler from "@/services/template-scheduler"

describe("Railway template scheduler", () => {
  it("remains disabled while generation is manual", async () => {
    const log = vi.fn()

    await expect(scheduler({ log, error: vi.fn() })).resolves.toEqual({
      ok: true,
      disabled: true,
      templates: 0,
      enqueued: 0,
      duplicates: 0,
    })
    expect(log).toHaveBeenCalledWith(
      "template scheduler disabled: templates generate drafts on demand"
    )
  })
})
