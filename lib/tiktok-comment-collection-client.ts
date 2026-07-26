import { fetchJsonWithTimeout } from "@/lib/client-api"
import { TIKTOK_PLATFORM_POST_ID_REQUIRED } from "@/lib/tiktok-comment-errors"

export { TIKTOK_PLATFORM_POST_ID_REQUIRED } from "@/lib/tiktok-comment-errors"

type StartCollectionResponse = {
  collection: {
    id: string
  }
}

type StartCollectionRequest =
  typeof fetchJsonWithTimeout<StartCollectionResponse>

export async function collectTikTokCommentsForPublication(
  publication: {
    id: string
    platformPostId?: string
  },
  dependencies: {
    request?: StartCollectionRequest
    navigate: (href: string) => void
  }
) {
  if (!publication.platformPostId?.trim()) {
    throw new Error(TIKTOK_PLATFORM_POST_ID_REQUIRED)
  }

  const request = dependencies.request ?? fetchJsonWithTimeout
  const result = await request("/api/tiktok-comments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "collect_start",
      postIds: [publication.id],
      scope: "topLevel",
    }),
    toastOnError: false,
  })
  const collectionId = result.collection.id.trim()
  if (!collectionId) {
    throw new Error("Comment collection did not return an ID")
  }

  dependencies.navigate(
    `/app/tiktok-comments?collectionId=${encodeURIComponent(collectionId)}`
  )
  return result
}
