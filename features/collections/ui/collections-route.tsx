"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"

import { CollectionsView } from "@/features/collections/ui/collections-view"
import { CollectionDetailView } from "@/features/collections/ui/collection-detail-view"
import { useCollectionsData } from "@/features/collections/ui/use-collections-data"
import {
  findCollectionByIdOrAlias,
  type CreatedImageCollection,
} from "@/features/collections/domain/collections"
import { WorkspaceShell } from "@/features/workspace/ui/workspace-shell"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import type { Automation, RealFarmData } from "@/lib/realfarm-data"
import type { ProductCollection } from "@/lib/product-collections"

export function CollectionsRoute({
  assets,
  collectionId,
  initialCollections,
  initialProductCollections,
  ownerName,
}: {
  assets: RealFarmData["assets"]
  collectionId?: string
  initialCollections: CreatedImageCollection[]
  initialProductCollections: ProductCollection[]
  ownerName: string
}) {
  const router = useRouter()
  const {
    visibleCollections,
    productCollections,
    collectionsLoaded,
    commitCollection,
    deleteCollections,
    toggleCollectionPin,
  } = useCollectionsData({
    assets,
    enabled: true,
    initialCollections,
    initialProductCollections,
  })
  const selectedCollection = useMemo(
    () =>
      collectionId
        ? findCollectionByIdOrAlias(visibleCollections, collectionId)
        : undefined,
    [collectionId, visibleCollections]
  )

  async function createAutomation(name: string) {
    const payload = await fetchJsonWithTimeout<{ template?: Automation }>(
      "/api/templates",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, overrides: { status: "paused" } }),
      }
    )
    if (!payload.template) throw new Error("Failed to create template")
    router.push(
      `/app/templates?template=${encodeURIComponent(payload.template.id)}`
    )
  }

  return (
    <WorkspaceShell view="collections" ownerName={ownerName}>
      {selectedCollection ? (
        <CollectionDetailView
          collection={selectedCollection}
          readonly={selectedCollection.virtual}
          onBack={() => router.push("/app/collections")}
          onAddImages={(images) =>
            selectedCollection.virtual
              ? undefined
              : commitCollection(
                  selectedCollection,
                  {
                    ...selectedCollection,
                    images: [...images, ...selectedCollection.images],
                  },
                  "Failed to add images to the collection"
                )
          }
          onRemoveImages={(keys) => {
            if (selectedCollection.virtual) return
            void commitCollection(
              selectedCollection,
              {
                ...selectedCollection,
                images: selectedCollection.images.filter(
                  (image) => !keys.includes(image.id || image.imageUrl)
                ),
              },
              "Failed to remove images from the collection"
            )
          }}
          onUpdateCollection={(nextCollection) => {
            if (selectedCollection.virtual) return
            void commitCollection(
              selectedCollection,
              nextCollection,
              "Failed to update the collection"
            )
          }}
          onRename={(title) => {
            if (selectedCollection.virtual) return
            void commitCollection(
              selectedCollection,
              { ...selectedCollection, title },
              "Failed to rename the collection"
            )
          }}
          onCreateAutomation={(name) => void createAutomation(name)}
        />
      ) : (
        <CollectionsView
          collections={visibleCollections}
          productCollections={productCollections}
          loading={!collectionsLoaded}
          onCreateCollection={(collection) => {
            void commitCollection(
              null,
              collection,
              "Failed to create the collection"
            )
          }}
          onDeleteCollections={deleteCollections}
          onOpenCollection={(id) =>
            router.push(`/app/collections/${encodeURIComponent(id)}`)
          }
          onToggleCollectionPin={toggleCollectionPin}
        />
      )}
    </WorkspaceShell>
  )
}
