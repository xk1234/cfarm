import { describe, expect, it } from "vitest"

import { loadRealFarmData } from "./realfarm-data"

describe("loadRealFarmData", () => {
  it("loads the workspace brand without the removed bundled video assets", async () => {
    const data = await loadRealFarmData()

    expect(data).toEqual({ brand: { name: "LumenClip" } })
  })
})
