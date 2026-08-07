import { describe, expect, it, vi } from "vitest"

import scheduler from "./main.js"

describe("template scheduler", () => {
  it("does not read templates or enqueue timed generation jobs", async () => {
    const log = vi.fn()

    await expect(scheduler({ log })).resolves.toEqual({
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
