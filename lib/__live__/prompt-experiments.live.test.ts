import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, it } from "vitest"

import {
  automationTemplateToTempSlideTestingAutomation,
  getTempSlidePromptPlaceholders,
  buildTempSlideUserPrompt,
  buildTempSlideStructuredOutputSchema,
  defaultTempSlideSystemPrompt,
  defaultTempSlideUserInstructions,
} from "@/lib/temp-slide-testing"

function loadEnvKey(name: string): string | undefined {
  if (process.env[name]) return process.env[name]
  const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8")
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && m[1] === name) return m[2].replace(/^["']|["']$/g, "")
  }
  return undefined
}
const apiKey = loadEnvKey("OPENROUTER_API_KEY")!

function loadTemplate(nameRe: RegExp) {
  const t = JSON.parse(
    readFileSync("data/automation-templates/templates.json", "utf8")
  )
  const arr = Array.isArray(t) ? t : t.templates || Object.values(t)
  return arr.find((x: any) => nameRe.test(x.name || ""))
}

const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length
const isLower = (s: string) => s === s.toLowerCase()

// ---- schema variants ----
function baseSchema(placeholders: any[]) {
  return buildTempSlideStructuredOutputSchema(placeholders)
}
// Reorder hashtags AFTER text + much stronger, example-laden description.
function reorderedSchema(placeholders: any[]) {
  const s: any = baseSchema(placeholders)
  const { title, caption, hashtags, text } = s.properties
  hashtags.description =
    "REQUIRED — never leave empty. Exactly 3-5 lowercase hashtags, each starting with '#', separated by single spaces. Example: '#focus #wellness #mindset #habits'."
  s.properties = { title, caption, text, hashtags } // hashtags last
  return s
}

// ---- prompt variants ----
function hardenPrompt(base: string, style: string) {
  const lower = /lowercase/i.test(style)
  const lines = [
    base,
    "STRICT OUTPUT RULES:",
    "- Fill EVERY field. Never return an empty string for title, caption, or hashtags.",
    "- Respect the exact word range stated for each text box.",
  ]
  if (lower)
    lines.push(
      "- EVERY value you output — title, caption, hashtags, and all slide text — MUST be entirely lowercase, with no capital letters anywhere."
    )
  return lines.join("\n")
}

function buildPayload(opts: {
  automation: any
  model: string
  selectedHook: string
  variant: "base" | "reorder" | "prompt" | "combo"
}) {
  const placeholders = getTempSlidePromptPlaceholders(opts.automation)
  const style = opts.automation.style
  const useReorder = opts.variant === "reorder" || opts.variant === "combo"
  const useHardPrompt = opts.variant === "prompt" || opts.variant === "combo"
  const system = useHardPrompt
    ? hardenPrompt(defaultTempSlideSystemPrompt, style)
    : defaultTempSlideSystemPrompt
  return {
    payload: {
      model: opts.model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: buildTempSlideUserPrompt({
            automationName: opts.automation.name,
            hook: opts.selectedHook,
            tone: opts.automation.tone,
            style,
            promptInstructions: defaultTempSlideUserInstructions,
            placeholders,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "temp_slide_testing_text",
          strict: true,
          schema: useReorder
            ? reorderedSchema(placeholders)
            : baseSchema(placeholders),
        },
      },
    },
    placeholders,
  }
}

async function callOnce(payload: any) {
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const j = await r.json()
  const content = j.choices?.[0]?.message?.content
  return JSON.parse(typeof content === "string" ? content : "{}")
}

function score(out: any, placeholders: any[]) {
  const titleKeys = placeholders.filter((p) => p.wordLengthMax <= 2).map((p) => p.id)
  const bodyKeys = placeholders.filter((p) => p.wordLengthMin >= 6).map((p) => p.id)
  const text = out.text ?? {}
  const titlesOk = titleKeys.every((k: string) => {
    const w = wc(text[k] ?? "")
    return w >= 1 && w <= 2
  })
  const bodiesOk = bodyKeys.every((k: string) => {
    const w = wc(text[k] ?? "")
    return w >= 6 && w <= 10
  })
  const all = [out.title ?? "", out.caption ?? "", ...Object.values(text)] as string[]
  return {
    hashtags: (out.hashtags ?? "").trim().length > 0,
    titleLower: isLower(out.title ?? ""),
    allLower: all.every(isLower),
    titlesOk,
    bodiesOk,
  }
}

const MODELS = ["google/gemini-3.1-flash-lite", "google/gemini-2.5-flash"]
const VARIANTS = ["base", "reorder", "prompt", "combo"] as const
const TRIALS = 3

describe.skipIf(!process.env.RUN_EXP)("EXPERIMENT: prompt/schema variants (Grid Girl)", () => {
  const template = loadTemplate(/grid girl/i)
  const automation = automationTemplateToTempSlideTestingAutomation(template)
  const hook = automation.hooks[0]

  for (const model of MODELS) {
    for (const variant of VARIANTS) {
      it(`${model} | ${variant}`, async () => {
        const agg = { hashtags: 0, titleLower: 0, allLower: 0, titlesOk: 0, bodiesOk: 0 }
        for (let i = 0; i < TRIALS; i++) {
          const { payload, placeholders } = buildPayload({
            automation,
            model,
            selectedHook: hook,
            variant,
          })
          try {
            const out = await callOnce(payload)
            const s = score(out, placeholders)
            for (const k of Object.keys(agg) as (keyof typeof agg)[])
              if (s[k]) agg[k]++
          } catch (e) {
            console.log(`  trial ${i} error: ${String(e).slice(0, 80)}`)
          }
        }
        console.log(
          `RESULT ${model.padEnd(30)} ${variant.padEnd(8)} ` +
            `hashtags=${agg.hashtags}/${TRIALS} titleLower=${agg.titleLower}/${TRIALS} ` +
            `allLower=${agg.allLower}/${TRIALS} titles1-2=${agg.titlesOk}/${TRIALS} bodies6-10=${agg.bodiesOk}/${TRIALS}`
        )
      }, 120_000)
    }
  }
})
