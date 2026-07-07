import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

let tempRoot: string

beforeEach(async () => {
  tempRoot = await mkdtemp(
    path.join(os.tmpdir(), "cfarm-automation-hooks-route-")
  )
  await mkdir(path.join(tempRoot, "data", "automations"), { recursive: true })
  vi.spyOn(process, "cwd").mockReturnValue(tempRoot)
})

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
  await rm(tempRoot, { recursive: true, force: true })
})

describe("POST /api/automations/hooks", () => {
  it("generates ten hooks from a sampled user automation and persists them", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key")
    const {
      createLocalAutomationRecord,
      listAutomationRecords,
      upsertAutomationRecords,
    } = await import("@/lib/automations")
    const { automationHooks, schemaWithAutomationHooks } =
      await import("@/lib/realfarm-automation")
    const automation = createLocalAutomationRecord({
      name: "Daily Discipline",
    })
    automation.schema = schemaWithAutomationHooks(automation.schema, [
      "how to stop wasting your potential",
      "daily practices that rewire your mind",
      "how to actually become disciplined",
    ])
    expect(automation.schema.prompt_formatting.narrative).toBe(
      [
        "how to stop wasting your potential",
        "daily practices that rewire your mind",
        "how to actually become disciplined",
      ].join("\n")
    )
    await upsertAutomationRecords({
      rootDir: path.join(tempRoot, "data", "automations"),
      records: [automation],
    })

    const generatedHooks = Array.from(
      { length: 10 },
      (_, index) => `new discipline hook ${index + 1}`
    )
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ hooks: generatedHooks }),
                },
              },
            ],
          }),
          { status: 200 }
        )
    )
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/automations/hooks", {
        method: "POST",
        body: JSON.stringify({ automationId: automation.id }),
      })
    )
    const payload = await response.json()
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [
      RequestInfo | URL,
      RequestInit,
    ]
    const requestBody = JSON.parse(requestInit.body as string) as {
      messages: Array<{ role: string; content: string }>
    }

    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestBody.messages[1].content).toContain(
      "Automation: Daily Discipline"
    )
    expect(requestBody.messages[1].content).toContain("Existing hooks:")
    expect(payload.generatedHooks).toEqual(generatedHooks)
    expect(payload.hooks).toEqual(expect.arrayContaining(generatedHooks))

    const records = await listAutomationRecords({
      rootDir: path.join(tempRoot, "data", "automations"),
    })
    expect(automationHooks(records[0].schema)).toEqual(
      expect.arrayContaining(generatedHooks)
    )
  })

  it("rejects hook generation when the automation has no seed hooks", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key")
    const { createLocalAutomationRecord, upsertAutomationRecords } =
      await import("@/lib/automations")
    const { schemaWithAutomationHooks } =
      await import("@/lib/realfarm-automation")
    const automation = createLocalAutomationRecord({
      name: "Empty Hooks",
    })
    automation.schema = schemaWithAutomationHooks(automation.schema, [])
    await upsertAutomationRecords({
      rootDir: path.join(tempRoot, "data", "automations"),
      records: [automation],
    })

    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    const { POST } = await import("./route")
    const response = await POST(
      new Request("http://localhost/api/automations/hooks", {
        method: "POST",
        body: JSON.stringify({ automationId: automation.id }),
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe("Add at least one hook before generating more")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
