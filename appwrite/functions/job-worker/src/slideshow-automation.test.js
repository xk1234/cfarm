import { describe, expect, it } from "vitest"

import {
  automationHookItems,
  selectImagesForSlides,
  selectHook,
  usageForPublishedRuns,
} from "./slideshow-automation.js"

function schema() {
  return {
    hooks: [
      { id: "published", text: "Published hook", enabled: true },
      { id: "fresh", text: "Fresh hook", enabled: true },
      { id: "disabled", text: "Disabled hook", enabled: false },
    ],
    hook_slots: {},
    hook_no_duplicate_slots: false,
    prompt_formatting: { hook_case: "mixed", narrative: "Legacy hook" },
    schedule: { timezone: "UTC" },
    reuse_policy: { hook_exclusion_days: 45 },
  }
}

const ctaImages = [
  {
    id: "image-a",
    key: "key-a",
    imageUrl: "https://example.com/a.jpg",
    imageCaption: "First CTA",
  },
  {
    id: "image-b",
    key: "key-b",
    imageUrl: "https://example.com/b.jpg",
    imageCaption: "Pinned CTA",
  },
]

function selectWorkerCtaImages({ pinnedImageId, usage = [], seedValue = 0 }) {
  return selectImagesForSlides({
    automation: {
      id: "automation-1",
      schema: {
        formatting: [
          { id: "hook", imageMode: "collection" },
          { id: "cta", imageMode: "single_image" },
        ],
        image_collection_ids: {
          cta_slide: { image_id: pinnedImageId },
        },
      },
    },
    hook: "Choose the CTA",
    specs: [
      {
        id: "cta-1",
        section: "cta",
        collectionId: "cta-collection",
        aiImageSelection: false,
        textItems: [],
      },
    ],
    generated: { text: {} },
    collections: [
      {
        aliases: ["cta-collection"],
        images: ctaImages,
      },
    ],
    usage,
    seed: Buffer.from([0, seedValue]),
  })
}

function selectWorkerFirstSlideImages({
  pinnedImageId,
  mode = "single_image",
  usage = [],
  seedValue = 0,
}) {
  return selectImagesForSlides({
    automation: {
      id: "automation-1",
      schema: {
        formatting: [
          { id: "hook" },
          { id: "cta", imageMode: "collection" },
        ],
        image_collection_ids: {
          first_slide: { mode, single_image: pinnedImageId },
          cta_slide: {},
        },
      },
    },
    hook: "Choose the hook image",
    specs: [
      {
        id: "hook-1",
        section: "hook",
        collectionId: "cta-collection",
        aiImageSelection: false,
        textItems: [],
      },
    ],
    generated: { text: {} },
    collections: [
      {
        aliases: ["cta-collection"],
        images: ctaImages,
      },
    ],
    usage,
    seed: Buffer.from([0, seedValue]),
  })
}

