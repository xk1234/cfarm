import "server-only"

import {
  composerSourcesFromRuns,
  type TemplateOutputRun,
} from "@/components/realfarm/composer/compose-sources"
import type { ComposerSourceOutput } from "@/components/realfarm/composer/composer-types"
import { listAutomationRuns } from "@/lib/automation-runner"
import { listGeneratedVideoExports } from "@/lib/generated-videos"
import { listXAutomationRuns } from "@/lib/x-automation-store"

export async function resolveComposerSources(
  sourceOutputIds: readonly string[]
): Promise<ComposerSourceOutput[]> {
  const wanted = new Set(sourceOutputIds)
  if (wanted.size === 0) return []

  const [templateRuns, videoExports, socialRuns] = await Promise.all([
    listAutomationRuns({ limit: 500 }),
    listGeneratedVideoExports({ limit: 500 }),
    listXAutomationRuns(),
  ])
  const videoRuns: TemplateOutputRun[] = videoExports.map((item) => ({
    id: item.id,
    automationId:
      typeof item.sourceConfig.automationId === "string"
        ? item.sourceConfig.automationId
        : item.sourceAutomationId || item.id,
    automationTitle:
      typeof item.sourceConfig.automationName === "string"
        ? item.sourceConfig.automationName
        : item.title,
    status: item.status,
    createdAt: item.createdAt,
    videoUrl: item.videoUrl,
    thumbnailUrl: item.previewUrl,
    plan: {
      title: item.title,
      caption: item.description,
      hashtags: item.hashtags.join(" "),
      hook:
        typeof item.sourceConfig.hook === "string"
          ? item.sourceConfig.hook
          : undefined,
      publishType: "video",
    },
  }))

  const all = composerSourcesFromRuns({
    templateRuns: [...templateRuns, ...videoRuns],
    socialRuns,
  })
  const byId = new Map(all.map((source) => [source.id, source]))
  return [...wanted].flatMap((id) => {
    const source = byId.get(id)
    return source ? [source] : []
  })
}
