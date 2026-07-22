import { getUserPreferences } from "@/lib/auth"
import { clean, isRecord } from "@/lib/guards"
import {
  postfastRequest,
  type PostFastSocialIntegration,
} from "@/lib/postfast-client"
import { normalizePostFastSocialIntegrations } from "@/lib/social/postfast-adapter"

export async function listConnectedPostFastIntegrations(ownerId: string) {
  const [rawIntegrations, preferences] = await Promise.all([
    postfastRequest<unknown[]>("/social-media/my-social-accounts"),
    getUserPreferences(ownerId),
  ])
  const disconnectedIds = new Set(disconnectedIntegrationIds(preferences))

  return normalizePostFastSocialIntegrations(rawIntegrations).filter(
    (integration) =>
      !integration.disabled &&
      !disconnectedIds.has(integration.integration_id)
  ) as PostFastSocialIntegration[]
}

export async function listVisiblePostFastIntegrationPayload(ownerId: string) {
  const rawIntegrations = await postfastRequest<unknown[]>(
    "/social-media/my-social-accounts"
  )
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
  return clean(value.id ?? value.integration_id)
}
