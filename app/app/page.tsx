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

export default async function WorkspacePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const data = loadRealFarmData()
  const [templateRecords, templateExampleRuns] = await Promise.all([
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
      user={{
        id: user.$id,
        email: user.email,
        emailVerified: user.emailVerification,
      }}
    />
  )
}
