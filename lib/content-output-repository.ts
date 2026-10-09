import {
  outputFromGeneratedPost,
  outputFromSlideshow,
  outputFromVideo,
  type ContentOutput,
} from "@/lib/content-outputs"
import { listGeneratedVideoExports } from "@/lib/generated-videos"
import { listSlideshowRecords } from "@/lib/slideshows"
import { listXAutomationRuns } from "@/lib/x-automation-store"

export async function listContentOutputs(): Promise<ContentOutput[]> {
  const [slideshows, videos, generatedText] = await Promise.all([
    listSlideshowRecords({ limit: 100 }),
    listGeneratedVideoExports({ limit: 100 }),
    listXAutomationRuns(),
  ])

  return [
    ...slideshows.map(outputFromSlideshow),
    ...videos.map(outputFromVideo),
    ...generatedText.map(outputFromGeneratedPost),
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function getContentOutputs(ids: readonly string[]) {
  const wanted = new Set(ids.map((id) => id.trim()).filter(Boolean))
  if (wanted.size === 0) return []
  return (await listContentOutputs()).filter((output) => wanted.has(output.id))
}
