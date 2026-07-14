import type { PostFastPostRecord } from "@/lib/postfast-posts"

export type SlideshowStage = "generating" | "completed"

export function slideshowStageForRunStatus(
  status: unknown
): SlideshowStage | null {
  if (status === "generating" || status === "running") {
    return "generating"
  }
  if (status === "completed" || status === "succeeded") {
    return "completed"
  }
  return null
}

export function isPostLinkedToSlideshow(
  post: Pick<PostFastPostRecord, "sourceType" | "sourceId">,
  input: { slideshowId: string; runId?: string }
) {
  if (
    post.sourceType === "slideshow" &&
    sourceIdMatches(post.sourceId, input.slideshowId)
  ) {
    return true
  }
  return Boolean(
    input.runId &&
    post.sourceType === "automation" &&
    sourceIdMatches(post.sourceId, input.runId)
  )
}

export function slideshowDeletionBlockReason(input: {
  slideshowStatus: unknown
  runStatus?: unknown
  slideshowId: string
  runId?: string
  posts: Array<Pick<PostFastPostRecord, "sourceType" | "sourceId" | "status">>
}): "not_completed" | "published" | "scheduled" | null {
  if (
    input.slideshowStatus !== "exported" ||
    (input.runStatus !== undefined &&
      slideshowStageForRunStatus(input.runStatus) !== "completed")
  ) {
    return "not_completed"
  }

  const linkedPosts = input.posts.filter((post) =>
    isPostLinkedToSlideshow(post, input)
  )
  if (linkedPosts.some((post) => post.status === "published")) {
    return "published"
  }
  if (linkedPosts.some((post) => post.status === "scheduled")) {
    return "scheduled"
  }
  return null
}

function sourceIdMatches(sourceId: string, expectedId: string) {
  return sourceId === expectedId || sourceId.startsWith(`${expectedId}:`)
}
