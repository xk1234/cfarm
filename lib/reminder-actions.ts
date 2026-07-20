import "server-only"

import {
  getAutomationRunForSlideshow,
  markAutomationRunPublished,
} from "@/lib/automation-runner"
import {
  getGeneratedVideoExport,
  markGeneratedVideoExportPublished,
} from "@/lib/generated-videos"
import { withSystemOwner } from "@/lib/system-owner-context"

export type ReminderPostedSourceType = "slideshow" | "generated_video"

export async function markReminderGenerationPosted(input: {
  ownerId: string
  sourceType: string
  sourceId: string
  publishedAt?: Date
}) {
  const ownerId = input.ownerId.trim()
  const sourceId = input.sourceId.trim()
  if (!ownerId || !sourceId) throw new Error("Invalid reminder action")

  return withSystemOwner(ownerId, async () => {
    if (input.sourceType === "slideshow") {
      const run = await getAutomationRunForSlideshow({ slideshowId: sourceId })
      if (!run) throw new Error("The slideshow generation was not found")
      if (run.manuallyPublishedAt) {
        return { alreadyPosted: true, publishedAt: run.manuallyPublishedAt }
      }
      const updated = await markAutomationRunPublished({
        slideshowId: sourceId,
        runId: run.id,
        publishedAt: input.publishedAt,
      })
      if (!updated) throw new Error("The slideshow generation was not found")
      return {
        alreadyPosted: false,
        publishedAt: updated.manuallyPublishedAt!,
      }
    }

    if (input.sourceType === "generated_video") {
      const video = await getGeneratedVideoExport(sourceId)
      if (!video) throw new Error("The video generation was not found")
      if (video.manuallyPublishedAt) {
        return { alreadyPosted: true, publishedAt: video.manuallyPublishedAt }
      }
      const updated = await markGeneratedVideoExportPublished({
        id: sourceId,
        publishedAt: input.publishedAt,
      })
      if (!updated) throw new Error("The video generation was not found")
      return {
        alreadyPosted: false,
        publishedAt: updated.manuallyPublishedAt!,
      }
    }

    throw new Error("This reminder cannot be marked as posted")
  })
}
