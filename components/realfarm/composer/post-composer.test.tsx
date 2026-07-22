import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { getSocialProvider, listSocialProviders } from "@/lib/social/registry"

import { effectiveNetworkText, updateNetworkValue } from "./composer-types"
import type { ComposerValue, ConnectedComposerAccount } from "./composer-types"
import { PostComposer } from "./post-composer"

const accounts: ConnectedComposerAccount[] = listSocialProviders()
  .filter((provider) =>
    ["x", "instagram", "linkedin"].includes(provider.platformKey)
  )
  .map((provider) => ({
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
      expect(markup).toContain(`network-tab-${account.platformKey}`)
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
})
