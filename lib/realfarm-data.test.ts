import { describe, expect, it } from "vitest"

import { loadRealFarmData } from "./realfarm-data"
import { getOrderedUgcAvatarVideos } from "./ugc-avatar-videos"

describe("loadRealFarmData", () => {
  it("loads the JSON DB shape needed by the RealFarm workspace", () => {
    const data = loadRealFarmData()

    expect(data.brand.name).toBe("ReelFarm")
    expect(data.projects).toEqual([])
    expect(data.automations).toEqual([])
    expect(data.imageCollections[0]).toMatchObject({
      title: "All Images",
      imageCount: 1210,
    })
    expect(data.ugcAds.hooks[0]).toContain("watch this quick video")
    expect(data.assets.ugcAvatarVideos).toHaveLength(7)
    expect(data.assets.ugcAvatarVideos[0].url).toMatch(
      /^\/api\/local-assets\/ugc_avatar_videos\/.+\.mp4$/
    )
    expect(getOrderedUgcAvatarVideos(data)[0].url).toBe(
      "/api/local-assets/ugc_avatar_videos/323e6dbd-d758-47cb-90a0-a0882c24edf8.mp4"
    )
    expect(data.assets.music.length).toBeGreaterThan(0)
    expect(data.assets.greenscreenMemes.length).toBeGreaterThan(0)
    expect(data.assets.ctas[0]).toHaveProperty("text")
    expect(data.generatedAssets.higgsfieldCharacter.model).toBe(
      "Higgsfield Soul V2"
    )
    expect(data.defaultCollections.backgrounds.images).toHaveLength(10)
  })
})
