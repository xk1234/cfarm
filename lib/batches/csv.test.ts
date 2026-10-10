import { describe, expect, it } from "vitest"

import type { SlotDef } from "@/lib/render/spec"

import { csvToItems, parseCsv } from "./csv"

const SLOTS: Record<string, SlotDef> = {
  hook: { type: "text", required: true },
  count: { type: "number" },
  dark: { type: "boolean" },
  cover: { type: "image" },
  slides: {
    type: "list",
    item: {
      image: { type: "image", required: true },
      caption: { type: "text", required: true },
    },
  },
}

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, embedded commas/newlines, CRLF and a BOM", () => {
    const text =
      String.fromCharCode(0xfeff) +
      'a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n\r\n1,,3'
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'say "hi"', "line1\nline2"],
      ["1", "", "3"],
    ])
  })
})

describe("csvToItems", () => {
  it("maps columns to slots, list paths and reserved fields", () => {
    const csv = [
      "hook,count,dark,cover,slides.0.image,slides.0.caption,slides.1.image,slides.1.caption,caption,platformOptions",
      'Stop scrolling,3,yes,collection:Sunsets,media:m1,First,https://img.test/a.png,Second,"My caption #fyp","{""tiktok"":{""auto_add_music"":true}}"',
      "Second hook,,no,,media:m2,Only one,,,,",
    ].join("\n")
    const { items, errors } = csvToItems(csv, { slots: SLOTS })
    expect(errors).toEqual([])
    expect(items).toEqual([
      {
        slotValues: {
          hook: "Stop scrolling",
          count: 3,
          dark: true,
          cover: { collection: "Sunsets", pick: "random" },
          slides: [
            { image: { media: "m1" }, caption: "First" },
            { image: "https://img.test/a.png", caption: "Second" },
          ],
        },
        caption: "My caption #fyp",
        platformOptions: { tiktok: { auto_add_music: true } },
      },
      {
        slotValues: {
          hook: "Second hook",
          dark: false,
          slides: [{ image: { media: "m2" }, caption: "Only one" }],
        },
      },
    ])
  })

  it("renames columns with a mapping and ignores columns mapped to null", () => {
    const csv = "Headline,Notes,Post text\nHello,internal,Caption here"
    const { items, errors } = csvToItems(csv, {
      slots: SLOTS,
      mapping: { Headline: "hook", Notes: null, "Post text": "caption" },
    })
    expect(errors).toEqual([])
    expect(items).toEqual([
      { slotValues: { hook: "Hello" }, caption: "Caption here" },
    ])
  })

  it("rejects unknown columns, bad values and stale mapping entries with paths", () => {
    const unknown = csvToItems("hook,extra\na,b", {
      slots: SLOTS,
      mapping: { Missing: "hook" },
    })
    expect(unknown.errors.map((e) => e.path)).toEqual([
      "/mapping/Missing",
      "/csv/columns/1",
    ])
    const values = csvToItems(
      "hook,count,dark,platformOptions\na,many,maybe,[1]",
      { slots: SLOTS }
    )
    expect(values.errors.map((e) => e.path)).toEqual([
      "/csv/rows/1/count",
      "/csv/rows/1/dark",
      "/csv/rows/1/platformOptions",
    ])
    expect(csvToItems("hook", { slots: SLOTS }).errors[0]?.code).toBe(
      "csv.empty"
    )
    expect(csvToItems("slides\nx", { slots: SLOTS }).errors[0]?.code).toBe(
      "csv.unknown_column"
    )
  })
})
