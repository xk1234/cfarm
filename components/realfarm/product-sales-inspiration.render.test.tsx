import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ProductSalesInspirationList } from "@/components/realfarm/product-sales-inspiration"
import { buildAmazonHomeImprovementInspirations } from "@/lib/product-sales-inspirations"

describe("ProductSalesInspirationList", () => {
  it("renders original and repurposed visual hooks, text hooks, and scripts", () => {
    const html = renderToStaticMarkup(
      <ProductSalesInspirationList
        inspirations={buildAmazonHomeImprovementInspirations(
          "amazon-sg-clever-diy-tools",
          {
            asin: "B088T5PPSK",
            name: "Locking Contour Gauge",
            useCase: "Copy a pipe outline and reveal a clean first-fit cut.",
          }
        )}
      />
    )

    expect(html).toContain("Sales inspiration")
    expect(html).toContain("Visual hook")
    expect(html).toContain("Text hook")
    expect(html).toContain("Script")
    expect(html).toContain("Original")
    expect(html).toContain("For this product")
    expect(html).toContain("04-Viral Hooks.pdf")
    expect(html).toContain("page 1")
    expect(html).toContain("Product test")
    expect(html).toContain("3 patterns")
    expect(html).toContain("This cut usually fails at the pipe")
  })
})
