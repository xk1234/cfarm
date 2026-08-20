import "server-only"

import type { InitialTemplateData } from "@/features/templates/domain/templates"
import {
  groupAutomationTemplateExampleRunsByTemplateId,
  listAutomationTemplateExampleRuns,
  listAutomationTemplateRecords,
} from "@/lib/automation-templates"
import { loadRealFarmData, type RealFarmData } from "@/lib/realfarm-data"

export type TemplatesRouteData = {
  data: RealFarmData
  initialTemplateData: InitialTemplateData
}

export async function loadTemplatesRouteData(
  owner: string
): Promise<TemplatesRouteData> {
  const [data, initialTemplateData] = await Promise.all([
    loadRealFarmData({ mediaAssets: [] }),
    loadInitialTemplateData(),
  ])

  return {
    data: {
      ...data,
      brand: { ...data.brand, owner },
    },
    initialTemplateData,
  }
}

async function loadInitialTemplateData(): Promise<InitialTemplateData> {
  const [templateRecords, exampleRuns] = await Promise.all([
    listAutomationTemplateRecords(),
    listAutomationTemplateExampleRuns(),
  ])
  const exampleRunsByTemplateId =
    groupAutomationTemplateExampleRunsByTemplateId(exampleRuns)

  return {
    previewImages: Object.fromEntries(
      templateRecords.flatMap((record) => {
        const latestRun = exampleRunsByTemplateId[record.id]?.[0]
        const previewImage = latestRun?.plan?.slides?.find(
          (slide) => slide.imageUrl
        )?.imageUrl

        return previewImage ? [[record.id, previewImage]] : []
      })
    ),
  }
}
