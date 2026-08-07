import { describe, expect, it } from "vitest"

import {
  GET as getLegacyDefinitions,
  PATCH as patchLegacyDefinition,
  POST as createLegacyDefinition,
} from "@/app/api/automations/route"
import {
  GET as getTemplates,
  PATCH as patchTemplate,
  POST as createTemplate,
} from "@/app/api/templates/route"

describe("/api/templates compatibility route", () => {
  it("uses the existing definition handlers without changing historical storage", () => {
    expect(getTemplates).toBe(getLegacyDefinitions)
    expect(createTemplate).toBe(createLegacyDefinition)
    expect(patchTemplate).toBe(patchLegacyDefinition)
  })
})
