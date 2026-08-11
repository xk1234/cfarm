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

const pdfInspiration: ProductSalesInspiration = {
  id: "pdf-product-test",
  source: {
    platform: "pdf",
    creator: "Creator College",
    label: "Product test slideshow",
    documentTitle: "100 Viral Hooks",
    page: 1,
  },
  original: {
    textHook: "Is this product overhyped? Let's put it to the test...",
    visualHook: "Pair the question with a pass-or-fail checklist.",
    script: ["Ask the question.", "Run the test."],
  },
  repurposed: {
    textHook: "Is this oracle deck overhyped? Let's test it.",
    visualHook: "Show a face-down spread beside three test criteria.",
    script: ["Show the untouched deck.", "Turn over one card."],
  },
  analysis: {
    pattern: "Question, criteria, action, verdict.",
    whyItFits: "A card pull gives the slideshow a visible test result.",
  },
}

describe("ProductSalesInspirationList", () => {
  it("shows text, visual, and script mappings from source to product", () => {
    const html = renderToStaticMarkup(
      <ProductSalesInspirationList
        inspirations={[inspiration, pdfInspiration]}
      />
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
    expect(html).toContain("Creator College · 100 Viral Hooks · p.1")
    expect(html).toContain("Product test slideshow")
    expect(html).not.toContain("NaN")
  })
})
