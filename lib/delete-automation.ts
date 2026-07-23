import {
  automationRecordToSummary,
  deleteAutomationRecord,
} from "@/lib/automations"
import {
  deleteAutomationRuns,
  listAutomationRuns,
} from "@/lib/automation-runner"
import { deletePostFastPostRecords } from "@/lib/postfast-posts"
import { deleteAutomationJobs } from "@/lib/queue"
import { deleteSlideshowRecordsForAutomation } from "@/lib/slideshows"

export async function deleteAutomationCascade(input: { id: string }) {
  const record = await deleteAutomationRecord(input)

  const [automationRuns, deletedJobs] = await Promise.all([
    listAutomationRuns({
      automationId: input.id,
      limit: Number.MAX_SAFE_INTEGER,
    }),
    deleteAutomationJobs(input.id),
  ])
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
      deletePostFastPostRecords({
        sourceType: "slideshow",
        sourceIds: [...slideshowIds],
      }),
      deletePostFastPostRecords({
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
    deletedJobs,
    deletedJobsCount: deletedJobs.length,
    deletedPostFastPosts,
    deletedPostFastPostsCount: deletedPostFastPosts.length,
  }
}
