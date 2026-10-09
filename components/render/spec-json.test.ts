import { describe, expect, it } from "vitest"

import listicleTemplate from "@/lib/render/fixtures/listicle.template.json"
import listicleValues from "@/lib/render/fixtures/listicle.values.json"

import { decodePointer, locateJsonPointer, offsetToLocation } from "./json-locate"
import { analyzeSpecJson, issueLocationLabel } from "./spec-json"

const instance = {
  version: 1,
  canvas: { preset: "1:1", background: "#101010" },
  slides: [
    {
      id: "only",
      layers: [
        {
          id: "title",
          type: "text",
          text: "Hello",
          frame: { x: "10%", y: "10%", width: "80%" },
        },
      ],
    },
  ],
}

describe("analyzeSpecJson", () => {
  it("treats blank input as empty", () => {
    expect(analyzeSpecJson("   \n")).toEqual({ status: "empty" })
  })

  it("reports JSON syntax errors with a line and column", () => {
    const text = '{\n  "version": 1,\n  "canvas": {\n}'
    const result = analyzeSpecJson(text)
    expect(result.status).toBe("parse_error")
    if (result.status !== "parse_error") return
    expect(result.message).toBeTruthy()
    expect(result.location?.line).toBeGreaterThanOrEqual(3)
  })

  it("maps schema errors to JSON Pointer paths and the pasted line", () => {
    const broken = structuredClone(instance) as Record<string, unknown>
    ;(broken.slides as { layers: { frame: { width: unknown } }[] }[])[0].layers[0].frame.width = "wide"
    const text = JSON.stringify(broken, null, 2)
    const result = analyzeSpecJson(text)
    expect(result.status).toBe("invalid")
    if (result.status !== "invalid") return
    const issue = result.errors.find((e) => e.path.startsWith("/slides/0/layers/0"))
    expect(issue, JSON.stringify(result.errors)).toBeDefined()
    expect(issue!.code.startsWith("schema.")).toBe(true)
    expect(issue!.location).not.toBeNull()
    const lineText = text.split("\n")[issue!.location!.line - 1]
    expect(lineText).toMatch(/"(width|frame|0|slides|layers)"|\{/)
    expect(issueLocationLabel(issue!)).toMatch(/^Line \d+ · \/slides\/0\/layers\/0/)
  })

  it("accepts an instance spec as ready to render", () => {
    const result = analyzeSpecJson(JSON.stringify(instance))
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.template).toBe(false)
    expect(result.needsSlotValues).toBe(false)
  })

  it("asks for slot values when a template is pasted alone", () => {
    const result = analyzeSpecJson(JSON.stringify(listicleTemplate, null, 2))
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.template).toBe(true)
    expect(result.needsSlotValues).toBe(true)
    expect(result.title).toBe(listicleTemplate.name)
  })

  it("validates a {spec, slotValues} wrapper and points slot errors into slotValues", () => {
    const values = structuredClone(listicleValues) as Record<string, unknown>
    delete values.hook
    const text = JSON.stringify({ spec: listicleTemplate, slotValues: values, title: "Sleep" }, null, 2)
    const result = analyzeSpecJson(text)
    expect(result.status).toBe("invalid")
    if (result.status !== "invalid") return
    const required = result.errors.find((e) => e.code === "slot.required")
    expect(required?.path).toBe("/slotValues/hook")
    expect(required?.textPath).toBe("/slotValues/hook")
    expect(required?.location).not.toBeNull()
  })

  it("prefixes template errors inside a wrapper with /spec", () => {
    const text = JSON.stringify({ spec: { ...instance, canvas: {} } }, null, 2)
    const result = analyzeSpecJson(text)
    expect(result.status).toBe("invalid")
    if (result.status !== "invalid") return
    expect(result.errors.every((e) => e.textPath.startsWith("/spec"))).toBe(true)
  })

  it("renders a complete wrapper without asking for slots", () => {
    const text = JSON.stringify({ spec: listicleTemplate, slotValues: listicleValues })
    const result = analyzeSpecJson(text)
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.needsSlotValues).toBe(false)
    expect(result.slotValues).toEqual(listicleValues)
  })
})

describe("json-locate", () => {
  it("decodes RFC 6901 escapes", () => {
    expect(decodePointer("/a~1b/c~0d/0")).toEqual(["a/b", "c~d", "0"])
    expect(decodePointer("")).toEqual([])
  })

  it("finds nested members and array items", () => {
    const text = '{\n  "a": [\n    1,\n    { "b": true }\n  ]\n}'
    expect(locateJsonPointer(text, "/a")?.line).toBe(2)
    expect(locateJsonPointer(text, "/a/1")?.line).toBe(4)
    expect(locateJsonPointer(text, "/a/1/b")?.line).toBe(4)
  })

  it("falls back to the deepest existing parent for missing members", () => {
    const text = '{\n  "a": {\n    "x": 1\n  }\n}'
    expect(locateJsonPointer(text, "/a/missing")?.line).toBe(2)
  })

  it("converts offsets to 1-based positions", () => {
    expect(offsetToLocation("ab\ncd", 4)).toEqual({ line: 2, column: 2, offset: 4 })
  })
})
