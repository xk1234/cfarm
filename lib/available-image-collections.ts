import "server-only"

import {
  listImageCollections,
  type StoredImageCollection,
} from "@/lib/image-collections"
import { listCurrentInfluLabCollections } from "@/lib/influlab"

export async function listAvailableImageCollections(): Promise<
  StoredImageCollection[]
> {
  const local = await listImageCollections()
  try {
    const remote = await listCurrentInfluLabCollections()
    return [...remote, ...local]
  } catch (error) {
    console.warn("InfluLab collections are temporarily unavailable", error)
    return local
  }
}
