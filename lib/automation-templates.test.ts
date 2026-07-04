import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  automationTemplateRecordToSchema,
  automationTemplateRecordToSummary,
  groupAutomationTemplateExampleRunsByTemplateId,
  listAutomationTemplateRecords,
  listAutomationTemplateExampleRuns,
} from "@/lib/automation-templates"

describe("automation template persistence", () => {
  it("ships imported Reelfarm slideshow automations as compact templates", async () => {
    const records = await listAutomationTemplateRecords({
      rootDir: path.join(process.cwd(), "data", "automation-templates"),
    })

    expect(records).toHaveLength(21)
    expect(records.map((record) => record.sourceAutomationId)).toEqual([
      "15527",
      "15526",
      "15525",
      "15524",
      "15523",
      "15522",
      "15521",
      "15520",
      "15519",
      "15518",
      "15517",
      "15516",
      "15515",
      "15514",
      "15513",
      "15512",
      "15511",
      "15510",
      "15509",
      "15508",
      "15507",
    ])

    const studyTips = records.find((record) => record.sourceAutomationId === "15527")
    expect(studyTips).toMatchObject({
      id: "template-reelfarm-15527",
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
        hooks: expect.arrayContaining(["5 Study Habits of Straight-A Students"]),
      },
    })
    expect(studyTips).not.toHaveProperty("status")
    expect(studyTips).not.toHaveProperty("schedule")
    expect(studyTips).not.toHaveProperty("tiktok_post_settings")
    expect(studyTips).not.toHaveProperty("schema")
    expect(studyTips).not.toHaveProperty("raw")
    expect(studyTips?.template.image_collection_ids).toContain("collection-pinterest-ugc-laptop-study-2026-07-03t00-01-04-000z")
  })

  it("converts compact templates to runtime summaries and schemas for UI selectors", async () => {
    const records = await listAutomationTemplateRecords({
      rootDir: path.join(process.cwd(), "data", "automation-templates"),
    })
    const studyTips = records.find((record) => record.sourceAutomationId === "15527")
    expect(studyTips).toBeDefined()

    const summary = automationTemplateRecordToSummary(studyTips!)
    const schema = automationTemplateRecordToSchema(studyTips!)

    expect(summary).toMatchObject({
      id: "template-reelfarm-15527",
      name: "Study Tips",
      status: "Template",
      account: "",
      times: [],
    })
    expect(schema).toMatchObject({
      title: "Study Tips",
      status: "live",
      tiktok_account_id: null,
      prompt_formatting: {
        num_of_slides: 7,
        narrative: expect.stringContaining("5 Study Habits of Straight-A Students"),
      },
      image_collection_ids: {
        first_slide: {
          collection: "collection-pinterest-ugc-laptop-study-2026-07-03t00-01-04-000z",
          mode: "collection",
        },
        all_slides: "collection-pinterest-ugc-laptop-study-2026-07-03t00-01-04-000z",
      },
      tiktok_post_settings: {
        publish_type: "slideshow",
      },
    })
  })

  it("ships Reelfarm example slideshows separately from automation templates", async () => {
    const runs = await listAutomationTemplateExampleRuns({
      rootDir: path.join(process.cwd(), "data", "automation-templates"),
    })
    const runsByTemplateId = groupAutomationTemplateExampleRunsByTemplateId(runs)

    expect(runs).toHaveLength(125)
    expect(Object.keys(runsByTemplateId)).toHaveLength(21)
    expect(runsByTemplateId["template-reelfarm-15527"]).toHaveLength(6)
    expect(runsByTemplateId["template-reelfarm-15524"]).toHaveLength(5)
    expect(runsByTemplateId["template-reelfarm-15527"]?.[0]).toMatchObject({
      id: expect.stringContaining("template-example-reelfarm-15527-"),
      automationId: "template-reelfarm-15527",
      templateId: "template-reelfarm-15527",
      sourceTemplateId: "33",
      plan: {
        slides: expect.arrayContaining([
          expect.objectContaining({
            imageUrl: expect.stringContaining("https://slides.reel.farm/"),
            text: "5 Study Habits of Straight-A Students",
          }),
        ]),
      },
    })
  })
})
