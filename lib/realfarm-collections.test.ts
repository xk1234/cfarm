import { describe, expect, it } from "vitest"

import {
  collectionAliases,
  findCollectionByIdOrAlias,
  pinnedCollectionsFirst,
  collectionToStored,
  nextUntitledCollectionName,
  storedToCollection,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"

describe("realfarm collection helpers", () => {
  it("uses a stable name slug while retaining the old timestamped id as an alias", () => {
    const collection = storedToCollection({
      name: "Mystical Pictures",
      created_at: "2026-07-14T03:55:21.813Z",
      images: [],
    })

    expect(collection.id).toBe("mystical-pictures")
    expect(collectionAliases(collection)).toContain(
      "collection-mystical-pictures-2026-07-14t03-55-21-813z"
    )
  })

  it("puts pinned collections first without changing order within each group", () => {
    const collections = [
      { id: "a", pinned: false },
      { id: "b", pinned: true },
      { id: "c" },
      { id: "d", pinned: true },
    ]

    expect(pinnedCollectionsFirst(collections).map(({ id }) => id)).toEqual([
      "b",
      "d",
      "a",
      "c",
    ])
  })

  it("keeps the server id so a rename addresses the saved row", () => {
    const collection = storedToCollection({ id: "row_1", name: "Sunsets", created_at: "", images: [] })
    expect(collection.serverId).toBe("row_1")
    expect(collectionToStored({ ...collection, title: "Dusk" })).toMatchObject({ id: "row_1", name: "Dusk" })
  })

  it("names new collections uniquely", () => {
    expect(nextUntitledCollectionName([])).toBe("Untitled collection")
    expect(
      nextUntitledCollectionName([{ title: "Untitled collection" }, { title: "untitled collection 2" }])
    ).toBe("Untitled collection 3")
  })

  it("matches imported Reelfarm collection ids from local asset filenames", () => {
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
            imageUrl:
              "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
            sourceUrl:
              "/api/local-assets/image-collections/files/youtube-videos-ndes-overlays-11436-0000-366568-d4580138c2.jpg",
            dominantColor: "#d9d8d0",
          },
        ],
      },
    ]

    expect(collectionAliases(collections[0])).toContain(
      "community_collection_11436"
    )
    expect(collectionAliases(collections[0])).toContain("user_collection_11436")
    expect(
      findCollectionByIdOrAlias(collections, "community_collection_11436")?.id
    ).toBe("collection-youtube-videos-ndes-overlays-2026-07-03t00-00-00-000z")
    expect(
      findCollectionByIdOrAlias(collections, "user_collection_11436")?.id
    ).toBe("collection-youtube-videos-ndes-overlays-2026-07-03t00-00-00-000z")
  })

  it("resolves Soccer Motivational Reelfarm user collection ids", () => {
    const collections: CreatedImageCollection[] = [
      {
        id: "collection-soccer-hooks-2026-07-03t00-00-12-000z",
        title: "Soccer Hooks",
        createdAt: "2026-07-03T00:00:12.000Z",
        source: "pinterest",
        images: [
          {
            id: "stored-soccer-hooks-0",
            title: "Soccer hook",
            description: "Soccer hook",
            imageUrl:
              "/api/local-assets/image-collections/files/soccer-hooks-11750-0000-375041-1a26867dd3.jpg",
            sourceUrl:
              "/api/local-assets/image-collections/files/soccer-hooks-11750-0000-375041-1a26867dd3.jpg",
            dominantColor: "#d9d8d0",
          },
        ],
      },
      {
        id: "collection-soccer-body-2026-07-03t00-00-11-000z",
        title: "Soccer Body",
        createdAt: "2026-07-03T00:00:11.000Z",
        source: "pinterest",
        images: [
          {
            id: "stored-soccer-body-0",
            title: "Soccer body",
            description: "Soccer body",
            imageUrl:
              "/api/local-assets/image-collections/files/soccer-body-11751-0000-375064-26f3a4e1e4.jpg",
            sourceUrl:
              "/api/local-assets/image-collections/files/soccer-body-11751-0000-375064-26f3a4e1e4.jpg",
            dominantColor: "#d9d8d0",
          },
        ],
      },
    ]

    expect(
      findCollectionByIdOrAlias(collections, "user_collection_11750")?.title
    ).toBe("Soccer Hooks")
    expect(
      findCollectionByIdOrAlias(collections, "user_collection_11751")?.title
    ).toBe("Soccer Body")
  })

  it("does not let virtual collections claim concrete source ids", () => {
    const soccerHookImage = {
      id: "stored-soccer-hooks-0",
      title: "Soccer hook",
      description: "Soccer hook",
      imageUrl:
        "/api/local-assets/image-collections/files/soccer-hooks-11750-0000-375041-1a26867dd3.jpg",
      sourceUrl:
        "/api/local-assets/image-collections/files/soccer-hooks-11750-0000-375041-1a26867dd3.jpg",
      dominantColor: "#d9d8d0",
    }
    const collections: CreatedImageCollection[] = [
      {
        id: "collection-ugc-avatar-videos",
        title: "UGC Avatar Videos",
        createdAt: "virtual",
        source: "upload",
        virtual: true,
        images: [soccerHookImage],
      },
      {
        id: "collection-soccer-hooks-2026-07-03t00-00-12-000z",
        title: "Soccer Hooks",
        createdAt: "2026-07-03T00:00:12.000Z",
        source: "pinterest",
        images: [soccerHookImage],
      },
    ]

    expect(collectionAliases(collections[0])).not.toContain(
      "user_collection_11750"
    )
    expect(
      findCollectionByIdOrAlias(collections, "user_collection_11750")?.title
    ).toBe("Soccer Hooks")
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
            imageUrl:
              "/api/local-assets/image-collections/files/pinterest-nature-texture-11357-0000-74717.jpg",
            sourceUrl:
              "/api/local-assets/image-collections/files/pinterest-nature-texture-11357-0000-74717.jpg",
            dominantColor: "#d9d8d0",
          },
        ],
      },
    ]

    expect(
      findCollectionByIdOrAlias(collections, "community_collection_11356")
    ).toBeUndefined()
  })
})
