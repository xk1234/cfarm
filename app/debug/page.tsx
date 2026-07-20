import { SlideTestingCenter } from "@/components/temp/slide-testing-center"
import { internalToolsEnabled } from "@/lib/internal-tools"
import {
  groupAutomationTemplateExampleRunsByTemplateId,
  listAutomationTemplateExampleRuns,
  listAutomationTemplateRecords,
} from "@/lib/automation-templates"
import { listImageCollections } from "@/lib/image-collections"
import {
  automationTemplateToTempSlideTestingAutomation,
  storedCollectionsToTempSlideCollections,
} from "@/lib/temp-slide-testing"
import { notFound } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function DebugPage() {
  if (!internalToolsEnabled()) notFound()

  const [templateRecords, imageCollections, exampleRuns] = await Promise.all([
    listAutomationTemplateRecords(),
    listImageCollections(),
    listAutomationTemplateExampleRuns(),
  ])

  return (
    <SlideTestingCenter
      automations={templateRecords.map(
        automationTemplateToTempSlideTestingAutomation
      )}
      automationJsonById={Object.fromEntries(
        templateRecords.map((record) => [record.id, record])
      )}
      collections={storedCollectionsToTempSlideCollections(imageCollections)}
      exampleRunsByAutomationId={groupAutomationTemplateExampleRunsByTemplateId(
        exampleRuns
      )}
    />
  )
}
