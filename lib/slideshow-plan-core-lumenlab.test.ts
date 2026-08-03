import { describe, expect, it } from "vitest"

import { automationHookItems } from "@/lib/slideshow-plan-core"

describe("slideshow plan hook source briefs", () => {
  it("preserves analyzed content and LumenLab script provenance", () => {
    const [hook] = automationHookItems({
      hooks: [
        {
          id: "hook-1",
          text: "A source-backed hook",
          enabled: true,
          contentDirection: "Keep the delivery conversational.",
          content: "The source script's factual material.",
          source: {
            provider: "lumenlab",
            projectId: "project-1",
            projectTitle: "vinfluencer",
            scriptId: "post:script-1",
            importedAt: "2026-08-02T00:00:00.000Z",
          },
        },
      ],
    })

    expect(hook).toMatchObject({
      contentDirection: "Keep the delivery conversational.",
      content: "The source script's factual material.",
      source: {
        provider: "lumenlab",
        projectId: "project-1",
        projectTitle: "vinfluencer",
        scriptId: "post:script-1",
        importedAt: "2026-08-02T00:00:00.000Z",
      },
    })
  })
})
