import { randomUUID } from "node:crypto"

import type {
  ComposerValue,
  ConnectedComposerAccount,
} from "@/components/realfarm/composer/composer-types"
import type { PostFastMedia } from "@/lib/postfast-client"
import {
  composeLimitErrors,
  effectiveComposerMedia,
  effectiveComposerText,
} from "@/lib/compose-validation"
import { publishPost, type PublishRequest } from "@/lib/publishing"
import { getSocialProvider } from "@/lib/social/registry"

export type ComposePublishMode = "now" | "schedule"

export type ComposePublishResult = {
  integrationId: string
  network: string
  ok: boolean
  error?: string
}

export { composeLimitErrors }

export async function publishComposerValue(input: {
  value: ComposerValue
  accounts: readonly ConnectedComposerAccount[]
  mode: ComposePublishMode
  scheduledAt?: string
  uploadMedia: (url: string) => Promise<PostFastMedia>
  request?: PublishRequest
  sourceId?: string
  rootDir?: string
}) {
  const sourceId = input.sourceId ?? randomUUID()
  const uploadCache = new Map<string, Promise<PostFastMedia>>()
  const results: ComposePublishResult[] = []

  for (const account of input.accounts) {
    const provider = getSocialProvider(account.platformKey)
    if (!provider) {
      results.push({
        integrationId: account.integrationId,
        network: account.accountName,
        ok: false,
        error: "This network is not publishable",
      })
      continue
    }

    try {
      const media = await Promise.all(
        effectiveComposerMedia(input.value, account.platformKey).map((item) => {
          const existing = uploadCache.get(item.url)
          if (existing) return existing
          const upload = input.uploadMedia(item.url)
          uploadCache.set(item.url, upload)
          return upload
        })
      )
      const result = await publishPost({
        type: input.mode,
        date: input.mode === "schedule" ? input.scheduledAt : undefined,
        integrationId: account.integrationId,
        provider: account.platformKey,
        content: effectiveComposerText(input.value, account.platformKey),
        media,
        settings: input.value.perNetwork[account.platformKey]?.fields,
        sourceType: "external",
        sourceId,
        rootDir: input.rootDir,
        request: input.request,
      })
      results.push({
        integrationId: account.integrationId,
        network: provider.name,
        ok: result.ok,
        error: result.error,
      })
    } catch (error) {
      results.push({
        integrationId: account.integrationId,
        network: provider.name,
        ok: false,
        error: error instanceof Error ? error.message : "Publishing failed",
      })
    }
  }

  return { sourceId, results }
}
