import { readdirSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { isTemplate, resolveTemplate, validateSpec } from "../spec"
import { getStarterTemplate, isStarterTemplateId, listStarterTemplates } from "./index"

describe("starter templates", () => {
  const templates = listStarterTemplates()

  it("ships 6–10 templates, one per JSON file, with unique starter ids", () => {
    expect(templates.length).toBeGreaterThanOrEqual(6)
    expect(templates.length).toBeLessThanOrEqual(10)
    const files = readdirSync(path.join(process.cwd(), "lib/render/templates")).filter((f) => /^starter-.*(?<!\.values)\.json$/.test(f))
    expect(templates.map((t) => `${t.id}.json`).sort()).toEqual(files.sort())
    expect(new Set(templates.map((t) => t.id)).size).toBe(templates.length)
    for (const t of templates) {
      expect(isStarterTemplateId(t.id)).toBe(true)
      expect(getStarterTemplate(t.id)).toBe(t)
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.description.length).toBeGreaterThan(0)
    }
  })

  it.each(templates.map((t) => [t.id, t] as const))("%s validates and resolves with its sample values", async (_id, t) => {
    expect(isTemplate(t.spec)).toBe(true)
    const result = validateSpec(t.spec, { slotValues: t.sampleValues })
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    const resolved = await resolveTemplate(t.spec, t.sampleValues)
    expect(resolved.slides.length).toBeGreaterThan(0)
  })

  it("rejects missing required slots", () => {
    const t = getStarterTemplate("starter-photo-outline")!
    const result = validateSpec(t.spec, { slotValues: {} })
    expect(result.errors.map((e) => e.code)).toContain("slot.list_bounds")
  })
})
