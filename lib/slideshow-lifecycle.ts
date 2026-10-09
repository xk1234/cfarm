/** A post linked to a slideshow: a `posts` row (`renderId`) or a legacy source link. */
export type SlideshowLinkedPost = {
  status: string
  renderId?: string
  sourceType?: string
  sourceId?: string
}

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
  post: Omit<SlideshowLinkedPost, "status">,
  input: { slideshowId: string; runId?: string }
) {
  if (post.renderId === input.slideshowId) return true
  if (
    post.sourceId &&
    post.sourceType === "slideshow" &&
    sourceIdMatches(post.sourceId, input.slideshowId)
  ) {
    return true
  }
  return Boolean(
    input.runId &&
    post.sourceId &&
    post.sourceType === "automation" &&
    sourceIdMatches(post.sourceId, input.runId)
  )
}

export function slideshowDeletionBlockReason(input: {
  slideshowStatus: unknown
  runStatus?: unknown
  slideshowId: string
  runId?: string
  posts: SlideshowLinkedPost[]
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
