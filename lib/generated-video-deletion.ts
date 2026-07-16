import type { PostFastPostRecord } from "@/lib/postfast-posts"

export type GeneratedVideoDeletionBlockReason = "published" | "scheduled"

export function generatedVideoDeletionBlockReason(
  exportId: string,
  posts: Array<Pick<PostFastPostRecord, "sourceId" | "status">>
): GeneratedVideoDeletionBlockReason | null {
  const linkedPosts = posts.filter(
    (post) =>
      post.sourceId === exportId || post.sourceId.startsWith(`${exportId}:`)
  )
  if (linkedPosts.some((post) => post.status === "published")) {
    return "published"
  }
  if (linkedPosts.some((post) => post.status === "scheduled")) {
    return "scheduled"
  }
  return null
}
