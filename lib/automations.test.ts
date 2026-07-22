import path from "node:path"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { routeForStore } from "@/lib/appwrite-stores"
import { clearTestTables } from "@/lib/test-helpers"
import {
  automationRecordToSummary,
  createLocalAutomationRecord,
  deleteAutomationRecord,
  listAutomationRecords,
  normalizeReelfarmAutomation,
  patchAutomationRecord,
  upsertAutomationRecords,
} from "@/lib/automations"
import { readJsonArrayStore, writeJsonArrayStore } from "@/lib/json-store"
import {
  automationCollectionIds,
  defaultAutomationSchema,
} from "@/lib/realfarm-automation"
import { defaultAutomationTemplateDefaults } from "@/lib/automation-template-defaults"

// Appwrite-only, run against cfarm (forced by vitest.setup.ts):
//   data/automations/automations.json          -> automations
const rootDir = path.join(process.cwd(), "data", "automations")

const clearAll = () => clearTestTables("automations")

beforeEach(clearAll)
afterAll(clearAll)

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
          },
          {
            id: "body",
            textItems: [],
            aspect_ratio: "4:5",
            imageGrid: "none",
            slideCount: 5,
            noText: false,
            overlay: true,
            overlayImage: {
              enabled: true,
              collectionId: "overlay-collection",
              padding: 5,
            },
            slideOverrides: [
              {
                slideIndex: 3,
                contentDirection: "soft-sell a product on slide 3",
              },
            ],
            imageOverrides: [
              {
                slideIndex: 3,
                collectionId: "product-image-collection",
              },
            ],
          },
          {
            id: "_tone",
            value: "all lowercase",
            preset: "custom",
          },
        ],
        tiktok_post_settings: {
          caption: {
            mode: "prompt",
            static_text: "",
            prompt_text: "same as first text item",
          },
          description: {
            mode: "prompt",
            static_text: "",
            prompt_text: "3-5 hashtags",
          },
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
        image_fit: "contain",
        language: "English",
        image_collection_ids: JSON.stringify({
          first_slide: {
            collection: "community_collection_hook",
            mode: "single_image",
            single_image: "215115",
          },
          all_slides: "community_collection_body",
          cta_slide: {
            check: true,
            cta_collection_check: true,
            cta_collection_id: "community_collection_cta",
            image_id: null,
            cta_location: "last_slide",
          },
          textOnFirstSlideOnly: false,
          noTextOnSlides: false,
          autoPullImagesNotCollections: false,
          autoImagesNoTextOnImages: false,
          disableAutoImageForFirstSlide: false,
        }),
        schedule: { timezone: "America/New_York" },
      },
    })

    expect(normalized).toMatchObject({
      sourceAutomationId: "rf-123",
      name: "Daily Hooks",
      status: "live",
      favorite: true,
      theme: "ugc",
    })
    // account/handle/times are no longer stored on the record; they derive from schema.
    expect(automationRecordToSummary(normalized)).toMatchObject({
      times: ["8:00 AM", "4:00 PM"],
    })
    expect(normalized).not.toHaveProperty("source")
    expect(normalized.schema.prompt_formatting).toEqual({
      style: "raw text style prompt",
      narrative: "raw narrative prompt",
      num_of_slides: 6,
    })
    expect(normalized.schema.formatting).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "hook",
          image_url: "",
          imageGrid: "none",
          slideCount: 1,
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
          id: "body",
          overlayImage: {
            enabled: true,
            collectionId: "overlay-collection",
            padding: 5,
          },
          slideOverrides: [
            {
              slideIndex: 3,
              contentDirection: "soft-sell a product on slide 3",
            },
          ],
          imageOverrides: [
            {
              slideIndex: 3,
              collectionId: "product-image-collection",
            },
          ],
        }),
      ])
    )
    expect(normalized.schema.tone).toEqual({
      value: "all lowercase",
      preset: "custom",
    })
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
      cta_slide: {
        check: true,
        cta_collection_check: true,
        cta_collection_id: "community_collection_cta",
        image_id: null,
        cta_location: "last_slide",
      },
      video_demo_asset_id: "",
    })
    expect(normalized.schema.image_fit).toBe("cover")
    expect(normalized.schema.language).toBe("English")
    expect(normalized.schema.schedule.timezone).toBe("America/New_York")
    expect(normalized.schema.schedule.posting_times).toEqual([
      {
        time: "8:00 AM",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
      {
        time: "4:00 PM",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
    ])
  })

  it("upserts imported automations by source automation id", async () => {
    const first = normalizeReelfarmAutomation({
      id: "rf-1",
      name: "Original",
      status: "Paused",
    })
    const second = normalizeReelfarmAutomation({
      id: "rf-1",
      name: "Renamed",
      status: "Live",
      times: ["9:00 AM"],
    })

    await upsertAutomationRecords({ rootDir, records: [first] })
    await upsertAutomationRecords({ rootDir, records: [second] })

    const records = await listAutomationRecords({ rootDir })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      sourceAutomationId: "rf-1",
      name: "Renamed",
      status: "live",
    })
    expect(automationRecordToSummary(records[0]).times).toEqual(["9:00 AM"])
  })

  it("derives the summary and persists patches as canonical v2", async () => {
    const record = automationRecordFixture("metadata-sync")
    await writeJsonArrayStore({
      rootDir,
      fileName: "automations.json",
      key: "automations",
      records: [record],
    })

    const [stored0] = await listAutomationRecords({ rootDir })
    expect(automationRecordToSummary(stored0)).toMatchObject({
      account: "No social account",
      handle: "Click to add account",
      times: ["11:00 AM"],
    })

    const updated = await patchAutomationRecord({
      rootDir,
      id: record.id,
      name: "Renamed automation",
      status: "live",
    })

    expect(updated).toMatchObject({
      name: "Renamed automation",
      status: "live",
    })
    const [stored] = await readJsonArrayStore<Record<string, unknown>>({
      rootDir,
      fileName: "automations.json",
      key: "automations",
    })
    expect(stored).not.toHaveProperty("account")
    expect(stored).not.toHaveProperty("handle")
    expect(stored).not.toHaveProperty("times")
    expect(stored.schema).not.toHaveProperty("title")
    expect(stored.schema).not.toHaveProperty("status")
  })

  it("creates local automation records without marking them as imported placeholders", () => {
    const record = createLocalAutomationRecord({ name: "Daily product demos" })

    expect(record).toMatchObject({
      name: "Daily product demos",
      status: "live",
      favorite: false,
    })
    expect(automationRecordToSummary(record)).toMatchObject({
      account: "No social account",
      handle: "Click to add account",
    })
    expect(record).not.toHaveProperty("source")
    expect(record.sourceAutomationId).toBeUndefined()
    expect(record.schema.social_integrations).toEqual([])
    expect(record.schema.social_post_settings).toMatchObject({
      instagram: {
        instagramPublishType: "TIMELINE",
        instagramPostToGrid: true,
      },
      facebook: {
        facebookContentType: "POST",
      },
      youtube: {
        youtubeIsShort: true,
        youtubeMadeForKids: false,
      },
      x: {
        xRetweetUrl: "",
      },
      linkedin: {
        linkedinAttachmentKey: "",
      },
    })
    expect(record.schema.schedule.posting_times).toEqual([
      {
        time: "11:00 AM",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
    ])
    expect(record.schema).toMatchObject({
      automationKind: "slideshow",
      image_fit: defaultAutomationTemplateDefaults.image_fit,
      language: "English",
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
          check:
            defaultAutomationTemplateDefaults.image_collection_ids.cta_slide
              .check,
          cta_collection_check:
            defaultAutomationTemplateDefaults.image_collection_ids.cta_slide
              .cta_collection_check,
          cta_collection_id: "",
          image_id: null,
          cta_location: "last_slide",
        },
      },
      formatting: expect.arrayContaining([
        expect.objectContaining({ id: "hook", textItems: expect.any(Array) }),
        expect.objectContaining({ id: "body", textItems: expect.any(Array) }),
        expect.objectContaining({ id: "cta", textItems: expect.any(Array) }),
      ]),
    })
    expect(
      record.schema.formatting.flatMap((section) =>
        section.textItems.map((item) => item.contentDirection)
      )
    ).not.toEqual(
      expect.arrayContaining([
        "hook text, all lowercase",
        "short supporting text, all lowercase",
      ])
    )
  })

  it("loads default automation template settings from a single config source", () => {
    const record = createLocalAutomationRecord({ name: "Config-backed" })

    expect(defaultAutomationTemplateDefaults.version).toMatch(
      /^default-automation-template-v\d+$/
    )
    expect(record.schema.prompt_formatting).toEqual(
      defaultAutomationTemplateDefaults.prompt_formatting
    )
    expect(record.schema.image_collection_ids).toEqual(
      defaultAutomationTemplateDefaults.image_collection_ids
    )
    expect(record.schema.schedule.posting_times).toEqual([
      {
        time: defaultAutomationTemplateDefaults.schedule.defaultPostingTime,
        days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      },
    ])
  })

  it("normalizes fixed social platform settings from per-platform publish mode", () => {
    const source = createLocalAutomationRecord({
      name: "Social settings",
    }).schema
    source.tiktok_post_settings.publish_type = "video"
    source.social_publish_as = {
      instagram: "video",
      facebook: "video",
    }
    source.tiktok_post_settings.description = {
      mode: "static",
      static_text: "same tiktok title",
      prompt_text: "",
    }
    source.social_post_settings = {
      instagram: {
        instagramPublishType: "STORY",
        instagramPostToGrid: false,
      },
      facebook: {
        facebookContentType: "STORY",
      },
      youtube: {
        youtubeTitle: "manual youtube title",
        youtubePrivacy: "PRIVATE",
        youtubeIsShort: false,
        youtubeMadeForKids: true,
        youtubeTags: ["ugc"],
      },
      x: {
        xRetweetUrl: "https://x.com/account/status/1",
      },
      linkedin: {
        linkedinAttachmentKey: "manual-doc-key",
        linkedinVisibility: "CONNECTIONS",
      },
    }

    const normalized = createLocalAutomationRecord({
      name: "Normalized social settings",
      schema: source,
    }).schema

    expect(normalized.social_post_settings).toMatchObject({
      instagram: {
        instagramPublishType: "REEL",
        instagramPostToGrid: true,
      },
      facebook: {
        facebookContentType: "REEL",
      },
      youtube: {
        youtubeTitle: "same tiktok title",
        youtubePrivacy: "PRIVATE",
        youtubeIsShort: true,
        youtubeMadeForKids: false,
        youtubeTags: ["ugc"],
      },
      x: {
        xRetweetUrl: "",
      },
      linkedin: {
        linkedinAttachmentKey: "",
        linkedinVisibility: "CONNECTIONS",
      },
    })
  })

  it("keeps slideshow as the default publish mode even when video export is enabled", () => {
    const source = createLocalAutomationRecord({
      name: "Slideshow default social settings",
    }).schema
    source.tiktok_post_settings.publish_type = "video"

    const normalized = createLocalAutomationRecord({
      name: "Normalized slideshow defaults",
      schema: source,
    }).schema

    expect(normalized.social_post_settings).toMatchObject({
      instagram: {
        instagramPublishType: "TIMELINE",
      },
      facebook: {
        facebookContentType: "POST",
      },
    })
  })

  it("returns unique image collection ids for automation planning", () => {
    const schema = createLocalAutomationRecord({
      name: "Shared collections",
    }).schema
    schema.image_collection_ids = {
      ...schema.image_collection_ids,
      first_slide: {
        ...schema.image_collection_ids.first_slide,
        collection: "collection-shared",
      },
      all_slides: "collection-shared",
      cta_slide: {
        ...schema.image_collection_ids.cta_slide,
        cta_collection_id: "collection-shared",
      },
    }

    expect(automationCollectionIds(schema)).toEqual(["collection-shared"])
  })

  it("creates local video automation records without using the slideshow default kind", () => {
    const record = createLocalAutomationRecord({
      name: "Daily UGC videos",
      automationKind: "video",
    })
    const summary = automationRecordToSummary(record)

    expect(record.schema.automationKind).toBe("video")
    expect(record.schema.tiktok_post_settings.publish_type).toBe("video")
    expect(summary.automationKind).toBe("video")
  })

  it("copies template settings into the local automation while preserving local overrides", () => {
    const templateRecord = createLocalAutomationRecord({
      name: "Template source",
    })
    const template = {
      automationKind: templateRecord.schema.automationKind,
      aspect_ratio: templateRecord.schema.aspect_ratio,
      font: templateRecord.schema.font,
      image_fit: templateRecord.schema.image_fit,
      language: templateRecord.schema.language,
      prompt_formatting: {
        ...templateRecord.schema.prompt_formatting,
        num_of_slides: 6,
      },
      formatting: templateRecord.schema.formatting.map((section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: [
                { ...section.textItems[0], contentDirection: "template hook" },
              ],
            }
          : section
      ),
      tiktok_post_settings: templateRecord.schema.tiktok_post_settings,
      image_collection_ids: templateRecord.schema.image_collection_ids,
      tone: templateRecord.schema.tone,
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

    expect(local.schema.schedule).toEqual({
      timezone: "America/Los_Angeles",
      posting_times: [{ time: "9:30 AM", days: ["Mon"] }],
    })
    expect(local.schema).toMatchObject(template)
  })

  it("keeps imported automation templates out of the runnable automation database", async () => {
    const templateRoute = routeForStore(
      path.join(process.cwd(), "data", "automation-templates"),
      "templates.json"
    )
    const records = await listAutomationRecords({ rootDir })

    expect(templateRoute).toMatchObject({
      table: "permanent_assets",
      sourceKey: "automation_template",
      public: true,
    })
    expect(records).toEqual([])
  })

  it("removes the selected automation record from the automation database", async () => {
    await writeJsonArrayStore({
      rootDir,
      fileName: "automations.json",
      key: "automations",
      records: [
        automationRecordFixture("delete-me"),
        automationRecordFixture("keep-me"),
      ],
    })

    const result = await deleteAutomationRecord({ rootDir, id: "delete-me" })

    const stored = await readJsonArrayStore<{ id: string }>({
      rootDir,
      fileName: "automations.json",
      key: "automations",
    })
    expect(result?.id).toBe("delete-me")
    expect(stored.map((record) => record.id)).toEqual(["keep-me"])
  })
})

function automationRecordFixture(id: string) {
  const summary = {
    id,
    name: id,
    status: "paused" as const,
    account: "No social account",
    handle: "Click to add account",
    times: [],
    favorite: false,
    theme: "ugc",
    socialIntegrations: [],
  }

  return {
    id,
    name: id,
    status: "paused",
    favorite: false,
    theme: "ugc",
    updatedAt: "2026-07-03T00:00:00.000Z",
    schema: defaultAutomationSchema(summary),
  }
}
