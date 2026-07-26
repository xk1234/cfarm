import { describe, expect, it } from "vitest"

import {
  automationTemplateRecordToSummary,
  type AutomationTemplateRecord,
} from "@/lib/automation-templates"

describe("automation template kind", () => {
  it("preserves UGC templates as UGC", () => {
    const record = {
      id: "template-ugc",
      automationKind: "ugc",
      name: "UGC Template",
      theme: "ugc",
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
      schema: {
        created_at: "2026-07-26T00:00:00.000Z",
      },
    } as AutomationTemplateRecord

    expect(automationTemplateRecordToSummary(record).automationKind).toBe("ugc")
  })
})
