import { describe, expect, it } from "vitest"

import {
  allImagesCollectionFrom,
  collectionAliases,
  defaultImageCollections,
  findCollectionByIdOrAlias,
  pinnedCollectionsFirst,
  ugcAvatarVideoCollectionFromAssets,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import type { LocalAsset } from "@/lib/realfarm-data"

describe("realfarm collection helpers", () => {
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

  it("uses provider-neutral static default collection names", () => {
    const collections = defaultImageCollections({
      defaultCollections: {
        backgrounds: {
          id: "default-backgrounds",
          title: "Backgrounds",
          images: [],
        },
      },
    } as unknown as Parameters<typeof defaultImageCollections>[0])

    expect(collections[0]).toMatchObject({
      id: "default-backgrounds",
      title: "Backgrounds",
      source: "fallback",
    })
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

  it("does not let the virtual all-images collection claim concrete source ids", () => {
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
        id: "collection-all-images",
        title: "All Images",
        createdAt: "virtual",
        source: "virtual",
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

  it("creates a video collection from AI UGC avatar videos", () => {
    const videos: LocalAsset[] = [
      {
        id: "avatar-one",
        name: "Avatar One",
        path: "ugc_avatar_videos/avatar-one.mp4",
        url: "/api/local-assets/ugc_avatar_videos/avatar-one.mp4",
        kind: "video",
      },
    ]

    const collection = ugcAvatarVideoCollectionFromAssets(videos)

    expect(collection).toMatchObject({
      id: "collection-ugc-avatar-videos",
      title: "AI UGC Avatar Videos",
      mediaType: "video",
      source: "virtual",
      virtual: true,
    })
    expect(collection.images[0]).toMatchObject({
      id: "avatar-one",
      title: "Avatar One",
      imageUrl: "/api/local-assets/ugc_avatar_videos/avatar-one.mp4",
      sourceUrl: "/api/local-assets/ugc_avatar_videos/avatar-one.mp4",
    })
  })

  it("merges categorized Appwrite videos into AI UGC Avatar Videos", () => {
    const videos: LocalAsset[] = [
      {
        id: "avatar-one",
        name: "Avatar One",
        path: "ugc_avatar_videos/avatar-one.mp4",
        url: "/api/local-assets/ugc_avatar_videos/avatar-one.mp4",
        kind: "video",
      },
    ]
    const categorizedCollections: CreatedImageCollection[] = [
      {
        id: "ugc-surprise",
        title: "UGC Avatars — Surprise & Shock",
        mediaType: "video",
        createdAt: "2026-07-15T00:00:00.000Z",
        source: "pinterest",
        images: [
          {
            id: "categorized-avatar-one",
            title: "Creator covers their mouth in surprise.",
            description: "Creator covers their mouth in surprise.",
            imageUrl: "/api/local-assets/ugc_avatar_videos/avatar-one.mp4",
            sourceUrl: "/api/local-assets/ugc_avatar_videos/avatar-one.mp4",
            dominantColor: "#d9d8d0",
          },
          {
            id: "categorized-avatar-two",
            title: "Creator points directly at the camera.",
            description: "Creator points directly at the camera.",
            imageUrl: "/api/local-assets/ugc_avatar_videos/avatar-two.mp4",
            sourceUrl: "/api/local-assets/ugc_avatar_videos/avatar-two.mp4",
            dominantColor: "#d9d8d0",
          },
        ],
      },
    ]

    const collection = ugcAvatarVideoCollectionFromAssets(
      videos,
      categorizedCollections
    )

    expect(collection.images).toHaveLength(2)
    expect(collection.images[0]).toMatchObject({
      id: "categorized-avatar-one",
      description: "Creator covers their mouth in surprise.",
    })
    expect(collection.images[1]).toMatchObject({
      id: "categorized-avatar-two",
    })
  })

  it("builds All Images from photo collections only", () => {
    const collection = allImagesCollectionFrom([
      {
        id: "photos",
        title: "Photos",
        mediaType: "image",
        createdAt: "2026-07-12T00:00:00.000Z",
        source: "upload",
        images: [
          {
            id: "photo-1",
            title: "Photo",
            description: "Photo",
            imageUrl: "/photo.jpg",
            sourceUrl: "/photo.jpg",
            dominantColor: "#ffffff",
          },
        ],
      },
      {
        id: "videos",
        title: "Videos",
        mediaType: "video",
        createdAt: "2026-07-12T00:00:00.000Z",
        source: "virtual",
        images: [
          {
            id: "video-1",
            title: "Video",
            description: "Video",
            imageUrl: "/video.mp4",
            sourceUrl: "/video.mp4",
            dominantColor: "#000000",
          },
        ],
      },
    ])

    expect(collection.images.map((image) => image.imageUrl)).toEqual([
      "/photo.jpg",
    ])
  })
})
