import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { configureFontconfig } from "@/lib/font-config"
import { selectSlideshowImageWithAi } from "@/lib/slideshow-image-matching"
import { renderedSlideSvg } from "@/lib/slideshow-renderer"
import { generateSlideshowText } from "@/lib/slideshow-text-generation"
import type { TempSlideTestingAutomation } from "@/lib/temp-slide-testing"

function envKey(name: string) {
  if (process.env[name]) return process.env[name]
  try {
    const line = readFileSync(".env", "utf8")
      .split("\n")
      .find((entry) => entry.match(new RegExp(`^\\s*${name}\\s*=`)))
    return line?.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "")
  } catch {
    return undefined
  }
}

const apiKey = envKey("OPENROUTER_API_KEY")
const automation: TempSlideTestingAutomation = {
  id: "live-slideshow-generation",
  name: "Live slideshow generation",
  theme: "testing",
  // A concrete-noun hook, like the ones real automations use. Meta hooks
  // ("ways to test hooks") trip outputDevelopsHookSubject, which matches whole
  // words without stemming, and that would make this test about the gate
  // rather than about generation and rendering.
  hooks: ["three things a scorpio will never tell you"],
  tone: "direct",
  style: "plain language",
  imageCollectionIds: { hook: "live", content: "live", cta: "" },
  slides: [
    {
      id: "hook",
      index: 0,
      section: "hook",
      title: "Hook",
      aspectRatio: "9:16",
      imageGrid: "none",
      overlay: false,
      displayText: true,
      collectionId: "live",
      textItems: [],
    },
    {
      id: "content",
      index: 1,
      section: "content",
      title: "Content",
      aspectRatio: "9:16",
      imageGrid: "none",
      overlay: false,
      displayText: true,
      collectionId: "live",
      textItems: [
        {
          id: "content__text",
          itemId: "text",
          section: "content",
          slideId: "content",
          label: "Body",
          contentDirection: "one concrete rendering check",
          wordLengthMin: 4,
          wordLengthMax: 10,
          textMode: "prompt",
          staticText: "",
          font: "TikTok Display Medium",
          fontSize: "48px",
          textStyle: "whiteText",
          textPosition: "center",
          textItemWidth: "80%",
          textAlign: "center",
          textAnchor: "padded",
          textVerticalAnchor: "padded",
        },
      ],
    },
  ],
}

async function ink(text: string) {
  configureFontconfig()
  const image =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
  const svg = renderedSlideSvg(
    {
      id: "live-glyph",
      image_url: image,
      textItems: [
        {
          id: "glyph",
          text,
          fontSize: "48px",
          textSize: { width: 90, height: 20 },
          textStyle: "whiteText",
          textAlign: "center",
          textPosition: { x: 50, y: 50 },
        },
      ],
    },
    image
  )
  const sharp = (await import("sharp")).default
  const rgba = await sharp(Buffer.from(svg)).raw().toBuffer()
  let count = 0
  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index] > 128 && rgba[index + 1] > 128 && rgba[index + 2] > 128) count++
  }
  return count
}

describe.skipIf(!process.env.RUN_LIVE || !apiKey)(
  "LIVE slideshow generation",
  () => {
    it("generates once, selects a collection candidate, and renders real glyphs", async () => {
      const generated = await generateSlideshowText({
        automation,
        selectedHook: automation.hooks[0],
        apiKey,
      })
      expect(generated.result.text.content__text?.trim()).toBeTruthy()

      const candidates = [
        {
          id: "font-check",
          imageUrl: "https://picsum.photos/seed/font-check/320/480",
          caption: "designer inspecting typography on a screen",
        },
        {
          id: "unrelated",
          imageUrl: "https://picsum.photos/seed/unrelated/320/480",
          caption: "empty mountain road",
        },
      ]
      const selected = await selectSlideshowImageWithAi({
        slideText: generated.result.text.content__text,
        concepts: ["typography rendering inspection"],
        candidates,
        apiKey: apiKey!,
      })
      expect(candidates.map((candidate) => candidate.id)).toContain(selected)

      const wide = await ink("WWWWWWWW")
      const dots = await ink("........")
      expect(dots).toBeGreaterThan(0)
      expect(wide).toBeGreaterThan(dots * 1.8)
    })
  }
)
