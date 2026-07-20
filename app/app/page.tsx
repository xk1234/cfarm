import { redirect } from "next/navigation"

import { RealFarmWorkspace } from "@/components/realfarm-workspace"
import {
  automationTemplateRecordToSchema,
  automationTemplateRecordToSummary,
  groupAutomationTemplateExampleRunsByTemplateId,
  listAutomationTemplateExampleRuns,
  listAutomationTemplateRecords,
} from "@/lib/automation-templates"
import { getCurrentUser } from "@/lib/auth"
import { loadRealFarmData } from "@/lib/realfarm-data"
import type { ViewKey } from "@/components/realfarm/navigation"

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[]
    automation?: string | string[]
    run?: string | string[]
  }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  const query = await searchParams

  const [data, templateRecords, templateExampleRuns] = await Promise.all([
    loadRealFarmData({ mediaAssets: [] }),
    listAutomationTemplateRecords(),
    listAutomationTemplateExampleRuns(),
  ])
  const initialTemplateData = {
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

  return (
    <RealFarmWorkspace
      data={{
        ...data,
        brand: { ...data.brand, owner: user.name || user.email },
      }}
      initialTemplateData={initialTemplateData}
      initialNavigation={{
        view: initialView(firstQueryValue(query.view)),
        automationId: firstQueryValue(query.automation),
        runId: firstQueryValue(query.run),
      }}
      user={{
        id: user.$id,
        email: user.email,
        emailVerified: user.emailVerification,
      }}
    />
  )
}

function initialView(value: string): ViewKey {
  return [
    "home",
    "schedule",
    "analytics",
    "collections",
    "automations",
  ].includes(value)
    ? (value as ViewKey)
    : "home"
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "")
}
