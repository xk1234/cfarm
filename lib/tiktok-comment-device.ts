import { parseManualPublicationUrl } from "@/lib/manual-publication"
import { listPublicationRecordsForRead } from "@/lib/post-repository"
import { createTikTokCommentCollection } from "@/lib/tiktok-comments"

export async function createTikTokCommentCollectionForDevice(
  input: {
    ownerId: string
    platformPostId: string
  },
  dependencies: {
    listPublications?: typeof listPublicationRecordsForRead
    createCollection?: typeof createTikTokCommentCollection
  } = {}
) {
  const platformPostId = input.platformPostId.trim()
  if (!/^\d{10,25}$/.test(platformPostId)) {
    throw new Error("A valid TikTok post ID is required")
  }
  const listPublications =
    dependencies.listPublications ?? listPublicationRecordsForRead
  const createCollection =
    dependencies.createCollection ?? createTikTokCommentCollection
  const publications = await listPublications({
    surface: "tiktok_comments_device",
  })
  const publication = publications.find(
    (candidate) =>
      candidate.provider?.toLowerCase().startsWith("tiktok") &&
      (candidate.externalPostId?.trim() === platformPostId ||
        releaseUrlPostId(candidate.releaseUrl) === platformPostId)
  )
  if (!publication) {
    throw new Error(
      "This TikTok is not linked to a LumenClip publication yet. Publish or import it, then reopen the extension."
    )
  }
  return createCollection({
    ownerId: input.ownerId,
    postIds: [publication.id],
    scope: "topLevel",
    maxComments: 100,
  })
}

function releaseUrlPostId(value?: string) {
  if (!value) return ""
  try {
    return parseManualPublicationUrl({
      url: value,
      provider: "tiktok",
    }).externalPostId
  } catch {
    return ""
  }
}
