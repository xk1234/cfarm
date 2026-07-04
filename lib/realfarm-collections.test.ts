import { describe, expect, it } from "vitest"

import {
  collectionAliases,
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"

describe("realfarm collection helpers", () => {
  it("matches imported Reelfarm community collection ids from local asset filenames", () => {
    const collections: CreatedImageCollection[] = [
      {
        id: "collection-youtube-videos-ndes-overlays-2026-07-03t00-00-00-000z",
        title: "YouTube videos (NDEs) (Overlays)",
        createdAt: "2026-07-03T00:00:00.000Z",
        source: "pinterest",
        images: [
          {
            id: "stored-youtube-videos-ndes-overlays-0",
            title: "Overlay",
            description: "Overlay",
            imageUrl: "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
            sourceUrl: "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
            dominantColor: "#d9d8d0",
          },
        ],
      },
    ]

    expect(collectionAliases(collections[0])).toContain("community_collection_11436")
    expect(findCollectionByIdOrAlias(collections, "community_collection_11436")?.id).toBe(
      "collection-youtube-videos-ndes-overlays-2026-07-03t00-00-00-000z"
    )
  })

  it("does not resolve community ids when no local filename carries that source id", () => {
    const collections: CreatedImageCollection[] = [
      {
        id: "collection-pinterest-nature-texture-2026-07-03t00-00-21-000z",
        title: "Pinterest - nature texture",
        createdAt: "2026-07-03T00:00:21.000Z",
        source: "pinterest",
        images: [
          {
            id: "stored-nature-0",
            title: "Nature texture",
            description: "Nature texture",
            imageUrl: "/api/local-assets/image-collections/files/pinterest-nature-texture-11357-0000-74717.jpg",
            sourceUrl: "/api/local-assets/image-collections/files/pinterest-nature-texture-11357-0000-74717.jpg",
            dominantColor: "#d9d8d0",
          },
        ],
      },
    ]

    expect(findCollectionByIdOrAlias(collections, "community_collection_11356")).toBeUndefined()
  })
})
