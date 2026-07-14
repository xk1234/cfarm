import { readFileSync } from "node:fs"
import path from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

import {
  automationSchemaToTemplateRecord,
  automationTemplateRecordToSchema,
  automationTemplateRecordToSummary,
  validateAutomationTemplateCollectionIds,
  groupAutomationTemplateExampleRunsByTemplateId,
  listAutomationTemplateRecords,
  listAutomationTemplateExampleRuns,
  type AutomationTemplateRecord,
} from "@/lib/automation-templates"
import { writeJsonArrayStore } from "@/lib/json-store"
import {
  automationFormatSection,
  automationHooks,
  defaultAutomationSchema,
  schemaWithAutomationHooks,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

// Templates read from the bundled seed file directly; example-runs read only
// from the store, so seed cfarm's automation_template_runs from the shipped
// example-runs.json (run against cfarm via vitest.setup.ts).
const templatesRoot = path.join(process.cwd(), "data", "automation-templates")

beforeAll(async () => {
  const seed = JSON.parse(
    readFileSync(path.join(templatesRoot, "example-runs.json"), "utf8")
  ) as { runs?: unknown[] }
  await writeJsonArrayStore({
    rootDir: templatesRoot,
    fileName: "example-runs.json",
    key: "runs",
    records: seed.runs ?? [],
  })
})

describe("automation template persistence", () => {
  it("ships imported Reelfarm slideshow automations as compact templates", async () => {
    const records = await listAutomationTemplateRecords({
      rootDir: path.join(process.cwd(), "data", "automation-templates"),
    })

    const importedReelfarmRecords = records.filter(
      (record) => record.sourceAutomationId
    )
    const videoTemplates = records.filter(
      (record) => record.automationKind === "video"
    )

    expect(importedReelfarmRecords).toHaveLength(27)
    expect(
      importedReelfarmRecords.map((record) => record.sourceAutomationId)
    ).toEqual([
      "33",
      "44",
      "50",
      "57",
      "58",
      "440",
      "2024",
      "2035",
      "2049",
      "2182",
      "2184",
      "2196",
      "2222",
      "2529",
      "2530",
      "2610",
      "4860",
      "6178",
      "12017",
      "12022",
      "12029",
      "13685",
      "12713",
      "12401",
      "12379",
      "12277",
      "12104",
    ])
    expect(videoTemplates.map((record) => record.name)).toEqual([
      "UGC Product Demo",
      "UGC Testimonial",
    ])

    const studyTips = records.find(
      (record) => record.sourceAutomationId === "33"
    )
    expect(studyTips).toMatchObject({
      id: "template-reelfarm-33",
      name: "Study Tips",
      theme: "study-tips",
      template: {
        format: {
          hook: {
            aspect_ratio: "9:16",
            image_grid: "none",
          },
          content: {
            slide_count_mode: "static",
            slide_count: 5,
          },
        },
        hooks: expect.arrayContaining([
          "5 study habits of straight-a students",
        ]),
      },
    })
    expect(studyTips).not.toHaveProperty("status")
    expect(studyTips).not.toHaveProperty("schedule")
    expect(studyTips).not.toHaveProperty("tiktok_post_settings")
    expect(studyTips).not.toHaveProperty("schema")
    expect(studyTips).not.toHaveProperty("raw")
    expect(studyTips?.template.image_collection_ids).toContain(
      "collection-pinterest-ugc-laptop-study-2026-07-03t00-01-04-000z"
    )

    const mindsetShifts = records.find(
      (record) => record.sourceAutomationId === "44"
    )
    expect(mindsetShifts).toMatchObject({
      id: "template-reelfarm-44",
      name: "Mindset Shifts",
      template: {
        format: {
          tone: "Custom",
          custom_tone: expect.stringContaining("wealth-building"),
        },
        hooks: expect.arrayContaining([
          "5 morning habits of high-performing men",
        ]),
      },
    })

    const soccerMotivational = records.find(
      (record) => record.sourceAutomationId === "12379"
    )
    expect(soccerMotivational).toMatchObject({
      id: "template-reelfarm-12379",
      name: "Soccer Motivational",
      template: {
        format: {
          tone: "Custom",
          custom_tone: expect.stringContaining(
            "conversational, relatable tone"
          ),
        },
        hooks: [
          "how to become the most elite version of yourself",
          "how to stop caring what people think",
          "how to become the main character of your own life",
          "5 uncomfortable things to do alone to build extreme confidence",
          "how to trick your brain into doing difficult things",
          "5 ways to lower cortisol",
          "top 5 best habits to have from a neuroscientist",
          "5 life investments with the highest roi backed by neuroscience",
          "5 ways to hack your brain into getting things done",
          "how to start living your life to the fullest",
        ],
      },
    })
    expect(
      automationHooks(automationTemplateRecordToSchema(soccerMotivational!))
    ).toEqual([
      "how to become the most elite version of yourself",
      "how to stop caring what people think",
      "how to become the main character of your own life",
      "5 uncomfortable things to do alone to build extreme confidence",
      "how to trick your brain into doing difficult things",
      "5 ways to lower cortisol",
      "top 5 best habits to have from a neuroscientist",
      "5 life investments with the highest roi backed by neuroscience",
      "5 ways to hack your brain into getting things done",
      "how to start living your life to the fullest",
    ])
  })

  it("converts compact templates to runtime summaries and schemas for UI selectors", async () => {
    const records = await listAutomationTemplateRecords({
      rootDir: path.join(process.cwd(), "data", "automation-templates"),
    })
    const studyTips = records.find(
      (record) => record.sourceAutomationId === "33"
    )
    expect(studyTips).toBeDefined()

    const summary = automationTemplateRecordToSummary(studyTips!)
    const schema = automationTemplateRecordToSchema(studyTips!)

    expect(summary).toMatchObject({
      id: "template-reelfarm-33",
      name: "Study Tips",
      automationKind: "slideshow",
      status: "live",
      account: "",
      times: [],
    })
    expect(schema).toMatchObject({
      title: "Study Tips",
      status: "live",
      social_integrations: [],
      prompt_formatting: {
        num_of_slides: 6,
        narrative: expect.stringContaining(
          "5 study habits of straight-a students"
        ),
      },
      image_collection_ids: {
        first_slide: {
          collection:
            "collection-pinterest-ugc-laptop-study-2026-07-03t00-01-04-000z",
          mode: "collection",
        },
        all_slides:
          "collection-pinterest-ugc-laptop-study-2026-07-03t00-01-04-000z",
      },
      tiktok_post_settings: {
        publish_type: "slideshow",
      },
    })
  })

  it("normalizes video automation templates separately from slideshow templates", () => {
    const summary = automationTemplateRecordToSummary({
      id: "template-video-ugc",
      name: "Creator UGC Video",
      theme: "creator-ugc-video",
      automationKind: "video",
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      template: {
        created_at: "2026-07-06T00:00:00.000Z",
        image_collection_ids: JSON.stringify({
          first_slide: { collection: "collection-ugc-avatar-videos" },
        }),
        format: {
          hook: {
            aspect_ratio: "9:16",
            image_grid: "none",
            overlay: false,
            display_text: true,
            text_items: [],
          },
          content: {
            aspect_ratio: "9:16",
            image_grid: "none",
            slide_count_mode: "static",
            slide_count: 1,
            overlay: false,
            display_text: true,
            text_items: [],
          },
          cta: {
            enabled: false,
            image_mode: "collection",
            aspect_ratio: "9:16",
            image_grid: "none",
            overlay: false,
            display_text: false,
            text_items: [],
          },
          tone: "Conversational & Relatable",
          custom_tone: "",
        },
        hooks: ["this looked way better than i expected"],
      },
    })

    expect(summary).toMatchObject({
      automationKind: "video",
      name: "Creator UGC Video",
    })
  })

  it("round-trips video automation definitions without changing their kind", () => {
    const summary: Automation = {
      id: "video-automation",
      automationKind: "video",
      name: "Creator UGC Video",
      status: "live",
      account: "",
      handle: "",
      times: [],
      favorite: false,
      theme: "creator-ugc-video",
      socialIntegrations: [],
    }
    const schema = defaultAutomationSchema(summary)
    schema.video_format = {
      template: "ugc_ad",
      hookPlacement: "first_segment",
      globalTextItems: [],
      segments: [
        {
          id: "demo",
          label: "Demo",
          guidance: "Show the product in use",
          mediaSource: "collection",
          mediaKind: "video",
          collectionId: "collection-demo",
          demoAssetId: "",
          clipCount: 2,
          clipDurationMs: 2500,
          transition: "cut",
          textItems: [],
        },
      ],
    }

    const record = automationSchemaToTemplateRecord({
      id: "template-video-ugc",
      name: summary.name,
      theme: summary.theme,
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      schema,
    })
    const restored = automationTemplateRecordToSchema(record)

    expect(record.automationKind).toBe("video")
    expect(record.template.video_format).toEqual(schema.video_format)
    expect(restored.automationKind).toBe("video")
    expect(restored.video_format).toEqual(schema.video_format)
  })

  it("reports imported template collection ids that do not resolve locally", () => {
    const template: AutomationTemplateRecord = {
      id: "template-missing-collections",
      name: "Missing Collections",
      theme: "test",
      createdAt: "2026-07-06T00:00:00.000Z",
      updatedAt: "2026-07-06T00:00:00.000Z",
      template: {
        created_at: "2026-07-06T00:00:00.000Z",
        image_collection_ids: JSON.stringify({
          first_slide: { collection: "user_collection_1111" },
          all_slides: "user_collection_222",
          cta_slide: {
            check: true,
            cta_collection_check: true,
            cta_collection_id: "user_collection_333",
          },
        }),
        format: {
          hook: {
            aspect_ratio: "9:16",
            image_grid: "none",
            overlay: false,
            display_text: true,
            text_items: [],
          },
          content: {
            aspect_ratio: "9:16",
            image_grid: "none",
            slide_count_mode: "static",
            slide_count: 1,
            overlay: false,
            overlay_image: {
              enabled: true,
              collection_id: "user_collection_444",
              height: 5,
            },
            display_text: true,
            text_items: [],
          },
          cta: {
            enabled: true,
            image_mode: "collection",
            aspect_ratio: "9:16",
            image_grid: "none",
            overlay: false,
            display_text: false,
            text_items: [],
          },
          custom_tone: "",
        },
        hooks: ["test hook"],
      },
    }

    expect(
      validateAutomationTemplateCollectionIds({
        records: [template],
        collections: [
          {
            id: "collection-hook",
            title: "Hook",
            createdAt: "2026-07-06T00:00:00.000Z",
            source: "pinterest",
            images: [
              {
                id: "hook-image",
                title: "Hook",
                description: "Hook",
                imageUrl:
                  "/api/local-assets/image-collections/files/hook-1111-0000-a.jpg",
                sourceUrl:
                  "/api/local-assets/image-collections/files/hook-1111-0000-a.jpg",
                dominantColor: "#d9d8d0",
              },
            ],
          },
        ],
      })
    ).toEqual([
      {
        templateId: "template-missing-collections",
        templateName: "Missing Collections",
        missingCollectionIds: [
          "user_collection_222",
          "user_collection_333",
          "user_collection_444",
        ],
      },
    ])
  })

  it("does not treat default hook text instructions as real hooks", async () => {
    const records = await listAutomationTemplateRecords({
      rootDir: path.join(process.cwd(), "data", "automation-templates"),
    })
    const studyTips = records.find(
      (record) => record.sourceAutomationId === "33"
    )
    const schema = automationTemplateRecordToSchema(studyTips!)

    const schemaWithPlaceholder = {
      ...schema,
      prompt_formatting: {
        ...schema.prompt_formatting,
        narrative: "",
      },
      formatting: schema.formatting.map((section) =>
        section.id === "hook"
          ? {
              ...section,
              textItems: section.textItems.map((item) => ({
                ...item,
                text: "",
                staticText: "",
                contentDirection: "hook text, all lowercase",
              })),
            }
          : section
      ),
    }

    expect(automationHooks(schemaWithPlaceholder)).toEqual([])
    expect(
      automationHooks(
        schemaWithAutomationHooks(schemaWithPlaceholder, [
          "how to stop caring what people think",
        ])
      )
    ).toEqual(["how to stop caring what people think"])
    expect(
      automationHooks({
        ...schemaWithPlaceholder,
        prompt_formatting: {
          ...schemaWithPlaceholder.prompt_formatting,
          narrative: "latest hdb resale trends buyers need to know",
        },
        formatting: schemaWithPlaceholder.formatting.map((section) =>
          section.id === "hook"
            ? {
                ...section,
                textItems: section.textItems.map((item) => ({
                  ...item,
                  contentDirection:
                    "hook text, all lowercase. must be under 10 words total",
                })),
              }
            : section
        ),
      })
    ).toEqual(["latest hdb resale trends buyers need to know"])
    expect(
      automationFormatSection(
        schemaWithAutomationHooks(schemaWithPlaceholder, [
          "first hook alternative",
          "second hook alternative",
        ]),
        "hook"
      ).textItems
    ).toHaveLength(1)
  })

  it("ships Reelfarm example slideshows separately from automation templates", async () => {
    const runs = await listAutomationTemplateExampleRuns({
      rootDir: path.join(process.cwd(), "data", "automation-templates"),
    })
    const runsByTemplateId =
      groupAutomationTemplateExampleRunsByTemplateId(runs)

    expect(runs).toHaveLength(158)
    expect(Object.keys(runsByTemplateId)).toHaveLength(27)
    expect(
      Object.values(runsByTemplateId).every((runs) => runs.length === 3)
    ).toBe(true)
    expect(runsByTemplateId["template-reelfarm-33"]?.[0]).toMatchObject({
      id: expect.stringContaining("template-example-reelfarm-33-"),
      automationId: "template-reelfarm-33",
      templateId: "template-reelfarm-33",
      sourceTemplateId: "33",
      plan: {
        slides: expect.arrayContaining([
          expect.objectContaining({
            imageUrl: expect.stringContaining("https://slides.reel.farm/"),
            text: "5 study habits of straight-a students",
          }),
        ]),
      },
    })
    expect(runsByTemplateId["template-reelfarm-13685"]?.[1]).toMatchObject({
      id: "template-example-reelfarm-13685-646970",
      automationId: "template-reelfarm-13685",
      templateId: "template-reelfarm-13685",
      sourceVideoId: "646970",
      plan: {
        slides: expect.arrayContaining([
          expect.objectContaining({
            imageUrl:
              "https://slides.reel.farm/d2VsdGVyLm1AaWNsb3VkLmNvbQ==_1444278/image_0.jpg",
            text: "high-level skills to acquire in your 20s",
          }),
        ]),
      },
    })
    expect(runsByTemplateId["template-reelfarm-12379"]).toHaveLength(3)
    expect(runsByTemplateId["template-reelfarm-12379"]?.[0]).toMatchObject({
      automationId: "template-reelfarm-12379",
      templateId: "template-reelfarm-12379",
      sourceTemplateId: "12379",
      plan: {
        slides: expect.arrayContaining([
          expect.objectContaining({
            imageUrl: expect.stringContaining("https://slides.reel.farm/"),
          }),
        ]),
      },
    })
  })
})
