import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import collageTemplate from "@/lib/render/fixtures/collage.template.json"
import listicleTemplate from "@/lib/render/fixtures/listicle.template.json"
import quoteTemplate from "@/lib/render/fixtures/quote-carousel.template.json"
import { resolveTemplate, type SlideshowSpec } from "@/lib/render/spec"

import { SlotFiller, buildRenderRequest } from "./slot-filler"
import { SlotForm } from "./slot-form"
import {
  imageSlots,
  initialSlotValues,
  issuesBySlotPath,
  moveListItem,
  placeholderLabelFromUrl,
  previewSlotValues,
  randomCollectionSource,
  setSlotValue,
  slotValueIssues,
} from "./slot-values"

const listicle = listicleTemplate as unknown as SlideshowSpec
const quotes = quoteTemplate as unknown as SlideshowSpec
const collage = collageTemplate as unknown as SlideshowSpec

describe("slot values", () => {
  it("pads list slots to their minimum and keeps seeded values", () => {
    const values = initialSlotValues(collage)
    expect(values.photos).toHaveLength(4)
    expect(initialSlotValues(listicle, { hook: "Hi" })).toMatchObject({ hook: "Hi", items: [{}] })
  })

  it("lists every image slot, including image fields of list items", () => {
    const values = initialSlotValues(listicle)
    const slots = imageSlots(listicle, setSlotValue(values, ["items", 1, "title"], "Second"))
    expect(slots.map((slot) => slot.path.join("/"))).toEqual([
      "hookImage",
      "items/0/image",
      "items/1/image",
      "ctaImage",
    ])
    expect(slots[0]).toMatchObject({ label: "Hook photo", required: true })
  })

  it("updates nested list fields immutably and reorders items", () => {
    const start = { items: [{ title: "a" }, { title: "b" }] }
    const next = setSlotValue(start, ["items", 0, "image"], { media: "m1" })
    expect(start.items[0]).toEqual({ title: "a" })
    expect(next.items).toEqual([{ title: "a", image: { media: "m1" } }, { title: "b" }])
    expect(moveListItem(next, "items", 1, -1).items).toEqual([
      { title: "b" },
      { title: "a", image: { media: "m1" } },
    ])
  })

  it("creates a seeded random collection pick", () => {
    expect(randomCollectionSource("col-1", "seed-1")).toEqual({
      collection: "col-1",
      pick: "random",
      seed: "seed-1",
    })
  })

  it("fills empty required slots with preview placeholders that resolve", async () => {
    const values = previewSlotValues(listicle, initialSlotValues(listicle))
    expect(placeholderLabelFromUrl((values.hookImage as { url: string }).url)).toBe("Hook photo")
    expect(values.hook).toBe("Hook")
    const resolved = await resolveTemplate(listicle, values)
    expect(resolved.slides.map((slide) => slide.id)).toEqual(["hook", "item-1", "cta"])
  })

  it("reports missing required slots by slot path for inline errors", () => {
    const { errors } = slotValueIssues(listicle, initialSlotValues(listicle, { hook: "" }))
    const byPath = issuesBySlotPath(errors)
    expect(byPath.get("hook")?.[0].code).toBe("slot.required")
    expect(byPath.get("hookImage")?.[0].code).toBe("slot.required")
    expect(byPath.get("items/0/title")?.[0].code).toBe("slot.required")
  })
})

describe("SlotForm", () => {
  it("renders image slots as drop targets and text slots as plain inputs", () => {
    const html = renderToStaticMarkup(
      <SlotForm spec={listicle} values={initialSlotValues(listicle)} onChange={vi.fn()} />
    )
    expect(html).toContain("Hook photo: choose image")
    expect(html).toContain("Choose or drop image")
    expect(html).toContain(">Closing line<")
    expect(html).toContain('maxLength="140"')
    expect(html).toContain("Add item")
    expect(html).toContain('aria-label="Remove List items 1"')
  })

  it("shows picked sources and inline slot errors", () => {
    const values = setSlotValue(
      initialSlotValues(listicle),
      ["hookImage"],
      randomCollectionSource("bedroom", "2026")
    )
    const { errors } = slotValueIssues(listicle, values)
    const html = renderToStaticMarkup(
      <SlotForm spec={listicle} values={values} onChange={vi.fn()} issues={issuesBySlotPath(errors)} />
    )
    expect(html).toContain("Random from collection")
    expect(html).toContain("Seed 2026")
    expect(html).toContain('Slot &quot;hook&quot; (text) is required.')
  })

  it("renders colour slots and multiline list text for text-only templates", () => {
    const html = renderToStaticMarkup(
      <SlotForm spec={quotes} values={initialSlotValues(quotes)} onChange={vi.fn()} />
    )
    expect(html).toContain('type="color"')
    expect(html).toContain("<textarea")
    expect(html).not.toContain("Choose or drop image")
  })
})

describe("SlotFiller", () => {
  it("renders the template heading, a single Render action and the preview region", () => {
    const html = renderToStaticMarkup(
      <SlotFiller
        target={{ id: "starter-listicle", name: "Listicle", spec: listicle, starter: true }}
        onBack={vi.fn()}
        onRendered={vi.fn()}
      />
    )
    expect(html).toContain(">Listicle</h1>")
    expect(html.match(/>Render</g)).toHaveLength(1)
    expect(html).toContain('aria-label="Back to templates"')
    expect(html).toContain(">Preview</h2>")
  })

  it("sends starters and pasted specs inline and stored templates by id", () => {
    const values = { hook: "Hi", hookImage: { media: "m1" }, items: [{ title: "", image: { media: "m2" } }] }
    const starter = buildRenderRequest(
      { id: "starter-listicle", name: "Listicle", spec: listicle, starter: true },
      values,
      { title: " Sleep ", format: "jpeg" }
    )
    expect(starter.spec).toBe(listicle)
    expect(starter.templateId).toBeUndefined()
    expect(starter.slotValues).toEqual({ hook: "Hi", hookImage: { media: "m1" }, items: [{ image: { media: "m2" } }] })
    expect(starter.output).toEqual({ format: "jpeg", zip: true })
    expect(starter.title).toBe("Sleep")

    const stored = buildRenderRequest({ id: "tpl_1", name: "Mine", spec: listicle }, values)
    expect(stored.templateId).toBe("tpl_1")
    expect(stored.spec).toBeUndefined()
  })
})
