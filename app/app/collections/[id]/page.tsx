import { CollectionsRoute } from "@/features/collections/ui/collections-route"
import { loadCollectionsRouteData } from "@/features/collections/server/load-collections-route"
import { getCurrentUser } from "@/lib/auth"

export default async function CollectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, user, data] = await Promise.all([
    params,
    getCurrentUser(),
    loadCollectionsRouteData(),
  ])
  return (
    <CollectionsRoute
      assets={data.assets}
      collectionId={id}
      initialCollections={data.collections}
      initialProductCollections={data.productCollections}
      ownerName={user?.name ?? "LumenClip user"}
    />
  )
}
