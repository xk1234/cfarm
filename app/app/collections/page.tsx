import { CollectionsRoute } from "@/features/collections/ui/collections-route"
import { loadCollectionsRouteData } from "@/features/collections/server/load-collections-route"
import { getCurrentUser } from "@/lib/auth"

export default async function CollectionsPage() {
  const [user, data] = await Promise.all([
    getCurrentUser(),
    loadCollectionsRouteData(),
  ])

  return (
    <CollectionsRoute
      assets={data.assets}
      initialCollections={data.collections}
      initialProductCollections={data.productCollections}
      ownerName={user?.name ?? "LumenClip user"}
    />
  )
}
