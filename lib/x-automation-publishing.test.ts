import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ publishPost: vi.fn() }))

vi.mock("@/lib/publishing", () => ({
  publishPost: mocks.publishPost,
}))

import { publishXAutomationRun } from "@/lib/x-automation-publishing"
import { defaultXAutomation, type XAutomationRun } from "@/lib/x-automation"

beforeEach(() => {
  mocks.publishPost.mockReset()
  mocks.publishPost.mockResolvedValue({ ok: true })
})

describe("X automation canonical publishing", () => {
  it("passes stable automation/run/output identity to each repository-backed publish", async () => {
    const automation = defaultXAutomation({
      id: "automation-x",
      name: "X automation",
      platform: "x",
    })
    automation.publishing.integrations = [
      { integration_id: "account-x-1", provider: "x", name: "X one" },
      {
        integration_id: "account-x-2",
        provider: "twitter",
        name: "X two",
      },
    ]
    const result = await publishXAutomationRun({
      automation,
      run: xRun(),
    })

    expect(result).toMatchObject({ published: 2, failed: 0 })
    expect(mocks.publishPost).toHaveBeenCalledTimes(2)
    expect(mocks.publishPost).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "x_automation",
        sourceId: "run-x",
        outputId: "run-x",
        automationId: "automation-x",
        runId: "run-x",
      })
    )
  })

  it("reports a failed retry without changing its identity inputs", async () => {
    mocks.publishPost.mockResolvedValue({ ok: false })
    const automation = defaultXAutomation({ id: "automation-x" })
    automation.publishing.integrations = [
      { integration_id: "account-x-1", provider: "x", name: "X one" },
    ]
    const run = xRun()

    expect(await publishXAutomationRun({ automation, run })).toMatchObject({
      published: 0,
      failed: 1,
    })
    expect(await publishXAutomationRun({ automation, run })).toMatchObject({
      published: 0,
      failed: 1,
    })
    expect(mocks.publishPost.mock.calls[0][0]).toMatchObject(
      mocks.publishPost.mock.calls[1][0]
    )
  })
})

function xRun(): XAutomationRun {
  return {
    id: "run-x",
    automationId: "automation-x",
    automationName: "X automation",
    topic: "Topic",
    contentType: "single",
    platform: "x",
    reactionMode: "none",
    hook: "Hook",
    setup: "",
    content: [],
    proof: "",
    curiosityGap: "",
    cta: "",
    posts: [
      {
        id: "post-1",
        platform: "x",
        text: "Post text",
        characterCount: 9,
        role: "hook",
      },
    ],
    imageUrls: [],
    benchmark: {
      total: 1,
      hook: 1,
      specificity: 1,
      readability: 1,
      cta: 1,
      formatFit: 1,
      stageCompleteness: 1,
      archetypeFit: 1,
      comparison: {
        archetype: "label_take",
        target: "original",
      },
      notes: [],
    },
    status: "approved",
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  }
}
