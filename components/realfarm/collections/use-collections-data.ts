"use client"

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import {
  collectionToStored,
  defaultImageCollections,
  greenscreenMemeCollectionFromAssets,
  storedToCollection,
  ugcAvatarVideoCollectionFromAssets,
  type CreatedImageCollection,
  type StoredImageCollection,
} from "@/lib/realfarm-collections"
import type { RealFarmData } from "@/lib/realfarm-data"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { ProductCollection } from "@/lib/product-collections"

export function useCollectionsData({
  data,
  assets,
  enabled,
}: {
  data: RealFarmData
  assets: RealFarmData["assets"]
  enabled: boolean
}) {
  const [collections, setCollections] = useState<CreatedImageCollection[]>(() =>
    defaultImageCollections(data)
  )
  const [collectionsLoaded, setCollectionsLoaded] = useState(false)
  const [productCollections, setProductCollections] = useState<
    ProductCollection[]
  >([])
  const [productCollectionsLoaded, setProductCollectionsLoaded] =
    useState(false)

  const visibleCollections = useMemo(
    () => [
      ugcAvatarVideoCollectionFromAssets(assets.ugcAvatarVideos, collections),
      greenscreenMemeCollectionFromAssets(assets.greenscreenMemes),
      ...collections,
    ],
    [assets.greenscreenMemes, assets.ugcAvatarVideos, collections]
  )

  useEffect(() => {
    if (!enabled || collectionsLoaded) return
    let active = true
    void fetchJsonWithTimeout<{ collections?: StoredImageCollection[] }>(
      "/api/image-collections"
    )
      .then((payload) => {
        if (active && payload.collections?.length) {
          setCollections(payload.collections.map(storedToCollection))
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setCollectionsLoaded(true)
      })
    return () => {
      active = false
    }
  }, [collectionsLoaded, enabled])

  useEffect(() => {
    if (!enabled || productCollectionsLoaded) return
    let active = true
    void fetchJsonWithTimeout<{ collections?: ProductCollection[] }>(
      "/api/product-collections"
    )
      .then((payload) => {
        if (active) setProductCollections(payload.collections ?? [])
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setProductCollectionsLoaded(true)
      })
    return () => {
      active = false
    }
  }, [enabled, productCollectionsLoaded])

  async function persistCollection(collection: CreatedImageCollection) {
    if (collection.virtual) return
    await fetchJsonWithTimeout("/api/image-collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectionToStored(collection)),
    })
  }

  async function commitCollection(
    previous: CreatedImageCollection | null,
    next: CreatedImageCollection,
    failureMessage: string
  ) {
    setCollections((current) => [
      next,
      ...current.filter((collection) => collection.id !== next.id),
    ])
    try {
      await persistCollection(next)
      return true
    } catch (error) {
      setCollections((current) =>
        previous
          ? [
              previous,
              ...current.filter((collection) => collection.id !== previous.id),
            ]
          : current.filter((collection) => collection.id !== next.id)
      )
      toast.error(getApiErrorMessage(error, failureMessage))
      return false
    }
  }

  function toggleCollectionPin(id: string) {
    const previous = collections.find((collection) => collection.id === id)
    if (!previous || previous.virtual) return
    const next = { ...previous, pinned: !previous.pinned }
    setCollections((current) =>
      current.map((collection) => (collection.id === id ? next : collection))
    )
    void persistCollection(next).catch(() => {
      setCollections((current) =>
        current.map((collection) =>
          collection.id === id ? previous : collection
        )
      )
      toast.error("Could not update the collection pin")
    })
  }

  async function deleteCollections(ids: string[]) {
    const deleted = collections.filter((collection) =>
      ids.includes(collection.id)
    )
    setCollections((current) =>
      current.filter((collection) => !ids.includes(collection.id))
    )
    const persisted = deleted.filter((collection) => !collection.virtual)
    if (persisted.length === 0) return
    const storedCollections = persisted.map(collectionToStored)
    try {
      await fetchJsonWithTimeout("/api/image-collections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        toastOnError: false,
        body: JSON.stringify({ collections: storedCollections }),
      })
      toast.success(
        `${persisted.length} collection${persisted.length === 1 ? "" : "s"} deleted`,
        {
          duration: 10_000,
          action: {
            label: "Undo",
            onClick: () => {
              void fetchJsonWithTimeout("/api/image-collections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                toastOnError: false,
                body: JSON.stringify({
                  action: "restore",
                  collections: storedCollections,
                }),
              })
                .then(() => {
                  setCollections((current) => restoreMissing(current, deleted))
                  toast.success("Collection deletion undone")
                })
                .catch((error) => toast.error(getApiErrorMessage(error)))
            },
          },
        }
      )
    } catch (error) {
      setCollections((current) => restoreMissing(current, deleted))
      toast.error(getApiErrorMessage(error))
      throw error
    }
  }

  return {
    collections,
    visibleCollections,
    productCollections,
    collectionsLoaded,
    commitCollection,
    deleteCollections,
    toggleCollectionPin,
  }
}

function restoreMissing(
  current: CreatedImageCollection[],
  deleted: CreatedImageCollection[]
) {
  const currentIds = new Set(current.map((collection) => collection.id))
  return [
    ...deleted.filter((collection) => !currentIds.has(collection.id)),
    ...current,
  ]
}
