import "server-only"

import type { ConnectedComposerAccount } from "@/features/composer/domain/composer"
import { listComposerSources } from "@/lib/compose-sources.server"
import { listConnectedPostFastIntegrations } from "@/lib/postfast-integrations"

export async function loadComposeRouteData(ownerId: string) {
  const [integrations, sourceOutputs] = await Promise.all([
    listConnectedPostFastIntegrations(ownerId).catch(() => []),
    listComposerSources(),
  ])

  const accounts: ConnectedComposerAccount[] = integrations.map(
    (integration) => ({
      integrationId: integration.integration_id,
      platformKey: integration.provider,
      accountName: integration.name,
      handle: integration.profile ?? integration.name,
      avatarUrl: integration.picture,
    })
  )

  return { accounts, sourceOutputs }
}
