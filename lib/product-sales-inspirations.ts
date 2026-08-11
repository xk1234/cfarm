export type ProductSalesCreative = {
  visualHook: string
  textHook: string
  script: string[]
}

export type ProductSalesInspiration = {
  id: string
  source: {
    platform: "reel_farm"
    label: string
    creator: string
    url: string
    views: number
    likes: number
    engagementRate: number
  }
  original: ProductSalesCreative
  repurposed: ProductSalesCreative
  analysis: {
    pattern: string
    whyItFits: string
  }
}

export type ProductWithSalesInspirations = {
  salesInspirations?: ProductSalesInspiration[]
}
