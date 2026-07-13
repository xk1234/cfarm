import path from "node:path"

import { clean } from "@/lib/guards"
import { readJsonArrayStore } from "@/lib/json-store"

export type ProductCollectionItem = {
  id: string
  marketplace: "amazon" | "shopee"
  marketplaceUrl: string
  name: string
  currency: "SGD"
  price: number
  priceLabel: string
  commissionRate: number
  estimatedCommission: number
  storeImageUrl: string
  generatedImageUrl: string
  useCase: string
  sourcedAt: string
}

export type ProductCollection = {
  ownerId?: string
  id: string
  name: string
  description: string
  items: ProductCollectionItem[]
  createdAt: string
  updatedAt: string
  commissionDisclaimer: string
  commissionSourceUrl?: string
}

const rootDir = path.join(process.cwd(), "data", "product-collections")

export async function listProductCollections() {
  return readJsonArrayStore<ProductCollection>({
    rootDir,
    fileName: "product-collections.json",
    key: "collections",
    normalize: normalizeProductCollection,
  })
}

function normalizeProductCollection(value: ProductCollection) {
  const id = clean(value?.id)
  const name = clean(value?.name)
  if (!id || !name || !Array.isArray(value?.items)) return null
  return {
    ...value,
    id,
    name,
    items: value.items.filter(
      (item) =>
        clean(item?.id) &&
        clean(item?.marketplaceUrl) &&
        clean(item?.storeImageUrl) &&
        clean(item?.generatedImageUrl)
    ),
  }
}
