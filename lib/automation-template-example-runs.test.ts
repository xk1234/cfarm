import { describe, expect, it } from "vitest"

import { groupAutomationTemplateExampleRunsByTemplateId } from "@/lib/automation-templates"
import type { AutomationTemplateExampleRun } from "@/lib/automation-templates"

function exampleRun(
  id: string,
  templateId: string,
  createdAt: string
): AutomationTemplateExampleRun {
  return {
    id,
    templateId,
    automationId: templateId,
    createdAt,
    plan: {
      slides: [{ id: "cover", imageUrl: `https://slides.example/${id}.jpg` }],
    },
  }
}

describe("starter template example runs", () => {
  it("keeps the three newest generated examples for each template", () => {
    const grouped = groupAutomationTemplateExampleRunsByTemplateId([
      exampleRun("oldest", "starter-a", "2026-01-01T00:00:00.000Z"),
      exampleRun("newest", "starter-a", "2026-04-01T00:00:00.000Z"),
      exampleRun("middle", "starter-a", "2026-03-01T00:00:00.000Z"),
      exampleRun("discarded", "starter-a", "2026-02-01T00:00:00.000Z"),
      exampleRun("other", "starter-b", "2026-05-01T00:00:00.000Z"),
    ])

    expect(grouped["starter-a"].map((run) => run.id)).toEqual([
      "newest",
      "middle",
      "discarded",
    ])
    expect(grouped["starter-b"].map((run) => run.id)).toEqual(["other"])
  })
})
