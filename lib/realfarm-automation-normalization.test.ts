import { describe, expect, it } from "vitest"

import {
  automationPostingMode,
  automationProviderPublishesVideo,
  defaultAutomationSchema,
  normalizeAutomationSchema,
  type AutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

const automation = {
  id: "automation-normalization",
  name: "Normalization",
  status: "live",
  account: "LumenClip",
  handle: "@lumenclip",
  times: [],
  automationKind: "slideshow",
  favorite: false,
  theme: "default",
  socialIntegrations: [],
} satisfies Automation

describe("automation schema normalization", () => {
  it("defaults scheduled content to auto-publish and preserves explicit manual mode", () => {
    const defaults = defaultAutomationSchema(automation)
    expect(automationPostingMode(defaults)).toBe("auto")
    expect(defaults.tiktok_post_settings.auto_post).toBe(true)

    expect(
      automationPostingMode({
        ...defaults,
        posting_mode: "manual",
      })
    ).toBe("manual")
  })

  it("does not recover tone from obsolete formatting entries", () => {
    const base = defaultAutomationSchema(automation)
    const normalized = normalizeAutomationSchema(
      {
        ...base,
        tone: undefined,
        formatting: [
          ...base.formatting,
          { id: "_tone", value: "all lowercase", preset: "custom" },
        ],
      } as unknown as AutomationSchema,
      automation
    )

    expect(normalized.tone).toEqual(base.tone)
    expect(normalized.formatting.map((item) => item.id)).toEqual([
      "hook",
      "body",
      "cta",
    ])
  })

  it("ignores obsolete interval schedules", () => {
    const base = defaultAutomationSchema(automation)
    const normalized = normalizeAutomationSchema(
      {
        ...base,
        schedule: {
          timezone: "Asia/Singapore",
          interval: {
            every_n_hours: 3,
            start_time: "9:00 AM",
            end_time: "3:00 PM",
            days: ["Mon", "Wed"],
          },
        },
      } as unknown as AutomationSchema,
      automation
    )

    expect(normalized.schedule).not.toHaveProperty("interval")
    expect(normalized.schedule.posting_times).toEqual(
      base.schedule.posting_times
    )
  })

  it("drops obsolete image flags from the canonical config", () => {
    const base = defaultAutomationSchema(automation)
    const normalized = normalizeAutomationSchema(
      {
        ...base,
        image_collection_ids: {
          ...base.image_collection_ids,
          autoPullImagesNotCollections: true,
          noTextOnSlides: true,
        },
      } as unknown as AutomationSchema,
      automation
    )

    expect(normalized.image_collection_ids).not.toHaveProperty(
      "autoPullImagesNotCollections"
    )
    expect(normalized.image_collection_ids).not.toHaveProperty("noTextOnSlides")
  })

  it("keeps image fitting and language at the automation root", () => {
    const base = defaultAutomationSchema(automation)
    const normalized = normalizeAutomationSchema(
      {
        ...base,
        image_fit: "cover",
        language: "Spanish",
      },
      automation
    )

    expect(normalized.image_fit).toBe("cover")
    expect(normalized.language).toBe("Spanish")
    expect(normalized.image_collection_ids).not.toHaveProperty("language")
  })

  it("promotes legacy section ratio and font to shared slide settings", () => {
    const base = defaultAutomationSchema(automation)
    const legacy = {
      ...base,
      aspect_ratio: undefined,
      font: undefined,
      formatting: base.formatting.map((section) =>
        section.id === "body"
          ? {
              ...section,
              aspect_ratio: "4:5" as const,
              textItems: section.textItems.map((item) => ({
                ...item,
                font: "Inter",
              })),
            }
          : section
      ),
    } as unknown as AutomationSchema

    const normalized = normalizeAutomationSchema(legacy, automation)

    expect(normalized.aspect_ratio).toBe("4:5")
    expect(normalized.font).toBe("Inter")
  })

  it("uses section overlays as the only overlay configuration", () => {
    const base = defaultAutomationSchema(automation)
    const normalized = normalizeAutomationSchema(base, automation)

    expect(normalized.image_collection_ids).not.toHaveProperty("overlay")
    expect(
      normalized.formatting.find((item) => item.id === "hook")?.overlay
    ).toBe(true)
  })

  it("keeps native video automations in video publishing mode", () => {
    const base = defaultAutomationSchema(automation)
    const normalized = normalizeAutomationSchema(
      {
        ...base,
        automationKind: "video",
        tiktok_post_settings: {
          ...base.tiktok_post_settings,
          publish_type: "slideshow",
        },
        social_publish_as: {},
      },
      automation
    )

    expect(normalized.tiktok_post_settings.publish_type).toBe("video")
    expect(automationProviderPublishesVideo(normalized, "instagram")).toBe(true)
  })
})
