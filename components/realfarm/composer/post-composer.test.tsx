import { renderToStaticMarkup } from "react-dom/server"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it, vi } from "vitest"

import { getSocialProvider, listSocialProviders } from "@/lib/social/registry"

import { effectiveNetworkText, updateNetworkValue } from "./composer-types"
import type { ComposerValue, ConnectedComposerAccount } from "./composer-types"
import { PostComposer } from "./post-composer"
import {
  composeLimitErrors,
  publishComposerValue,
} from "@/lib/compose-publishing"

const accounts: ConnectedComposerAccount[] = listSocialProviders()
  .filter((provider) =>
    ["x", "instagram", "linkedin"].includes(provider.platformKey)
  )
  .map((provider) => ({
    integrationId: `integration-${provider.platformKey}`,
    platformKey: provider.platformKey,
    accountName: `${provider.name} account`,
    handle: `@${provider.platformKey}`,
  }))

const value: ComposerValue = {
  base: { text: "One master message", media: [] },
  perNetwork: {},
}

describe("PostComposer", () => {
  it("renders connected-network tabs from registry metadata", () => {
    const markup = renderToStaticMarkup(
      <PostComposer accounts={accounts} onChange={vi.fn()} value={value} />
    )

    for (const account of accounts) {
      expect(markup).toContain(getSocialProvider(account.platformKey)?.name)
      expect(markup).toContain(`network-tab-${account.integrationId}`)
    }
  })

  it("reports the active network's registry character limit", () => {
    const provider = getSocialProvider("x")!
    const xAccount = accounts.find((account) => account.platformKey === "x")!
    const overLimitValue = {
      ...value,
      base: {
        ...value.base,
        text: "x".repeat(provider.limits.maxTextLength + 1),
      },
    }
    const markup = renderToStaticMarkup(
      <PostComposer
        accounts={[xAccount]}
        onChange={vi.fn()}
        value={overLimitValue}
      />
    )

    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain("1 over limit")
    expect(markup).toContain(provider.limits.maxTextLength.toString())
  })

  it("emits a structured ComposerValue when a network edit is applied", () => {
    const onChange = vi.fn<(value: ComposerValue) => void>()
    const edited = updateNetworkValue(value, "x", {
      useTextOverride: true,
      text: "An X-specific edit",
    })
    onChange(edited)

    expect(onChange).toHaveBeenCalledWith({
      base: value.base,
      perNetwork: {
        x: {
          useTextOverride: true,
          text: "An X-specific edit",
          media: [],
          fields: {},
        },
      },
    })
    expect(effectiveNetworkText(edited, "x")).toBe("An X-specific edit")
  })

  it("maps overrides, media, and schedule into PostFast payloads", async () => {
    const request = vi.fn().mockResolvedValue({ postIds: ["post-1"] })
    const uploadMedia = vi
      .fn()
      .mockResolvedValue({ key: "uploaded/image.png", type: "IMAGE" })
    const rootDir = await mkdtemp(path.join(tmpdir(), "cfarm-compose-"))
    const scheduledAt = new Date(Date.now() + 3_600_000).toISOString()
    const composerValue: ComposerValue = {
      base: {
        text: "Master copy",
        media: [
          { id: "media-1", kind: "image", url: "https://example.com/image.png" },
        ],
      },
      perNetwork: {
        x: {
          useTextOverride: true,
          text: "X copy",
          media: [],
          fields: {},
        },
      },
    }

    await publishComposerValue({
      value: composerValue,
      accounts: [accounts.find((account) => account.platformKey === "x")!],
      mode: "schedule",
      scheduledAt,
      uploadMedia,
      request,
      rootDir,
      sourceId: "compose-test",
    })

    expect(uploadMedia).toHaveBeenCalledWith("https://example.com/image.png")
    expect(request).toHaveBeenCalledWith("/social-posts", {
      body: expect.objectContaining({
        status: "SCHEDULED",
        posts: [
          expect.objectContaining({
            content: "X copy",
            scheduledAt,
            socialMediaId: "integration-x",
            mediaItems: [
              { key: "uploaded/image.png", type: "IMAGE", sortOrder: 0 },
            ],
          }),
        ],
      }),
    })
  })

  it("blocks networks whose effective text exceeds the registry limit", () => {
    const xAccount = accounts.find((account) => account.platformKey === "x")!
    const limit = getSocialProvider("x")!.limits.maxTextLength
    expect(
      composeLimitErrors(
        { base: { text: "x".repeat(limit + 1), media: [] }, perNetwork: {} },
        [xAccount]
      )
    ).toEqual(["X is 1 characters over its limit"])
  })
})
