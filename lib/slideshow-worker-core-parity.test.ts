import { describe, expect, it } from "vitest"

import { slideshowRunId as appSlideshowRunId } from "@/lib/automation-runner"
import {
  applyHookCase as appApplyHookCase,
  automationHookItems as appAutomationHookItems,
  automationHooks as appAutomationHooks,
  isAutomationHookInstruction as appIsHookInstruction,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import {
  effectivePostingMode as appEffectivePostingMode,
  postFastSchedulePayload as appPostFastSchedulePayload,
} from "@/lib/publishing"
import {
  selectedBodySlideCount as appSelectedBodySlideCount,
  slideSpecs as appSlideSpecs,
  slideshowTextItem as appSlideshowTextItem,
  specForSection as appSpecForSection,
  textItemsForSpec as appTextItemsForSpec,
} from "@/lib/temp-slide-testing"
import { usageForPublishedRuns as appUsageForPublishedRuns } from "@/lib/usage-ledger"

const workerPlanUrl = new URL(
  "../appwrite/functions/job-worker/src/slideshow-plan-core.js",
  import.meta.url
).href
const workerPublishingUrl = new URL(
  "../appwrite/functions/job-worker/src/publishing-core.js",
  import.meta.url
).href
const workerUsageUrl = new URL(
  "../appwrite/functions/job-worker/src/usage-core.js",
  import.meta.url
).href

const schema = {
  hooks: [
    { id: "hook-a", text: "3 Signs You Need A Reset", enabled: true },
    { id: "hook-b", text: "Retired hook", enabled: false },
    { id: "instruction", text: "Hook text, all lowercase", enabled: true },
  ],
  formatting: [
    {
      id: "hook",
      aspect_ratio: "9:16",
      textItems: [
        {
          id: "hook-copy",
          textPosition: "center",
          textAlign: "center",
          textAnchor: "padded",
        },
      ],
    },
    {
      id: "body",
      slideCount: 2,
      slideCountMode: "varying",
      slideCountMin: 2,
      slideCountMax: 4,
      slideOverrides: [
        { slideIndex: 1, contentDirection: "Lead with the consequence" },
      ],
      imageOverrides: [{ slideIndex: 2, collectionId: "body-special" }],
      textItems: [
        {
          id: "body-copy",
          textMode: "prompt",
          textPosition: "bottom",
          textItemWidth: "72%",
        },
      ],
    },
    { id: "cta", slideCount: 1, noText: true, textItems: [] },
  ],
  aspect_ratio: "9:16",
  font: "Inter",
  image_collection_ids: {
    all_slides: "body-default",
    first_slide: { collection: "hook-images" },
    cta_slide: { check: true, cta_collection_id: "cta-images" },
  },
  posting_mode: "review",
}
const hookSchema = schema as unknown as Partial<AutomationSchema>

describe("app and generated worker core parity", () => {
  it("keeps run identity, hook policy, and slideshow plan shaping identical", async () => {
    const worker = (await import(workerPlanUrl)) as {
      slideshowRunId: typeof appSlideshowRunId
      applyHookCase: typeof appApplyHookCase
      automationHookItems: typeof appAutomationHookItems
      automationHooks: typeof appAutomationHooks
      isHookInstruction: typeof appIsHookInstruction
      selectedBodySlideCount: typeof appSelectedBodySlideCount
      slideSpecs: typeof appSlideSpecs
      slideshowTextItem: typeof appSlideshowTextItem
      specForSection: typeof appSpecForSection
      textItemsForSpec: typeof appTextItemsForSpec
    }

    const appRunId = appSlideshowRunId(
      "automation-17",
      "2026-07-26T08:30:00.000Z"
    )
    expect(appRunId).toMatch(/^arun[0-9a-f]{32}$/)
    expect(appRunId).toBe(
      worker.slideshowRunId("automation-17", "2026-07-26T08:30:00.000Z")
    )
    expect(appAutomationHookItems(hookSchema)).toEqual(
      worker.automationHookItems(hookSchema)
    )
    expect(appAutomationHooks(hookSchema)).toEqual(
      worker.automationHooks(hookSchema)
    )
    expect(appAutomationHooks(hookSchema)).toEqual(["3 Signs You Need A Reset"])
    expect(appIsHookInstruction("Hook text, all lowercase")).toBe(
      worker.isHookInstruction("Hook text, all lowercase")
    )
    expect(
      appApplyHookCase("Three Signs You Need A Reset", {
        hook_case: "title",
        style: "All text in lowercase.",
      })
    ).toBe(
      worker.applyHookCase("Three Signs You Need A Reset", {
        hook_case: "title",
        style: "All text in lowercase.",
      })
    )

    const appCount = appSelectedBodySlideCount(schema, 5)
    const workerCount = worker.selectedBodySlideCount(schema, 5)
    expect(appCount).toBe(4)
    expect(appCount).toBe(workerCount)

    const appSpecs = appSlideSpecs(schema, "3 signs you need a reset", appCount)
    const workerSpecs = worker.slideSpecs(
      schema,
      "3 signs you need a reset",
      workerCount
    )
    expect(appSpecs).toEqual(workerSpecs)
    expect(appSpecs.map((spec) => spec.id)).toEqual([
      "hook-1",
      "content-2",
      "content-3",
      "content-4",
      "cta-5",
    ])
    expect(
      appSpecForSection(schema, schema.formatting[1]!, "content", 2)
    ).toEqual(
      worker.specForSection(schema, schema.formatting[1]!, "content", 2)
    )

    const generated = {
      text: Object.fromEntries(
        appSpecs.flatMap((spec) =>
          spec.textItems.map((item) => [item.id, `Copy for ${item.id}`])
        )
      ),
    }
    expect(
      appTextItemsForSpec({
        spec: appSpecs[1]!,
        hook: "3 signs you need a reset",
        generated,
        schema,
      })
    ).toEqual(
      worker.textItemsForSpec({
        spec: workerSpecs[1]!,
        hook: "3 signs you need a reset",
        generated,
        schema,
      })
    )
    expect(
      appSlideshowTextItem(
        { textPosition: "center", textAlign: "left" },
        "Deterministic fallback id",
        schema,
        "hook"
      )
    ).toEqual(
      worker.slideshowTextItem(
        { textPosition: "center", textAlign: "left" },
        "Deterministic fallback id",
        schema,
        "hook"
      )
    )
  })

  it("keeps posting mode and PostFast schedule payload policy identical", async () => {
    const worker = (await import(workerPublishingUrl)) as {
      effectivePostingMode: typeof appEffectivePostingMode
      postFastSchedulePayload: typeof appPostFastSchedulePayload
    }
    const input = {
      content: "Scheduled slideshow",
      integrationId: "social-7",
      media: [{ key: "slide-1.png", type: "IMAGE", sortOrder: 4 }],
      provider: "tiktok",
      scheduledFor: "2026-07-26T08:30:00.000Z",
      settings: { tiktokTitle: "Scheduled slideshow" },
    }

    expect(appEffectivePostingMode(schema)).toBe("review")
    expect(appEffectivePostingMode(schema)).toBe(
      worker.effectivePostingMode(schema)
    )
    const appPayload = appPostFastSchedulePayload(input)
    expect(appPayload).toMatchObject({
      status: "SCHEDULED",
      posts: [
        {
          socialMediaId: "social-7",
          scheduledAt: "2026-07-26T08:30:00.000Z",
          mediaItems: [{ key: "slide-1.png", type: "IMAGE", sortOrder: 4 }],
        },
      ],
    })
    expect(appPayload).toEqual(worker.postFastSchedulePayload(input))
  })

  it("keeps published-run usage selection identical", async () => {
    const worker = (await import(workerUsageUrl)) as {
      usageForPublishedRuns: typeof appUsageForPublishedRuns
    }
    const usage = [
      {
        automation_id: "automation-17",
        kind: "image",
        key: "published-image",
        run_id: "published-run",
        used_at: "2026-07-25T08:00:00.000Z",
      },
      {
        automation_id: "automation-17",
        kind: "hook_published",
        key: "published-hook",
        run_id: "published-run",
        used_at: "2026-07-26T08:00:00.000Z",
      },
      {
        automation_id: "automation-17",
        kind: "image",
        key: "draft-image",
        run_id: "draft-run",
        used_at: "2026-07-26T09:00:00.000Z",
      },
    ]

    const appUsage = appUsageForPublishedRuns(usage, "automation-17")
    expect(appUsage).toEqual([
      { ...usage[0], used_at: "2026-07-26T08:00:00.000Z" },
      usage[1],
    ])
    expect(appUsage).toEqual(
      worker.usageForPublishedRuns(usage, "automation-17")
    )
  })
})
