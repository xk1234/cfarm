import { redirect } from "next/navigation"
import { unstable_cache } from "next/cache"

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

const listCachedAutomationTemplateRecords = unstable_cache(
  listAutomationTemplateRecords,
  ["automation-template-records"],
  { revalidate: 300 }
)
const listCachedAutomationTemplateExampleRuns = unstable_cache(
  listAutomationTemplateExampleRuns,
  ["automation-template-example-runs"],
  { revalidate: 300 }
)

export default async function WorkspacePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const [data, templateRecords, templateExampleRuns] = await Promise.all([
    loadRealFarmData({ mediaAssets: [] }),
    listCachedAutomationTemplateRecords(),
    listCachedAutomationTemplateExampleRuns(),
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
      user={{
        id: user.$id,
        email: user.email,
        emailVerified: user.emailVerification,
      }}
    />
  )
}
