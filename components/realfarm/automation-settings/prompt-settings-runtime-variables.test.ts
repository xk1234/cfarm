import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { PromptConfigPanel } from "./prompt-settings"

describe("automation prompt runtime variables", () => {
  it("shows runtime and collection variables in one compact badge list", () => {
    expect(typeof PromptConfigPanel).toBe("function")

    const source = readFileSync(
      path.join(
        process.cwd(),
        "components/realfarm/automation-settings/prompt-settings.tsx"
      ),
      "utf8"
    )
    expect(source).toContain("Variables")
    expect(source).toContain("Hover a badge to preview")
    expect(source).toContain("<VariableBadge")
    expect(source).toContain("variable.name.toUpperCase()")
    expect(source).not.toContain("Default runtime variables")
    expect(source).not.toContain("Dynamic tags")
    expect(source).toContain("migrateLegacyHookVariableReferences")
    expect(source).toContain("wordCollectionVariableName")
  })
})
