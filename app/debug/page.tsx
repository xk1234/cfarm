import { DebugAutomationEditor } from "@/components/debug/debug-automation-editor"
import { listAutomationRecords } from "@/lib/automations"

export const dynamic = "force-dynamic"

export default async function DebugPage() {
  const records = await listAutomationRecords()
  const serializableRecords = JSON.parse(JSON.stringify(records)) as Awaited<
    ReturnType<typeof listAutomationRecords>
  >

  return <DebugAutomationEditor records={serializableRecords} />
}
