import { describe, expect, it } from "vitest"

import {
  createOvalIconLayout,
  seededOvalIconRandom,
} from "@/lib/slideshow-oval-icons"
import { renderedSlideSvg } from "@/lib/slideshow-renderer"

const candidates = Array.from({ length: 10 }, (_, index) => ({
  key: `icon-${index + 1}`,
  imageUrl: `/icon-${index + 1}.svg`,
  imageCaption: `Astrology icon ${index + 1}`,
}))

describe("oval icon slideshow layout", () => {
  it("places 4-8 unique surrounding icons outside the focal asset", () => {
    const layout = createOvalIconLayout({
      candidates,
      focalKey: "icon-1",
      random: seededOvalIconRandom("astrology-template"),
    })

    expect(layout.surrounding.length).toBeGreaterThanOrEqual(4)
    expect(layout.surrounding.length).toBeLessThanOrEqual(8)
    expect(new Set(layout.surrounding.map((icon) => icon.key)).size).toBe(
      layout.surrounding.length
    )
    expect(layout.surrounding.some((icon) => icon.key === "icon-1")).toBe(false)
    for (const icon of layout.surrounding) {
      expect(icon.scale).toBeGreaterThanOrEqual(0.7)
      expect(icon.scale).toBeLessThanOrEqual(1.3)
      expect(icon.rotation).toBeGreaterThanOrEqual(-90)
      expect(icon.rotation).toBeLessThanOrEqual(90)
      const x = (icon.x / 100) * 1080
      const y = (icon.y / 100) * 1920
      const centerDistance =
        ((x - 540) / (1080 * 0.372)) ** 2 + ((y - 960) / (1920 * 0.318)) ** 2
      expect(centerDistance).toBeGreaterThan(1)
    }
  })

  it("distributes surrounding icons into evenly spaced perimeter sectors", () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const layout = createOvalIconLayout({
        candidates,
        focalKey: "icon-1",
        random: seededOvalIconRandom(`spacing-${seed}`),
      })
      const angles = layout.surrounding
        .map((icon) => {
          const x = (icon.x / 100) * 1080
          const y = (icon.y / 100) * 1920
          const angle = Math.atan2((y - 960) / 606, (x - 540) / 396)
          return angle < 0 ? angle + Math.PI * 2 : angle
        })
        .sort((left, right) => left - right)
      const gaps = angles.map((angle, index) => {
        const next = angles[(index + 1) % angles.length]
        return index === angles.length - 1
          ? next + Math.PI * 2 - angle
          : next - angle
      })
      const idealGap = (Math.PI * 2) / angles.length
      expect(Math.min(...gaps)).toBeGreaterThan(idealGap * 0.55)
      expect(Math.max(...gaps)).toBeLessThan(idealGap * 1.45)
    }
  })

  it("randomly spreads icon centers through the space outside the oval", () => {
    const layout = createOvalIconLayout({
      candidates,
      focalKey: "icon-1",
      random: seededOvalIconRandom("radial-spread"),
    })
    const radialDistances = layout.surrounding.map((icon) => {
      const x = (icon.x / 100) * 1080
      const y = (icon.y / 100) * 1920
      return (
        ((x - 540) / (1080 * 0.372)) ** 2 + ((y - 960) / (1920 * 0.318)) ** 2
      )
    })

    expect(
      Math.max(...radialDistances) - Math.min(...radialDistances)
    ).toBeGreaterThan(0.1)
  })

  it("renders the oval, focal icon, surrounding icons, and one text item", () => {
    const layout = createOvalIconLayout({
      candidates,
      focalKey: "icon-1",
      random: seededOvalIconRandom("render-test"),
    })
    const svg = renderedSlideSvg(
      {
        id: "slide-1",
        image_url: "/icon-1.svg",
        iconLayout: {
          kind: "oval-icons",
          surrounding: layout.surrounding.map((icon) => ({
            image_url: icon.imageUrl,
            x: icon.x,
            y: icon.y,
            scale: icon.scale,
            rotation: icon.rotation,
          })),
        },
        textItems: [
          {
            id: "copy",
            text: "Your intuition needs more quiet",
            fontSize: "14px",
            textSize: { width: 64, height: 18 },
            textStyle: "blackText",
            textAlign: "center",
            textAnchor: "padded",
            textPlacement: "center",
            textPosition: { x: 50, y: 54 },
          },
        ],
      },
      "data:image/svg+xml,focal",
      undefined,
      {
        iconUrls: layout.surrounding.map(
          (_, index) => `data:image/svg+xml,icon-${index}`
        ),
      }
    )

    expect(svg).toContain("<ellipse")
    expect(svg.indexOf("<ellipse")).toBeLessThan(
      svg.indexOf('<g transform="translate')
    )
    expect(svg).toContain("#f6f1e8")
    expect(svg).toContain("Your intuition needs")
    expect(svg).toContain("more quiet")
    expect(svg.match(/<image /g)).toHaveLength(layout.surrounding.length + 1)
  })
})
