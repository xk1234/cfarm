import type { SocialPlatformKey } from "@/lib/social/provider-contract"
import type { PreviewMedia } from "@/components/realfarm/previews/platform-preview"

export interface ComposerBaseValue {
  text: string
  media: PreviewMedia[]
}

export interface NetworkComposerValue {
  useTextOverride: boolean
  text: string
  media: PreviewMedia[]
  fields: Record<string, string>
}

export interface ComposerValue {
  base: ComposerBaseValue
  perNetwork: Partial<Record<SocialPlatformKey, NetworkComposerValue>>
}

export interface ConnectedComposerAccount {
  platformKey: SocialPlatformKey
  accountName: string
  handle: string
  avatarUrl?: string
}

export const EMPTY_COMPOSER_VALUE: ComposerValue = {
  base: { text: "", media: [] },
  perNetwork: {},
}

export function emptyNetworkValue(): NetworkComposerValue {
  return { useTextOverride: false, text: "", media: [], fields: {} }
}

export function networkValueFor(
  value: ComposerValue,
  platformKey: SocialPlatformKey
) {
  return value.perNetwork[platformKey] ?? emptyNetworkValue()
}

export function effectiveNetworkText(
  value: ComposerValue,
  platformKey: SocialPlatformKey
) {
  const network = networkValueFor(value, platformKey)
  return network.useTextOverride ? network.text : value.base.text
}

export function updateNetworkValue(
  value: ComposerValue,
  platformKey: SocialPlatformKey,
  update: Partial<NetworkComposerValue>
): ComposerValue {
  return {
    ...value,
    perNetwork: {
      ...value.perNetwork,
      [platformKey]: { ...networkValueFor(value, platformKey), ...update },
    },
  }
}
