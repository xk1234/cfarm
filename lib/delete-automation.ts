import {
  automationRecordToSummary,
  deleteAutomationRecord,
} from "@/lib/automations"
import {
  deleteAutomationRuns,
  listAutomationRuns,
} from "@/lib/automation-runner"
import { deletePosts } from "@/lib/post-repository"
import { deleteSlideshowRecordsForAutomation } from "@/lib/slideshows"

export async function deleteAutomationCascade(input: { id: string }) {
  const record = await deleteAutomationRecord(input)

  const automationRuns = await listAutomationRuns({
    automationId: input.id,
    limit: Number.MAX_SAFE_INTEGER,
  })
  const deletedSlideshows = await deleteSlideshowRecordsForAutomation({
    automationId: input.id,
    slideshowIds: automationRuns
      .map((run) => run.slideshowId)
      .filter((slideshowId): slideshowId is string => Boolean(slideshowId)),
  })
  const slideshowIds = new Set(
    [
      ...automationRuns
        .map((run) => run.slideshowId)
        .filter((slideshowId): slideshowId is string => Boolean(slideshowId)),
      ...deletedSlideshows.map((slideshow) => slideshow.id),
    ].filter(Boolean)
  )
  const [deletedPostFastSlideshowPosts, deletedPostFastAutomationPosts] =
    await Promise.all([
      deletePosts({
        sourceType: "slideshow",
        sourceIds: [...slideshowIds],
      }),
      deletePosts({
        sourceType: "automation",
        sourceIds: automationRuns.map((run) => run.id),
      }),
    ])
  const deletedRuns = await deleteAutomationRuns({
    automationId: input.id,
    slideshowIds: [...slideshowIds],
  })
  const deletedPostFastPosts = [
    ...deletedPostFastSlideshowPosts,
    ...deletedPostFastAutomationPosts,
  ]

  return {
    record,
    automation: record ? automationRecordToSummary(record) : null,
    alreadyDeleted: !record,
    deletedSlideshows,
    deletedSlideshowsCount: deletedSlideshows.length,
    deletedResultsCount: deletedSlideshows.length,
    deletedRuns,
    deletedRunsCount: deletedRuns.length,
    deletedPostFastPosts,
    deletedPostFastPostsCount: deletedPostFastPosts.length,
  }
}
