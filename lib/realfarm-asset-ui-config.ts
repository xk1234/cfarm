import type { AssetCategory } from "@/lib/assets"

export const assetTabs = [
  "outfits",
  "accessories",
  "background",
  "products",
] as const

export type AssetTab = (typeof assetTabs)[number]

export const assetCategoryByTab: Record<AssetTab, AssetCategory> = {
  outfits: "outfit",
  accessories: "accessory",
  background: "background",
  products: "product",
}
