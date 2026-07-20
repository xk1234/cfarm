import { describe, expect, it } from "vitest"

import type { MediaLibraryAsset } from "./media-library"
import { loadRealFarmData } from "./realfarm-data"
import { getOrderedUgcAvatarVideos } from "./ugc-avatar-videos"

const avatarUrls = [
  "323e6dbd-d758-47cb-90a0-a0882c24edf8.mp4",
  "a7f9bb9b-0930-47ea-81c5-11f564a4186c.mp4",
  "eefa44a6-06dd-46f6-ab15-5752c0e0a438.mp4",
  "d4b06027-bafa-4ad6-ab2d-3150f611b523.mp4",
  "1db061c7-b74b-46f7-836d-fbd55d2a10ae.mp4",
  "64433b36-889f-44fe-857f-f78d95aee723.mp4",
  "3e0d22c7-fc76-4943-b436-a57f54a927ce.mp4",
]
const mediaAssets: MediaLibraryAsset[] = [
  ...avatarUrls.map((fileName) => ({
    id: fileName,
    name: fileName,
    path: `ugc_avatar_videos/${fileName}`,
    url: `/api/local-assets/ugc_avatar_videos/${fileName}`,
    kind: "video" as const,
    collection: "ugc_avatar_videos" as const,
  })),
  {
    id: "music-track",
    name: "Music track",
    path: "music/track.mp3",
    url: "/api/local-assets/music/track.mp3",
    kind: "audio",
    collection: "music",
  },
  {
    id: "greenscreen-clip",
    name: "Greenscreen clip",
    path: "greenscreen_memes/clip.mp4",
    url: "/api/local-assets/greenscreen_memes/clip.mp4",
    kind: "video",
    collection: "greenscreen_memes",
  },
  {
    id: "cta",
    name: "CTA",
    path: "ctas/start-free.txt",
    url: "/api/local-assets/ctas/start-free.txt",
    kind: "text",
    collection: "ctas",
    text: "Start free",
  },
]

describe("loadRealFarmData", () => {
  it("loads the JSON DB shape needed by the RealFarm workspace", async () => {
    const data = await loadRealFarmData({ mediaAssets })

    expect(data.brand.name).toBe("LumenClip")
    expect(data.projects).toEqual([])
    expect(data.automations).toEqual([])
    expect(data.imageCollections).toEqual([])
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
    expect(data.defaultCollections.backgrounds.images).toEqual([])
  })

  it("loads demo seed records only when explicitly requested", async () => {
    const data = await loadRealFarmData({
      includeDemoSeed: true,
      mediaAssets,
    })

    expect(data.imageCollections.map((collection) => collection.title)).toEqual(
      expect.arrayContaining([
        "Pinterest - the wolf of wall street screencaps",
        "Pinterest - nature textures",
        "Pinterest - space",
      ])
    )
  })
})
