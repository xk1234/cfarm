import { describe, expect, it } from "vitest"

import { normalizeInfluLabCollections } from "@/lib/influlab-collections"

describe("InfluLab collection adapter", () => {
  it("normalizes an InfluLab image collection into a read-only LumenClip collection", () => {
    const [collection] = normalizeInfluLabCollections([
      {
        id: "summer",
        name: "Summer",
        mediaType: "image",
        createdAt: "2026-08-01T00:00:00.000Z",
        items: [
          {
            id: "asset:one",
            name: "Pool",
            mediaType: "image",
            caption: "At the pool",
            url: "https://influlab.example/media/one",
          },
        ],
      },
    ])

    expect(collection).toMatchObject({
      id: "influlab:summer",
      externalId: "summer",
      name: "Summer",
      mediaType: "image",
      source: "influlab",
      readOnly: true,
      created_at: "2026-08-01T00:00:00.000Z",
    })
    expect(collection.images).toEqual([
      {
        image_link: "https://influlab.example/media/one",
        caption: "At the pool",
        hash: "influlab:asset:one",
      },
    ])
  })

  it("splits mixed collections into stable image and video collection IDs", () => {
    const collections = normalizeInfluLabCollections([
      {
        id: "mixed",
        name: "Campaign",
        mediaType: "mixed",
        items: [
          {
            id: "asset:image",
            name: "Still",
            mediaType: "image",
            url: "https://influlab.example/image",
          },
          {
            id: "asset:video",
            name: "Clip",
            mediaType: "video",
            url: "https://influlab.example/video",
          },
        ],
      },
    ])

    expect(
      collections.map(({ id, name, mediaType }) => ({ id, name, mediaType }))
    ).toEqual([
      {
        id: "influlab:mixed:image",
        name: "Campaign - Images",
        mediaType: "image",
      },
      {
        id: "influlab:mixed:video",
        name: "Campaign - Videos",
        mediaType: "video",
      },
    ])
  })
})
