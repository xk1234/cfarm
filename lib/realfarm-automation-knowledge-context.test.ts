import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  automationKnowledgeBaseIds,
  defaultAutomationSchema,
  normalizeAutomationSchema,
} from "@/lib/realfarm-automation"
import type { Automation } from "@/lib/realfarm-data"

const automation: Automation = {
  id: "knowledge-context-test",
  name: "Knowledge context test",
  automationKind: "slideshow",
  status: "live",
  account: "",
  handle: "",
  theme: "default",
  times: [],
  favorite: false,
  socialIntegrations: [],
}

describe("automation knowledge context switch", () => {
  it("defaults off and excludes selected knowledge bases until enabled", () => {
    const defaults = defaultAutomationSchema(automation)
    expect(defaults.knowledge_context_enabled).toBe(false)

    const disabled = normalizeAutomationSchema(
      {
        ...defaults,
        knowledge_base_ids: ["hdb-trends"],
      },
      automation
    )
    expect(automationKnowledgeBaseIds(disabled)).toEqual([])

    expect(
      automationKnowledgeBaseIds({
        ...disabled,
        knowledge_context_enabled: true,
      })
    ).toEqual(["hdb-trends"])
  })

  it("disables selection in the UI while the switch is off", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/automation-settings/general-settings.tsx"
      ),
      "utf8"
    )

    expect(source).toContain("enabled={knowledgeContextEnabled}")
    expect(source).toContain('aria-label="Toggle knowledge context"')
    expect(source).toContain("disabled={!knowledgeContextEnabled}")
  })
})
