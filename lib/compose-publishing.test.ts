import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ publishPost: vi.fn() }))

vi.mock("@/lib/publishing", () => ({
  publishPost: mocks.publishPost,
}))

import { publishComposerValue } from "@/lib/compose-publishing"

beforeEach(() => {
  mocks.publishPost.mockReset()
  mocks.publishPost.mockResolvedValue({ ok: true })
})

describe("composer canonical publishing", () => {
  it("creates one destination intent input per account and keeps a retry source stable", async () => {
    const value = {
      sourceOutputIds: ["run-1"],
      base: { text: "Base caption", media: [] },
      perNetwork: {},
    }
    const accounts = [
      {
        integrationId: "account-1",
        platformKey: "tiktok" as const,
        accountName: "TikTok",
        handle: "@tt",
      },
      {
        integrationId: "account-2",
        platformKey: "instagram" as const,
        accountName: "Instagram",
        handle: "@ig",
      },
    ]
    await publishComposerValue({
      value,
      accounts,
      mode: "now",
      sourceId: "compose-action-1",
      uploadMedia: vi.fn(),
    })

    expect(mocks.publishPost).toHaveBeenCalledTimes(2)
    expect(mocks.publishPost).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        integrationId: "account-1",
        sourceType: "external",
        sourceId: "compose-action-1",
        outputId: "compose-action-1",
        origin: "composer",
      })
    )
    expect(mocks.publishPost).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ integrationId: "account-2" })
    )
  })

  it("uses a new business-action source for a deliberate repost", async () => {
    const input = {
      value: {
        sourceOutputIds: ["run-1"],
        base: { text: "Caption", media: [] },
        perNetwork: {},
      },
      accounts: [
        {
          integrationId: "account-1",
          platformKey: "tiktok" as const,
          accountName: "TikTok",
          handle: "@tt",
        },
      ],
      mode: "now" as const,
      uploadMedia: vi.fn(),
    }
    const first = await publishComposerValue(input)
    const second = await publishComposerValue(input)

    expect(first.sourceId).not.toBe(second.sourceId)
  })
})