describe("scheduled worker pinned CTA image selection", () => {
  it("selects exactly the pinned CTA image by id", async () => {
    await expect(
      selectWorkerCtaImages({ pinnedImageId: "image-b" })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("selects exactly the pinned CTA image by image URL", async () => {
    await expect(
      selectWorkerCtaImages({
        pinnedImageId: "https://example.com/b.jpg",
      })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("falls back to the full CTA collection when the pinned image is missing", async () => {
    await expect(
      selectWorkerCtaImages({
        pinnedImageId: "deleted-image",
        seedValue: 1,
      })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("selects a pinned CTA image even when it was used recently", async () => {
    await expect(
      selectWorkerCtaImages({
        pinnedImageId: "image-b",
        usage: [
          {
            automation_id: "automation-1",
            run_id: "published-run",
            kind: "image",
            key: "key-b",
            used_at: "2026-07-25T00:00:00.000Z",
          },
          {
            automation_id: "automation-1",
            run_id: "published-run",
            kind: "hook_published",
            key: "published hook",
            used_at: "2026-07-25T00:00:00.000Z",
          },
        ],
      })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })
})

describe("scheduled worker pinned first-slide image selection", () => {
  it("selects exactly the pinned first-slide image by id", async () => {
    await expect(
      selectWorkerFirstSlideImages({ pinnedImageId: "image-b" })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("selects exactly the pinned first-slide image by image URL", async () => {
    await expect(
      selectWorkerFirstSlideImages({
        pinnedImageId: "https://example.com/b.jpg",
      })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("falls back to the full collection when the first-slide pin is missing", async () => {
    await expect(
      selectWorkerFirstSlideImages({
        pinnedImageId: "deleted-image",
        seedValue: 1,
      })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("ignores a persisted pin unless first-slide mode is single_image", async () => {
    await expect(
      selectWorkerFirstSlideImages({
        pinnedImageId: "image-a",
        mode: "collection",
        seedValue: 1,
      })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })

  it("selects a recently-used pinned first-slide image", async () => {
    await expect(
      selectWorkerFirstSlideImages({
        pinnedImageId: "image-b",
        usage: [
          {
            automation_id: "automation-1",
            run_id: "published-run",
            kind: "image",
            key: "key-b",
            used_at: "2026-07-25T00:00:00.000Z",
          },
          {
            automation_id: "automation-1",
            run_id: "published-run",
            kind: "hook_published",
            key: "published hook",
            used_at: "2026-07-25T00:00:00.000Z",
          },
        ],
      })
    ).resolves.toMatchObject([{ id: "image-b" }])
  })
})

describe("scheduled worker hook selection", () => {
  it("uses enabled catalog items and excludes only recently published hooks", () => {
    const value = schema()
    expect(automationHookItems(value).map((item) => item.id)).toEqual([
      "published",
      "fresh",
    ])

    const selected = selectHook({
      schema: value,
      wordCollections: [],
      usage: [
        {
          automation_id: "automation-1",
          kind: "hook_published",
          key: "published hook",
          used_at: "2026-07-17T12:00:00.000Z",
        },
      ],
      automationId: "automation-1",
      scheduledFor: "2026-07-18T12:00:00.000Z",
      seed: Buffer.from([0]),
    })

    expect(selected).toMatchObject({ hookId: "fresh", text: "Fresh hook" })
  })

  it("does not treat draft media usage as publication", () => {
    const value = schema()
    value.hooks = [{ id: "draft", text: "Draft-only hook", enabled: true }]

    const selected = selectHook({
      schema: value,
      wordCollections: [],
      usage: [
        {
          automation_id: "automation-1",
          kind: "image",
          key: "draft-image",
          used_at: "2026-07-18T11:00:00.000Z",
        },
      ],
      automationId: "automation-1",
      scheduledFor: "2026-07-18T12:00:00.000Z",
      seed: Buffer.from([0]),
    })

    expect(selected).toMatchObject({ hookId: "draft", text: "Draft-only hook" })
  })

  it("skips an invalid hook and resolves SLIDE_COUNT on a usable hook", () => {
    const value = schema()
    value.hooks = [
      { id: "broken", text: "Ideas for [[MISSING]]", enabled: true },
      {
        id: "count-aware",
        text: "[[SLIDE_COUNT]] things worth knowing",
        enabled: true,
      },
    ]

    const selected = selectHook({
      schema: value,
      wordCollections: [],
      usage: [],
      automationId: "automation-1",
      scheduledFor: "2026-07-18T12:00:00.000Z",
      seed: Buffer.from([0]),
      bodySlideCount: 5,
    })

    expect(selected).toMatchObject({
      hookId: "count-aware",
      text: "5 things worth knowing",
      substitutions: { SLIDE_COUNT: "5" },
    })
  })
})

describe("scheduled worker anti-duplication history", () => {
  it("excludes draft usage and keeps usage from published runs", () => {
    const usage = [
      {
        automation_id: "automation-1",
        kind: "image",
        key: "published-image",
        run_id: "published-run",
      },
      {
        automation_id: "automation-1",
        kind: "hook_published",
        key: "published hook",
        run_id: "published-run",
      },
      {
        automation_id: "automation-1",
        kind: "image",
        key: "draft-image",
        run_id: "draft-run",
      },
    ]

    expect(usageForPublishedRuns(usage, "automation-1")).toEqual(
      usage.slice(0, 2)
    )
  })
})
