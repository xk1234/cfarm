import { describe, expect, it } from "vitest"

import {
  automationSchemaToTemplateRecord,
  automationTemplateRecordToSummary,
} from "@/lib/automation-templates"
import { defaultAutomationSchema } from "@/lib/realfarm-automation"

describe("automation template kind", () => {
  it("preserves UGC templates as UGC", () => {
    const schema = defaultAutomationSchema({
      id: "template-ugc",
      automationKind: "ugc",
      name: "UGC Template",
      hidden: true,
      status: "paused",
      account: "",
      handle: "",
      times: [],
      favorite: false,
      theme: "ugc",
      socialIntegrations: [],
    })
    const record = automationSchemaToTemplateRecord({
      id: "template-ugc",
      name: "UGC Template",
      theme: "ugc",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
      schema,
    })

    expect(automationTemplateRecordToSummary(record).automationKind).toBe("ugc")
  })
})
