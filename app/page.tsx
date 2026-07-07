import { RealFarmWorkspace } from "@/components/realfarm-workspace"
import {
  automationTemplateRecordToSchema,
  automationTemplateRecordToSummary,
  groupAutomationTemplateExampleRunsByTemplateId,
  listAutomationTemplateExampleRuns,
  listAutomationTemplateRecords,
} from "@/lib/automation-templates"
import { loadRealFarmData } from "@/lib/realfarm-data"

export default async function Page() {
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
    <RealFarmWorkspace data={data} initialTemplateData={initialTemplateData} />
  )
}
