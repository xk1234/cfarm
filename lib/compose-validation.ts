import type {
  ComposerValue,
  ConnectedComposerAccount,
} from "@/components/realfarm/composer/composer-types"
import { getSocialProvider } from "@/lib/social/registry"

export function composeLimitErrors(
  value: ComposerValue,
  accounts: readonly ConnectedComposerAccount[]
) {
  return accounts.flatMap((account) => {
    const provider = getSocialProvider(account.platformKey)
    if (!provider) return [`${account.accountName} is not publishable`]
    const text = effectiveComposerText(value, account.platformKey)
    return text.length > provider.limits.maxTextLength
      ? [
          `${provider.name} is ${text.length - provider.limits.maxTextLength} characters over its limit`,
        ]
      : []
  })
}

export function effectiveComposerText(
  value: ComposerValue,
  platformKey: ConnectedComposerAccount["platformKey"]
) {
  const network = value.perNetwork[platformKey]
  return network?.useTextOverride ? network.text : value.base.text
}

export function effectiveComposerMedia(
  value: ComposerValue,
  platformKey: ConnectedComposerAccount["platformKey"]
) {
  const media = value.perNetwork[platformKey]?.media ?? []
  return media.length > 0 ? media : value.base.media
}
