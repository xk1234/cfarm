import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { buildAmazonHomeImprovementInspirations } from "@/lib/product-sales-inspirations"

describe("buildAmazonHomeImprovementInspirations", () => {
  it("uses SKU-specific proof instead of filling generic templates", () => {
    const inspirations = buildAmazonHomeImprovementInspirations(
      "amazon-sg-power-cleaning",
      {
        asin: "B081VQTG2Q",
        name: "Rubbermaid Reveal Cordless Power Scrubber",
        useCase: "Clear one stripe through stained grout.",
      }
    )

    expect(inspirations).toHaveLength(3)
    expect(inspirations[0]).toMatchObject({
      id: "one-square-test",
      source: { label: "Product test" },
      repurposed: {
        textHook: "I gave this scrubber one grout square to prove itself.",
      },
    })
    expect(inspirations[0].repurposed.visualHook).toContain(
      "one dirty grout square"
    )
    expect(inspirations[2].repurposed.textHook).toContain("right head")
  })

  it("gives visually different products different concepts and counts", () => {
    const underCabinetLights = buildAmazonHomeImprovementInspirations(
      "amazon-sg-motion-lighting",
      {
        asin: "B0FBRPPT5L",
        name: "Three-Pack Rechargeable Motion Under-Cabinet Lights",
        useCase: "Open a dark cabinet.",
      }
    )
    const touchUpPens = buildAmazonHomeImprovementInspirations(
      "amazon-sg-surface-restoration",
      {
        asin: "B0C5SN4X3K",
        name: "Refillable Wall and Furniture Touch-Up Paint Pens",
        useCase: "Erase a wall scuff.",
      }
    )

    expect(underCabinetLights).toHaveLength(3)
    expect(touchUpPens).toHaveLength(2)
    expect(underCabinetLights.map((item) => item.id)).toEqual([
      "cabinet-wakeup",
      "three-colour-test",
      "charging-reality",
    ])
    expect(touchUpPens.map((item) => item.id)).toEqual([
      "no-paint-tray",
      "dry-color-test",
    ])
  })

  it("covers every curated product with unique, complete slideshow concepts", () => {
    const source = JSON.parse(
      readFileSync(
        path.join(
          process.cwd(),
          "data/product-collections/amazon-home-improvement-sg.json"
        ),
        "utf8"
      )
    ) as {
      collections: Array<{
        id: string
        items: Array<{ asin: string; name: string; useCase: string }>
      }>
    }
    const mapped = source.collections.flatMap((collection) =>
      collection.items.map((product) => ({
        product,
        inspirations: buildAmazonHomeImprovementInspirations(
          collection.id,
          product
        ),
      }))
    )
    const allInspirations = mapped.flatMap((entry) => entry.inspirations)
    const textHooks = allInspirations.map((entry) => entry.repurposed.textHook)

    expect(mapped).toHaveLength(20)
    expect(allInspirations).toHaveLength(50)
    expect(new Set(textHooks).size).toBe(textHooks.length)
    for (const { inspirations } of mapped) {
      expect(inspirations.length).toBeGreaterThanOrEqual(2)
      expect(inspirations.length).toBeLessThanOrEqual(3)
      for (const inspiration of inspirations) {
        expect(inspiration.repurposed.visualHook.length).toBeGreaterThan(40)
        expect(inspiration.repurposed.textHook.length).toBeGreaterThan(15)
        expect(inspiration.repurposed.script).toHaveLength(6)
        expect(inspiration.analysis?.whyItFits.length ?? 0).toBeGreaterThan(40)
      }
    }
  })
})
