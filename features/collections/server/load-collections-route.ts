import "server-only"

import { listAvailableImageCollections } from "@/lib/available-image-collections"
import { listProductCollections } from "@/lib/product-collections"
import { loadRealFarmData } from "@/lib/realfarm-data"
import {
  defaultImageCollections,
  storedToCollection,
} from "@/features/collections/domain/collections"

export async function loadCollectionsRouteData() {
  const [data, storedCollections, productCollections] = await Promise.all([
    loadRealFarmData(),
    listAvailableImageCollections(),
    listProductCollections(),
  ])

  return {
    assets: data.assets,
    collections: storedCollections.length
      ? storedCollections.map(storedToCollection)
      : defaultImageCollections(),
    productCollections,
  }
}
