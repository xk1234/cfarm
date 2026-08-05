import type { StoredImageCollection } from "@/lib/image-collections"

export type InfluLabCollectionItem = {
  id: string
  name: string
  mediaType: "image" | "video"
  caption?: string | null
  url: string
}

export type InfluLabCollection = {
  id: string
  name: string
  mediaType: "image" | "video" | "mixed"
  createdAt?: string
  items: InfluLabCollectionItem[]
}

export type InfluLabCollectionsResponse = {
  account: { email: string }
  collections: InfluLabCollection[]
}

export function normalizeInfluLabCollections(
  collections: InfluLabCollection[]
): StoredImageCollection[] {
  return collections.flatMap((collection) => {
    const mediaTypes: Array<"image" | "video"> =
      collection.mediaType === "mixed"
        ? ["image", "video"]
        : [collection.mediaType]
    return mediaTypes.flatMap((mediaType) => {
      const items = collection.items.filter(
        (item) => item.mediaType === mediaType && item.url
      )
      if (!items.length) return []
      const split = collection.mediaType === "mixed"
      const remoteId = split ? `${collection.id}:${mediaType}` : collection.id
      return [
        {
          id: `influlab:${remoteId}`,
          externalId: collection.id,
          name: split
            ? `${collection.name} - ${mediaType === "image" ? "Images" : "Videos"}`
            : collection.name,
          created_at: collection.createdAt || "1970-01-01T00:00:00.000Z",
          mediaType,
          source: "influlab",
          readOnly: true,
          images: items.map((item) => ({
            image_link: item.url,
            caption: item.caption?.trim() || item.name,
            hash: `influlab:${item.id}`,
          })),
        },
      ]
    })
  })
}
