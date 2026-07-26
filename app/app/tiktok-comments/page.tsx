import { WorkspaceRoute } from "@/components/realfarm/routes/workspace-route"

export default async function TikTokCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    collectionId?: string | string[]
  }>
}) {
  const query = await searchParams
  const collectionId = Array.isArray(query.collectionId)
    ? query.collectionId[0]
    : query.collectionId

  return (
    <WorkspaceRoute
      navigation={{
        view: "comments",
        commentCollectionId: collectionId?.trim() || undefined,
      }}
    />
  )
}
