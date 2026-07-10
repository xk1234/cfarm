import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { generateSlideshowText } from "@/lib/slideshow-text-generation"
import {
  automationTemplateToTempSlideTestingAutomation,
  getTempSlidePromptPlaceholders,
} from "@/lib/temp-slide-testing"

function loadEnvKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8")
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "")
    }
  } catch {
    /* ignore */
  }
  return undefined
}

const apiKey = loadEnvKey("OPENROUTER_API_KEY")
const MODEL = "google/gemini-2.5-flash" // default flash-lite drops hashtags (batch-2 finding)

function wc(s: string) {
  return s.trim().split(/\s+/).filter(Boolean).length
}
const DISCOURSE = ["honestly", "trust me", "frankly", "believe me", "to tell you the truth"]

function loadGirlTemplates() {
  const t = JSON.parse(
    readFileSync("data/automation-templates/templates.json", "utf8")
  )
  const arr = Array.isArray(t) ? t : t.templates || Object.values(t)
  return arr.filter((x: any) => /girl/i.test(x.name || ""))
}

function exampleRunsFor(idFragment: string) {
  const e = JSON.parse(
    readFileSync("data/automation-templates/example-runs.json", "utf8")
  )
  return e.runs.filter((r: any) =>
    String(r.templateId).includes(idFragment)
  )
}

describe.skipIf(!process.env.RUN_LIVE)("LIVE Grid/Horizontal Girl vs example outputs", () => {
  for (const template of loadGirlTemplates()) {
    it(`generates and compares: ${template.name}`, async () => {
      expect(apiKey).toBeTruthy()
      const automation =
        automationTemplateToTempSlideTestingAutomation(template)
      const placeholders = getTempSlidePromptPlaceholders(automation)
      const idFrag = String(template.id).replace("template-reelfarm-", "")
      const examples = exampleRunsFor(idFrag)
      const exampleSlideCount = examples[0]?.plan?.slides?.length ?? 0
      const exampleHook = examples[0]?.plan?.slides?.[0]?.text ?? ""

      const res = await generateSlideshowText({
        automation,
        apiKey,
        model: MODEL,
        selectedHook: exampleHook || automation.hooks[0],
      })

      // ---- LAYOUT ----
      const genSlides = automation.slides.length
      const sections = automation.slides.map((s: any) => s.section).join("+")

      // ---- WORD COUNTS ----
      const titleKeys = placeholders
        .filter((p: any) => p.wordLengthMax <= 2)
        .map((p: any) => p.id)
      const bodyKeys = placeholders
        .filter((p: any) => p.wordLengthMin >= 6)
        .map((p: any) => p.id)
      const titleWCs = titleKeys.map((k: string) => wc(res.result.text[k] ?? ""))
      const bodyWCs = bodyKeys.map((k: string) => wc(res.result.text[k] ?? ""))

      // ---- PHRASING STYLE ----
      const allText = [
        res.result.title,
        res.result.caption,
        ...Object.values(res.result.text),
      ]
      const allLower = allText.every((s) => s === s.toLowerCase())
      const hasDiscourse = allText.some((s) =>
        DISCOURSE.some((d) => s.toLowerCase().includes(d))
      )
      const firstPerson = Object.values(res.result.text).some((s) =>
        /\bi\b|\bmy\b|\bme\b/.test(s.toLowerCase())
      )

      console.log(`\n================ ${template.name} (${template.id}) ================`)
      console.log(`LAYOUT   generated ${genSlides} slides [${sections}]  vs  example ${exampleSlideCount} slides`)
      console.log(`         ${genSlides === exampleSlideCount ? "MATCH" : "MISMATCH — generated is missing the trailing CTA slide (cta.enabled=false but image_collection_ids.cta_slide.check=true)"}`)
      console.log(`COLLECT  hook=${automation.imageCollectionIds.hook}`)
      console.log(`         body=${automation.imageCollectionIds.content}`)
      console.log(`         cta =${automation.imageCollectionIds.cta}`)
      console.log(`HOOK     example: "${exampleHook}" (${wc(exampleHook)} words)`)
      console.log(`WORDS    titles (spec 1-2): [${titleWCs.join(", ")}]`)
      console.log(`         bodies (spec 6-10): [${bodyWCs.join(", ")}]`)
      console.log(`STYLE    all-lowercase=${allLower}  first-person=${firstPerson}  discourse-markers=${hasDiscourse}`)
      console.log(`GENERATED title:   ${res.result.title}`)
      console.log(`GENERATED hashtags:${res.result.hashtags}`)
      console.log(`GENERATED slides:`)
      const bySlide: Record<string, string[]> = {}
      for (const p of placeholders) {
        const slide = p.id.split("__")[0]
        ;(bySlide[slide] ??= []).push(res.result.text[p.id] ?? "")
      }
      for (const [slide, parts] of Object.entries(bySlide)) {
        console.log(`   ${slide}: [${parts.map((x) => JSON.stringify(x)).join("  |  ")}]`)
      }

      console.log(`WORDS    bodies (spec 6-10): [${bodyWCs.join(", ")}]`)
      const titlesInSpec = titleWCs.every((w) => w >= 1 && w <= 2)
      const bodiesInSpec = bodyWCs.every((w) => w >= 6 && w <= 10)
      console.log(
        `VERDICT  layout=${genSlides === exampleSlideCount ? "MATCH" : "MISMATCH(-CTA)"}  ` +
          `titles_1-2=${titlesInSpec}  bodies_6-10=${bodiesInSpec}  ` +
          `lowercase=${allLower}  first_person=${firstPerson}  no_discourse=${!hasDiscourse}  ` +
          `hashtags=${res.result.hashtags.trim() ? "present" : "EMPTY"}`
      )

      // Structural invariants that must always hold (report handles the rest).
      expect(genSlides).toBeGreaterThan(0)
      expect(placeholders.length).toBeGreaterThan(0)
      expect(res.skippedOpenRouter).toBe(false)
    }, 60_000)
  }
})
