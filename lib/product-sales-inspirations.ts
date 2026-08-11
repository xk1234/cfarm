export type ProductSalesCreative = {
  visualHook: string
  textHook: string
  script: string[]
}

export type ProductSalesInspiration = {
  id: string
  source: {
    platform: "reel_farm" | "pdf"
    label: string
    creator: string
    url?: string
    documentTitle?: string
    page?: number
    views?: number
    likes?: number
    engagementRate?: number
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
