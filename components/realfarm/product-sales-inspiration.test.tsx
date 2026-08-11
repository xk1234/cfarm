import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProductSalesInspirationList } from "@/components/realfarm/product-sales-inspiration"
import type { ProductSalesInspiration } from "@/lib/product-sales-inspirations"

const inspiration: ProductSalesInspiration = {
  id: "question-reveal-demo",
  source: {
    platform: "reel_farm",
    creator: "@freeyourmiind_",
    label: "Question → reveal → demonstration",
    url: "https://reel.farm/dashboard/database?view=browse",
    views: 10_700_000,
    likes: 982_500,
    engagementRate: 9.2,
  },
  original: {
    textHook: "Are you brave enough to answer this question?",
    visualHook: "A question appears over a tactile, neutral surface.",
    script: ["Challenge the viewer.", "Reveal the product."],
  },
  repurposed: {
    textHook: "Are you brave enough to pull the card you actually need?",
    visualHook: "A hand hovers over a face-down oracle spread.",
    script: ["Present the challenge.", "Turn over one card."],
  },
  analysis: {
    pattern: "Question, delayed reveal, then visual proof.",
    whyItFits: "Turning a card produces an immediate visible result.",
  },
}

describe("ProductSalesInspirationList", () => {
  it("shows text, visual, and script mappings from source to product", () => {
    const html = renderToStaticMarkup(
      <ProductSalesInspirationList inspirations={[inspiration]} />
    )

    expect(html).toContain("Sales inspiration")
    expect(html).toContain("10.7M views")
    expect(html).toContain("Text hook")
    expect(html).toContain("Visual hook")
    expect(html).toContain("Script")
    expect(html).toContain("Why it fits")
    expect(html).toContain("Are you brave enough to answer this question?")
    expect(html).toContain(
      "Are you brave enough to pull the card you actually need?"
    )
  })
})
