import { describe, expect, it } from "vitest"

import { automationHookItems } from "./slideshow-plan-core.js"
import { usageForPublishedRuns } from "./usage-core.js"
import {
  selectSlideshowHook,
  selectSlideshowImages,
} from "./slideshow-generation-engine.js"
import {
  reminderChannel,
  shouldBlockAutomaticPublication,
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

describe("scheduled worker Telegram reminder policy", () => {
  it("uses the nested per-event channel", () => {
    expect(
      reminderChannel(
        {
          notificationDefaultsApplied: true,
          events: { generated: { channel: "telegram" } },
        },
        "generated"
      )
    ).toBe("telegram")
  })

  it("migrates a linked legacy all-Off workspace to generation delivery", () => {
    expect(
      reminderChannel(
        {
          telegramChatId: "123456",
          events: { generated: { channel: "none" } },
        },
        "generated"
      )
    ).toBe("telegram")
  })

  it("respects an intentional all-Off policy after migration", () => {
    expect(
      reminderChannel(
        {
          telegramChatId: "123456",
          notificationDefaultsApplied: true,
          events: { generated: { channel: "none" } },
        },
        "generated"
      )
    ).toBe("none")
  })
})

describe("scheduled worker QA publication gate", () => {
  it("blocks only automatic publication when deterministic QA fails", () => {
    expect(shouldBlockAutomaticPublication("auto", { valid: false })).toBe(true)
    expect(shouldBlockAutomaticPublication("auto", { valid: true })).toBe(false)
    expect(shouldBlockAutomaticPublication("review", { valid: false })).toBe(
      false
    )
  })
})

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
  const recentImageUsage = new Map(
    usageForPublishedRuns(usage, "automation-1")
      .filter((record) => record.kind === "image")
      .map((record) => [record.key, record.used_at])
  )
  return selectSlideshowImages({
    hook: "Choose the CTA",
    fallbackTitle: "CTA selection",
    specs: [
      {
        id: "cta-1",
        index: 0,
        section: "cta",
        title: "CTA",
        aspectRatio: "9:16",
        imageGrid: "none",
        overlay: false,
        displayText: false,
        collectionId: "cta-collection",
        aiImageSelection: false,
        textItems: [],
      },
    ],
    generatedText: { title: "", caption: "", hashtags: "", text: {} },
    ctaPinnedImageId: pinnedImageId,
    candidatesForSpec: () => ctaImages,
    recentImageUsage,
    random: () => seedValue / ctaImages.length,
  })
}

function selectWorkerFirstSlideImages({
  pinnedImageId,
  mode = "single_image",
  usage = [],
  seedValue = 0,
}) {
  const recentImageUsage = new Map(
    usageForPublishedRuns(usage, "automation-1")
      .filter((record) => record.kind === "image")
      .map((record) => [record.key, record.used_at])
  )
  return selectSlideshowImages({
    hook: "Choose the hook image",
    fallbackTitle: "First slide selection",
    specs: [
      {
        id: "hook-1",
        index: 0,
        section: "hook",
        title: "Hook",
        aspectRatio: "9:16",
        imageGrid: "none",
        overlay: false,
        displayText: true,
        collectionId: "cta-collection",
        aiImageSelection: false,
        textItems: [],
      },
    ],
    generatedText: { title: "", caption: "", hashtags: "", text: {} },
    firstSlidePinnedImageId:
      mode === "single_image" ? pinnedImageId : undefined,
    candidatesForSpec: () => ctaImages,
    recentImageUsage,
    random: () => seedValue / ctaImages.length,
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
    expect(
      automationHookItems(value)
        .filter((item) => item.enabled)
        .map((item) => item.id)
    ).toEqual(["published", "fresh"])

    const selected = selectSlideshowHook({
      hookItems: automationHookItems(value).filter((item) => item.enabled),
      hookSlots: value.hook_slots,
      wordCollections: [],
      usedHookKeys: new Set(["published hook"]),
      noDuplicateSlots: true,
      caseMode: "mixed",
      now: new Date("2026-07-18T12:00:00.000Z"),
      timeZone: "UTC",
      selectIndex: () => 0,
    })

    expect(selected).toMatchObject({
      hookId: "fresh",
      expansion: { text: "Fresh hook" },
    })
  })

  it("does not treat draft media usage as publication", () => {
    const value = schema()
    value.hooks = [{ id: "draft", text: "Draft-only hook", enabled: true }]

    const selected = selectSlideshowHook({
      hookItems: automationHookItems(value).filter((item) => item.enabled),
      hookSlots: value.hook_slots,
      wordCollections: [],
      usedHookKeys: new Set(),
      noDuplicateSlots: true,
      caseMode: "mixed",
      now: new Date("2026-07-18T12:00:00.000Z"),
      timeZone: "UTC",
      selectIndex: () => 0,
    })

    expect(selected).toMatchObject({
      hookId: "draft",
      expansion: { text: "Draft-only hook" },
    })
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

    const selected = selectSlideshowHook({
      hookItems: automationHookItems(value).filter((item) => item.enabled),
      hookSlots: value.hook_slots,
      wordCollections: [],
      usedHookKeys: new Set(),
      noDuplicateSlots: true,
      caseMode: "mixed",
      now: new Date("2026-07-18T12:00:00.000Z"),
      timeZone: "UTC",
      slideCount: 5,
      selectIndex: () => 0,
    })

    expect(selected).toMatchObject({
      hookId: "count-aware",
      expansion: {
        text: "5 things worth knowing",
        substitutions: { SLIDE_COUNT: "5" },
      },
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
