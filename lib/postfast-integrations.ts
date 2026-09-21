import { getUserPreferences } from "@/lib/auth"
import { clean, isRecord } from "@/lib/guards"
import {
  postfastRequest,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import {
  extractSocialBuAccounts,
  socialbuRequest,
} from "@/lib/socialbu-client"
import { normalizePostFastSocialIntegrations } from "@/lib/social/postfast-adapter"
import { normalizeSocialBuSocialIntegrations } from "@/lib/social/socialbu-adapter"
import { activePublishingProvider } from "@/lib/social/publishing-provider"

async function listRawIntegrations(): Promise<unknown[]> {
  if (activePublishingProvider() === "socialbu") {
    return extractSocialBuAccounts(
      await socialbuRequest<unknown>("/accounts")
    )
  }
  return postfastRequest<unknown[]>("/social-media/my-social-accounts")
}

function normalizeIntegrations(values: unknown[]): PostFastSocialIntegration[] {
  const adapter =
    activePublishingProvider() === "socialbu"
      ? normalizeSocialBuSocialIntegrations
      : normalizePostFastSocialIntegrations
  return adapter(values) as PostFastSocialIntegration[]
}

export async function listConnectedPostFastIntegrations(ownerId: string) {
  const [rawIntegrations, preferences] = await Promise.all([
    listRawIntegrations(),
    getUserPreferences(ownerId),
  ])
  const disconnectedIds = new Set(disconnectedIntegrationIds(preferences))

  return normalizeIntegrations(rawIntegrations).filter(
    (integration) =>
      !integration.disabled &&
      !disconnectedIds.has(integration.integration_id)
  )
}

export async function listVisiblePostFastIntegrationPayload(ownerId: string) {
  const rawIntegrations = await listRawIntegrations()
  const disconnectedIds = new Set(
    disconnectedIntegrationIds(await getUserPreferences(ownerId))
  )
  return {
    integrations: rawIntegrations.filter(
      (integration) => !disconnectedIds.has(integrationId(integration))
    ),
    disconnectedIntegrations: rawIntegrations.filter((integration) =>
      disconnectedIds.has(integrationId(integration))
    ),
  }
}

function disconnectedIntegrationIds(value: unknown) {
  if (!isRecord(value)) return []
  return Array.isArray(value.postfastDisconnectedIntegrationIds)
    ? value.postfastDisconnectedIntegrationIds.map(clean).filter(Boolean)
    : []
}

function integrationId(value: unknown) {
  if (!isRecord(value)) return ""
  return (
    clean(value.id ?? value.integration_id) ||
    (typeof value.account_id === "number" ? String(value.account_id) : "")
  )
}
