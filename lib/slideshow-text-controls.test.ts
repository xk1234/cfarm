import { describe, expect, it } from "vitest"

import {
  automationSchemaToTemplateRecord,
  automationTemplateSchemaToRuntime,
} from "@/lib/automation-templates"
import {
  automationFormatSection,
  defaultAutomationSchema,
  defaultAutomationTextItem,
  updateAutomationFormatSection,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"
import {
  automationSchemaToTempSlideTestingAutomation,
  getTempSlidePromptPlaceholders,
} from "@/lib/temp-slide-testing"

describe("slideshow text controls", () => {
  it("persists every editor control and carries it into generation", () => {
    const automation: Automation = {
      id: "text-control-test",
      name: "Text control test",
      status: "live",
      account: "",
      handle: "",
      times: [],
      timezone: "Asia/Singapore",
      favorite: false,
      theme: "test",
      socialIntegrations: [],
    }
    const controls = defaultAutomationTextItem({
      id: "controlled-text",
      fontSize: "22px",
      textStyle: "black50Background",
      textPosition: "bottom",
      textItemWidth: "40%",
      wordLengthMin: 2,
      wordLengthMax: 3,
      textAlign: "right",
      textAnchor: "flush",
      textVerticalAnchor: "flush",
    })
    const schema = updateAutomationFormatSection(
      defaultAutomationSchema(automation),
      "content",
      { textItems: [controls] }
    )
    const record = automationSchemaToTemplateRecord({
      id: "template-text-control-test",
      name: automation.name,
      theme: automation.theme,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      schema,
    })
    const restored = automationTemplateSchemaToRuntime(record)
    const restoredText = automationFormatSection(restored, "content")
      .textItems[0]
    const generated = automationSchemaToTempSlideTestingAutomation(restored)
    const placeholder = getTempSlidePromptPlaceholders(generated).find(
      (item) => item.itemId === "controlled-text"
    )

    expect(restoredText).toMatchObject(controls)
    expect(placeholder).toMatchObject({
      fontSize: "22px",
      textStyle: "black50Background",
      textPosition: "bottom",
      textItemWidth: "40%",
      wordLengthMin: 2,
      wordLengthMax: 3,
      textAlign: "right",
      textAnchor: "flush",
      textVerticalAnchor: "flush",
    })
  })
})
