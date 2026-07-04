import { SlideTestingCenter } from "@/components/temp/slide-testing-center"
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

export default async function TempTestingCenterPage() {
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
      collections={storedCollectionsToTempSlideCollections(imageCollections)}
      exampleRunsByAutomationId={groupAutomationTemplateExampleRunsByTemplateId(
        exampleRuns
      )}
    />
  )
}
