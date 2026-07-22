"use client"

import { useState } from "react"

import { PostComposer } from "@/components/realfarm/composer/post-composer"
import type {
  ComposerValue,
  ConnectedComposerAccount,
} from "@/components/realfarm/composer/post-composer"
import { getPublishableProviders } from "@/lib/social/registry"

const previewKinds = new Set([
  "x",
  "instagram",
  "tiktok",
  "linkedin",
  "threads",
  "facebook",
  "youtube",
])
const mockAccounts: ConnectedComposerAccount[] = getPublishableProviders()
  .filter((provider) => previewKinds.has(provider.previewKind))
  .filter(
    (provider, index, providers) =>
      providers.findIndex(
        (item) => item.previewKind === provider.previewKind
      ) === index
  )
  .map((provider) => ({
    platformKey: provider.platformKey,
    accountName: "LumenClip Studio",
    handle: `@lumenclip_${provider.platformKey.replaceAll("-", "_")}`,
  }))

const initialValue: ComposerValue = {
  base: {
    text: "Turn one idea into a week of platform-ready content — without losing your voice.",
    media: [],
  },
  perNetwork: {},
}

export function ComposeDemo() {
  const [value, setValue] = useState(initialValue)
  return (
    <PostComposer accounts={mockAccounts} onChange={setValue} value={value} />
  )
}
