import { describe, expect, it } from "vitest"

import { loadRealFarmData } from "./realfarm-data"

describe("loadRealFarmData", () => {
  it("loads the JSON DB shape needed by the RealFarm workspace", () => {
    const data = loadRealFarmData()

    expect(data.brand.name).toBe("ReelFarm")
    expect(data.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "New Slideshow",
          status: "draft",
        }),
      ])
    )
    expect(data.automations).toHaveLength(6)
    expect(data.imageCollections[0]).toMatchObject({
      title: "All Images",
      imageCount: 1210,
    })
    expect(data.ugcAds.hooks[0]).toContain("watch this quick video")
    expect(data.assets.music.length).toBeGreaterThan(0)
    expect(data.assets.greenscreenMemes.length).toBeGreaterThan(90)
    expect(data.assets.ctas[0]).toHaveProperty("text")
    expect(data.generatedAssets.higgsfieldCharacter.model).toBe("Higgsfield Soul V2")
    expect(data.defaultCollections.backgrounds.images).toHaveLength(10)
  })
})
