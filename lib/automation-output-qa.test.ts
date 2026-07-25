import { describe, expect, it } from "vitest"

import { validateAutomationRunOutput } from "@/lib/automation-output-qa"
import type { AutomationRunRecord } from "@/lib/automation-runner"
import { defaultAutomationSchema } from "@/lib/realfarm-automation"

describe("automation output QA", () => {
  it("finds count, token, duplicate draw, near duplicate, and word limits", () => {
    const run = outputRun("run-new", "slide-new")
    run.plan.hook = "7 things [[ZODIAC]] hides"
    run.plan.hookSubstitutions = { ZODIAC: "Cancer", SIGN: "Cancer" }
    run.plan.slides[1]!.textItems![0]!.text = "[[UNKNOWN]]"
    const prior = outputRun("run-old", "slide-old")
    const schema = defaultAutomationSchema({
      id: "automation-1",
      name: "Astrology",
      status: "live",
      account: "",
      handle: "",
      times: ["8:00 AM"],
      favorite: false,
      theme: "violet",
      socialIntegrations: [],
    })
    const body = schema.formatting.find((section) => section.id === "body")!
    body.textItems = [
      {
        ...body.textItems[0]!,
        id: "content",
        wordLengthMin: 5,
        wordLengthMax: 10,
      },
    ]

    const report = validateAutomationRunOutput({
      run,
      priorRuns: [prior],
      schema,
    })

    expect(report.actualSlideCount).toBe(2)
    expect(report.bodySlideCount).toBe(1)
    expect(report.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining([
        "COUNT_MISMATCH",
        "UNRESOLVED_TOKEN",
        "DUPLICATE_VARIABLE_DRAW",
        "NEAR_DUPLICATE_OUTPUT",
        "TRUNCATED_SLIDE_TEXT",
      ])
    )
    expect(report.valid).toBe(false)
  })
})

function outputRun(id: string, slideshowId: string): AutomationRunRecord {
  return {
    id,
    slideshowId,
    automationId: "automation-1",
    automationTitle: "Astrology",
    scheduledFor: "2026-07-24T00:00:00.000Z",
    status: "succeeded",
    plan: {
      title: "Title",
      caption: "Caption",
      hashtags: "#test",
      hook: "1 thing Cancer hides",
      hookId: "hook-1",
      hookSubstitutions: { ZODIAC: "Cancer" },
      imageCollectionIds: ["collection-1"],
      slides: [
        {
          id: "slide-1",
          role: "hook",
          imageUrl: "https://example.com/1.jpg",
          imageCaption: "",
          text: "1 thing Cancer hides",
          textPlacement: "center",
          textItems: [
            {
              id: "hook-text",
              text: "1 thing Cancer hides",
              fontSize: "8px",
              textStyle: "whiteText",
              textAlign: "center",
              textAnchor: "padded",
              textPlacement: "center",
              textSize: { width: 10, height: 10 },
              textPosition: { x: 50, y: 50 },
            },
          ],
        },
        {
          id: "slide-2",
          role: "content",
          imageUrl: "https://example.com/2.jpg",
          imageCaption: "",
          text: "Short",
          textPlacement: "center",
          textItems: [
            {
              id: "content",
              text: "Short",
              fontSize: "8px",
              textStyle: "whiteText",
              textAlign: "center",
              textAnchor: "padded",
              textPlacement: "center",
              textSize: { width: 10, height: 10 },
              textPosition: { x: 50, y: 50 },
            },
          ],
        },
      ],
      slideCount: { mode: "static", count: 1 },
      publishType: "slideshow",
      autoMusic: false,
      autoPost: false,
      language: "English",
    },
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:01:00.000Z",
  }
}
