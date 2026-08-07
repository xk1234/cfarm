import { describe, expect, it } from "vitest"

import {
  automationSchemaToTemplateRecord,
  missingStarterTemplateRecords,
  reelfarmAutomationToTemplateRecord,
} from "@/lib/automation-templates"
import { createLocalAutomationRecord } from "@/lib/automations"
import { defaultAutomationSchema } from "@/lib/realfarm-automation"

describe("unified template visibility", () => {
  it("uses one complete record shape and only changes the hidden default", () => {
    const active = createLocalAutomationRecord({ name: "Daily stories" })
    const starter = automationSchemaToTemplateRecord({
      id: "starter-astrology",
      name: "Astrology",
      theme: "astrology",
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z",
      schema: defaultAutomationSchema({
        id: "starter-astrology",
        name: "Astrology",
        hidden: true,
        status: "paused",
        account: "",
        handle: "",
        times: [],
        favorite: false,
        theme: "astrology",
        socialIntegrations: [],
      }),
    })

    expect(active.hidden).toBe(false)
    expect(starter).toMatchObject({
      id: "starter-astrology",
      hidden: true,
      status: "paused",
      favorite: false,
      schema: expect.objectContaining({ automationKind: "slideshow" }),
    })
    for (const key of [
      "id",
      "name",
      "hidden",
      "status",
      "favorite",
      "theme",
      "createdAt",
      "updatedAt",
      "schema",
    ] as const) {
      expect(starter).toHaveProperty(key)
      expect(active).toHaveProperty(key)
    }
  })

  it("materializes only missing starter records and preserves user visibility", () => {
    const starter = reelfarmAutomationToTemplateRecord({
      id: "astrology",
      name: "Astrology",
    })

    expect(missingStarterTemplateRecords([], [starter])).toEqual([
      expect.objectContaining({ id: starter.id, hidden: true }),
    ])
    expect(
      missingStarterTemplateRecords([{ ...starter, hidden: false }], [starter])
    ).toEqual([])
    expect(
      missingStarterTemplateRecords(
        [{ ...starter, id: "user-import", hidden: false }],
        [starter]
      )
    ).toEqual([])
  })
})
