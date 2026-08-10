import { describe, expect, it } from "vitest"

import { migrateTemplateToFixedSlideCount } from "@/lib/fixed-slideshow-count-migration"

const now = "2026-08-10T10:00:00.000Z"

function record() {
  return {
    id: "template-1",
    schema: {
      prompt_formatting: {
        num_of_slides: 7,
        slide_count_min: 3,
        slide_count_max: 12,
      },
      formatting: [
        { id: "hook", slideCount: 1, slideCountMode: "static" },
        {
          id: "body",
          slideCount: 5,
          slideCountMode: "varying",
          slideCountMin: 3,
          slideCountMax: 8,
        },
        { id: "cta", slideCount: 1, slideCountMode: "static" },
      ],
      hooks: [
        { id: "static", text: "A fixed hook", enabled: true },
        {
          id: "published",
          text: "[[SLIDE_COUNT]] things to know",
          enabled: true,
        },
        {
          id: "unpublished",
          text: "A ranked list",
          bodySlideCount: 12,
          enabled: true,
        },
      ],
    },
  }
}

describe("migrateTemplateToFixedSlideCount", () => {
  it("fixes the count, disables published dynamic hooks, and deletes unpublished ones", () => {
    const result = migrateTemplateToFixedSlideCount({
      record: record(),
      publishedHookIds: new Set(["published"]),
      now,
    })

    expect(result.disabledHookIds).toEqual(["published"])
    expect(result.deletedHookIds).toEqual(["unpublished"])
    expect(result.record.schema).toMatchObject({
      prompt_formatting: {
        num_of_slides: 7,
        slide_count_min: 7,
        slide_count_max: 7,
      },
      hooks: [
        { id: "static", enabled: true },
        { id: "published", enabled: false },
      ],
    })
    expect(
      (result.record.schema as { formatting: Array<Record<string, unknown>> })
        .formatting
    ).toEqual([
      { id: "hook", slideCount: 1, slideCountMode: "static" },
      { id: "body", slideCount: 5, slideCountMode: "static" },
      { id: "cta", slideCount: 1, slideCountMode: "static" },
    ])
  })

  it("is idempotent", () => {
    const first = migrateTemplateToFixedSlideCount({
      record: record(),
      publishedHookIds: new Set(["published"]),
      now,
    })
    const second = migrateTemplateToFixedSlideCount({
      record: first.record,
      publishedHookIds: new Set(["published"]),
      now: "2026-08-10T11:00:00.000Z",
    })
    expect(second.changed).toBe(false)
  })
})
