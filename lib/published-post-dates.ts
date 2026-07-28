import { listAutomationRuns } from "@/lib/automation-runner"
import { listGeneratedVideoExports } from "@/lib/generated-videos"
import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import { publicationMatchesRun } from "@/lib/hook-publications"
import {
  listPostFastPostRecords,
  type PostFastPostRecord,
} from "@/lib/postfast-posts"

/**
 * When each output that reached an audience went out, for the dashboard graph.
 *
 * Linked publications and explicit manual-publish confirmations count. An
 * `unlinked` record is a draft or unmatched import, and merely generating an
 * output still does not mean it was posted.
 *
 * Marking an output published by hand only stamps `manuallyPublishedAt` on the
 * run or export -- it writes no publication row -- so counting publications
 * alone reported zero posts for workspaces that publish manually.
 */
export async function loadPublishedPostDates() {
  const [postsResult, runsResult, videosResult] = await Promise.allSettled([
    listPostFastPostRecords(),
    listAutomationRuns({
      limit: Number.MAX_SAFE_INTEGER,
      postRecords: [],
    }),
    listGeneratedVideoExports({ limit: Number.MAX_SAFE_INTEGER }),
  ])
  const posts = fulfilledValue(postsResult)
  const runs = fulfilledValue(runsResult)
  const videos = fulfilledValue(videosResult)
  const linkedPosts = posts.filter((post) => post.linkState !== "unlinked")

  return [
    ...linkedPosts.map((post) => post.publishedAt || post.createdAt),
    ...runs
      .filter(
        (run) =>
          Boolean(run.manuallyPublishedAt) &&
          !linkedPosts.some((post) => publicationMatchesRun(post, run))
      )
      .map((run) => run.manuallyPublishedAt),
    ...videos
      .filter(
        (video) =>
          Boolean(video.manuallyPublishedAt) &&
          !linkedPosts.some((post) =>
            publicationMatchesGeneratedVideo(post, video)
          )
      )
      .map((video) => video.manuallyPublishedAt),
  ].filter((value): value is string => Boolean(value))
}

function fulfilledValue<T>(result: PromiseSettledResult<T[]>) {
  // The graph is not worth failing the whole dashboard over.
  return result.status === "fulfilled" ? result.value : []
}

function publicationMatchesGeneratedVideo(
  publication: PostFastPostRecord,
  video: GeneratedVideoExport
) {
  // The publish path renames template_video to generated_video.
  const sourceType =
    video.type === "template_video" ? "generated_video" : video.type
  return (
    publication.sourceType === sourceType && publication.sourceId === video.id
  )
}
