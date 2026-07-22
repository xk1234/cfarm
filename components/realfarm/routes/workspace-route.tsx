import { redirect } from "next/navigation"

import {
  RealFarmWorkspace,
  type InitialTemplateData,
} from "@/components/realfarm-workspace"
import type { ViewKey } from "@/components/realfarm/navigation"
import {
  automationTemplateRecordToSchema,
  automationTemplateRecordToSummary,
  groupAutomationTemplateExampleRunsByTemplateId,
  listAutomationTemplateExampleRuns,
  listAutomationTemplateRecords,
} from "@/lib/automation-templates"
import { getCurrentUser } from "@/lib/auth"
import { loadRealFarmData } from "@/lib/realfarm-data"
import { listConnectedPostFastIntegrations } from "@/lib/postfast-integrations"
import type { ConnectedComposerAccount } from "@/components/realfarm/composer/composer-types"

export type WorkspaceNavigation = {
  view: ViewKey
  automationId?: string
  runId?: string
  collectionId?: string
}

export async function WorkspaceRoute({
  navigation,
}: {
  navigation: WorkspaceNavigation
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [data, initialTemplateData, composeAccounts] = await Promise.all([
    loadRealFarmData({ mediaAssets: [] }),
    loadInitialTemplateData(),
    navigation.view === "compose"
      ? loadComposeAccounts(user.$id)
      : Promise.resolve([]),
  ])

  return (
    <RealFarmWorkspace
      data={{
        ...data,
        brand: { ...data.brand, owner: user.name || user.email },
      }}
      initialTemplateData={initialTemplateData}
      initialNavigation={navigation}
      composeAccounts={composeAccounts}
      user={{
        id: user.$id,
        email: user.email,
        emailVerified: user.emailVerification,
      }}
    />
  )
}

async function loadComposeAccounts(
  ownerId: string
): Promise<ConnectedComposerAccount[]> {
  try {
    return (await listConnectedPostFastIntegrations(ownerId)).map(
      (integration) => ({
        integrationId: integration.integration_id,
        platformKey: integration.provider,
        accountName: integration.name,
        handle: integration.profile ?? integration.name,
        avatarUrl: integration.picture,
      })
    )
  } catch {
    return []
  }
}

async function loadInitialTemplateData(): Promise<InitialTemplateData> {
  const [templateRecords, templateExampleRuns] = await Promise.all([
    listAutomationTemplateRecords(),
    listAutomationTemplateExampleRuns(),
  ])

  return {
    templates: templateRecords.map(automationTemplateRecordToSummary),
    exampleRunsByTemplateId:
      groupAutomationTemplateExampleRunsByTemplateId(templateExampleRuns),
    schemas: Object.fromEntries(
      templateRecords.map((record) => [
        record.id,
        automationTemplateRecordToSchema(record),
      ])
    ),
  }
}
