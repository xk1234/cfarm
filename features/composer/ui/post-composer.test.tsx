import { renderToStaticMarkup } from "react-dom/server"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { describe, expect, it, vi } from "vitest"

import { getSocialProvider, listSocialProviders } from "@/lib/social/registry"

import type {
  ComposerSourceOutput,
  ComposerValue,
  ConnectedComposerAccount,
} from "@/features/composer/domain/composer"
import { PostComposer } from "@/features/composer/ui/post-composer"
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
  sourceOutputIds: ["run-1"],
  base: { text: "One master message", media: [] },
  perNetwork: {},
}

const sources: ComposerSourceOutput[] = [
  {
    id: "run-1",
    templateId: "template-1",
    templateName: "Demo template",
    title: "Generated output",
    createdAt: "2026-08-07T00:00:00.000Z",
    kind: "text",
    text: "One master message",
    media: [],
  },
]

const composerProps = {
  onChange: vi.fn(),
  onRepurpose: vi.fn(),
  repurposing: false,
  sources,
}

describe("PostComposer", () => {
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
        {...composerProps}
        value={overLimitValue}
      />
    )

    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain("1 over limit")
    expect(markup).toContain(provider.limits.maxTextLength.toString())
  })

  it("offers an accessible compact network switcher", () => {
    const markup = renderToStaticMarkup(
      <PostComposer accounts={accounts} {...composerProps} value={value} />
    )

    expect(markup).toContain('aria-label="Network to customize"')
    expect(markup).toContain(">X<")
    expect(markup).toContain(">Instagram<")
    expect(markup).toContain(">LinkedIn<")
    expect(markup).toContain('aria-label="Post preview and settings"')
    expect(markup).toContain(">Preview<")
    expect(markup).toContain(">Settings<")
  })

  it("keeps source material read-only and removes arbitrary media inputs", () => {
    const markup = renderToStaticMarkup(
      <PostComposer accounts={accounts} {...composerProps} value={value} />
    )

    expect(markup).toContain("Source material")
    expect(markup).not.toContain("Master message")
    expect(markup).not.toContain("Shared media URL")
    expect(markup).not.toContain('type="url"')
  })

  it("maps overrides, media, and schedule into PostFast payloads", async () => {
    const request = vi.fn().mockResolvedValue({ postIds: ["post-1"] })
    const uploadMedia = vi
      .fn()
      .mockResolvedValue({ key: "uploaded/image.png", type: "IMAGE" })
    const rootDir = await mkdtemp(path.join(tmpdir(), "cfarm-compose-"))
    const scheduledAt = new Date(Date.now() + 3_600_000).toISOString()
    const composerValue: ComposerValue = {
      sourceOutputIds: ["run-1"],
      base: {
        text: "Master copy",
        media: [
          {
            id: "media-1",
            kind: "image",
            url: "https://example.com/image.png",
          },
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
        {
          sourceOutputIds: ["run-1"],
          base: { text: "x".repeat(limit + 1), media: [] },
          perNetwork: {},
        },
        [xAccount]
      )
    ).toEqual(["X is 1 characters over its limit"])
  })
})
