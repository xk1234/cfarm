import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createLocalAutomationRecord, listAutomationRecords, normalizeReelfarmAutomation, upsertAutomationRecords } from "@/lib/automations"

let rootDir: string

beforeEach(async () => {
  rootDir = await mkdtemp(path.join(os.tmpdir(), "cfarm-automations-"))
})

afterEach(async () => {
  await rm(rootDir, { recursive: true, force: true })
})

describe("automation import persistence", () => {
  it("normalizes Reelfarm automation payloads into persisted automation records", async () => {
    const normalized = normalizeReelfarmAutomation({
      id: "rf-123",
      name: "Daily Hooks",
      status: "Live",
      account: "@brand",
      handle: "brand",
      times: ["8:00 AM", "4:00 PM"],
      favorite: true,
      theme: "ugc",
      settings: {
        prompt_formatting: {
          style: "raw text style prompt",
          narrative: "raw narrative prompt",
          num_of_slides: 6,
        },
        formatting: [
          {
            id: "hook",
            image_url: "",
            textItems: [
              {
                id: "text-hook",
                text: "",
                fontSize: "10px",
                textStyle: "whiteText",
                font: "TikTok Display Medium",
                textPosition: "center",
                textItemWidth: "60%",
                wordLengthMin: 5,
                wordLengthMax: 10,
                contentDirection: "first hook",
                textMode: "prompt",
                staticText: "",
                textAlign: "left",
                textAnchor: "flush",
              },
            ],
            aspect_ratio: "4:5",
            imageGrid: "none",
            slideCount: 1,
            noText: false,
            overlay: true,
            overlayOpacity: 25,
          },
          {
            id: "body",
            textItems: [],
            aspect_ratio: "4:5",
            imageGrid: "none",
            slideCount: 5,
            noText: false,
            overlay: true,
            overlayOpacity: 25,
          },
          {
            id: "_tone",
            value: "all lowercase",
            preset: "custom",
          },
        ],
        tiktok_post_settings: {
          caption: { mode: "prompt", static_text: "", prompt_text: "same as first text item" },
          description: { mode: "prompt", static_text: "", prompt_text: "3-5 hashtags" },
          visibility: "PUBLIC_TO_EVERYONE",
          auto_post: true,
          auto_music: true,
          allow_comments: true,
          allow_duet: true,
          allow_stitch: true,
          disclose_video_content: false,
          disclose_brand_organic: false,
          disclose_branded_content: false,
          post_mode: "DIRECT_POST",
        },
        image_collection_ids: JSON.stringify({
          first_slide: {
            collection: "community_collection_hook",
            mode: "single_image",
            single_image: "215115",
          },
          all_slides: "community_collection_body",
          aspect_ratio: "9:16",
          is_bg_overlay_on: true,
          cta_slide: {
            check: true,
            cta_collection_check: true,
            cta_collection_id: "community_collection_cta",
            image_id: null,
            cta_location: "last_slide",
          },
          keepOriginalAspectRatio: true,
          background_opacity: 25,
          is_bg_overlay_on_hook_image: true,
          textOnFirstSlideOnly: false,
          noTextOnSlides: false,
          autoPullImagesNotCollections: false,
          autoImagesNoTextOnImages: false,
          disableAutoImageForFirstSlide: false,
          language: "English",
        }),
        schedule: { timezone: "America/New_York" },
      },
    })

    expect(normalized).toMatchObject({
      sourceAutomationId: "rf-123",
      name: "Daily Hooks",
      status: "live",
      account: "@brand",
      handle: "brand",
      times: ["8:00 AM", "4:00 PM"],
      favorite: true,
      theme: "ugc",
    })
    expect(normalized).not.toHaveProperty("source")
    expect(normalized.schema.title).toBe("Daily Hooks")
    expect(normalized.schema.prompt_formatting).toEqual({
      style: "raw text style prompt",
      narrative: "raw narrative prompt",
      num_of_slides: 6,
    })
    expect(normalized.schema.formatting).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "hook",
        image_url: "",
        imageGrid: "none",
        slideCount: 1,
        overlayOpacity: 25,
        textItems: [
          expect.objectContaining({
            id: "text-hook",
            fontSize: "10px",
            textStyle: "whiteText",
            wordLengthMin: 5,
            wordLengthMax: 10,
            contentDirection: "first hook",
            textMode: "prompt",
            textAlign: "left",
            textAnchor: "flush",
          }),
        ],
      }),
      expect.objectContaining({
        id: "_tone",
        value: "all lowercase",
        preset: "custom",
      }),
    ]))
    expect(normalized.schema.tiktok_post_settings.caption).toEqual({
      mode: "prompt",
      static_text: "",
      prompt_text: "same as first text item",
    })
    expect(normalized.schema.image_collection_ids).toEqual({
      first_slide: {
        collection: "community_collection_hook",
        mode: "single_image",
        single_image: "215115",
      },
      all_slides: "community_collection_body",
      aspect_ratio: "9:16",
      is_bg_overlay_on: true,
      cta_slide: {
        check: true,
        cta_collection_check: true,
        cta_collection_id: "community_collection_cta",
        image_id: null,
        cta_location: "last_slide",
      },
      keepOriginalAspectRatio: true,
      background_opacity: 25,
      is_bg_overlay_on_hook_image: true,
      textOnFirstSlideOnly: false,
      noTextOnSlides: false,
      autoPullImagesNotCollections: false,
      autoImagesNoTextOnImages: false,
      disableAutoImageForFirstSlide: false,
      language: "English",
    })
    expect(normalized.schema.schedule.timezone).toBe("America/New_York")
    expect(normalized.schema.schedule.posting_times).toEqual([
      { time: "8:00 AM", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
      { time: "4:00 PM", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
    ])
  })

  it("upserts imported automations by source automation id", async () => {
    const first = normalizeReelfarmAutomation({ id: "rf-1", name: "Original", status: "Paused" })
    const second = normalizeReelfarmAutomation({ id: "rf-1", name: "Renamed", status: "Live", times: ["9:00 AM"] })

    await upsertAutomationRecords({ rootDir, records: [first] })
    await upsertAutomationRecords({ rootDir, records: [second] })

    const records = await listAutomationRecords({ rootDir })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      sourceAutomationId: "rf-1",
      name: "Renamed",
      status: "live",
      times: ["9:00 AM"],
    })
  })

  it("creates local automation records without marking them as imported placeholders", () => {
    const record = createLocalAutomationRecord({ name: "Daily product demos" })

    expect(record).toMatchObject({
      name: "Daily product demos",
      status: "live",
      account: "No TikTok account",
      handle: "",
      favorite: false,
    })
    expect(record).not.toHaveProperty("source")
    expect(record.sourceAutomationId).toBeUndefined()
    expect(record.schema.title).toBe("Daily product demos")
    expect(record.schema.status).toBe("live")
    expect(record.schema.schedule.posting_times).toEqual([
      { time: "11:00 AM", days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
    ])
    expect(record.schema).toMatchObject({
      prompt_formatting: {
        num_of_slides: expect.any(Number),
      },
      image_collection_ids: {
        first_slide: {
          collection: "",
          mode: "collection",
          single_image: null,
        },
        all_slides: "",
        cta_slide: {
          check: true,
          cta_collection_check: true,
          cta_collection_id: "",
          image_id: null,
          cta_location: "last_slide",
        },
        aspect_ratio: "9:16",
        is_bg_overlay_on: true,
        keepOriginalAspectRatio: true,
        background_opacity: 25,
        is_bg_overlay_on_hook_image: true,
        textOnFirstSlideOnly: false,
        noTextOnSlides: false,
        autoPullImagesNotCollections: false,
        autoImagesNoTextOnImages: false,
        disableAutoImageForFirstSlide: false,
        language: "English",
      },
      formatting: expect.arrayContaining([
        expect.objectContaining({ id: "hook", textItems: expect.any(Array) }),
        expect.objectContaining({ id: "body", textItems: expect.any(Array) }),
        expect.objectContaining({ id: "cta", textItems: expect.any(Array) }),
      ]),
    })
  })

  it("copies template settings into the local automation while preserving local overrides", () => {
    const templateRecord = createLocalAutomationRecord({ name: "Template source" })
    const template = {
      prompt_formatting: {
        ...templateRecord.schema.prompt_formatting,
        num_of_slides: 6,
      },
      formatting: templateRecord.schema.formatting.map((section) =>
        section.id === "hook" ? {
          ...section,
          textItems: [{ ...section.textItems[0], contentDirection: "template hook" }],
        } : section
      ),
      tiktok_post_settings: templateRecord.schema.tiktok_post_settings,
      image_collection_ids: templateRecord.schema.image_collection_ids,
    }

    const local = createLocalAutomationRecord({
      name: "Local copy",
      template,
      overrides: {
        status: "live",
        schedule: {
          timezone: "America/Los_Angeles",
          posting_times: [{ time: "9:30 AM", days: ["Mon"] }],
        },
      },
    })

    expect(local.schema.title).toBe("Local copy")
    expect(local.schema.status).toBe("live")
    expect(local.schema.schedule).toEqual({
      timezone: "America/Los_Angeles",
      posting_times: [{ time: "9:30 AM", days: ["Mon"] }],
    })
    expect(local.schema).toMatchObject(template)
  })

  it("keeps imported automation templates out of the runnable automation database", async () => {
    const records = await listAutomationRecords({
      rootDir: path.join(process.cwd(), "data", "automations"),
    })

    expect(records).toEqual([])
  })
})
