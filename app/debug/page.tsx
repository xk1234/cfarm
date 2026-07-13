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
import { listBenchmarkCorpus } from "@/lib/slideshow-benchmarks"

export const dynamic = "force-dynamic"

export default async function DebugPage() {
  const [templateRecords, imageCollections, exampleRuns, benchmarkCorpus] = await Promise.all([
    listAutomationTemplateRecords(),
    listImageCollections(),
    listAutomationTemplateExampleRuns(),
    listBenchmarkCorpus(),
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
      benchmarkCorpus={benchmarkCorpus}
    />
  )
}
