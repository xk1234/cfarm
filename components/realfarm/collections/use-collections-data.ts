"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import {
  collectionToStored,
  storedToCollection,
  type CreatedImageCollection,
  type StoredImageCollection,
} from "@/lib/realfarm-collections"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { apiRoutes } from "@/components/realfarm/api-client"

export function useCollectionsData({ enabled }: { enabled: boolean }) {
  const [collections, setCollections] = useState<CreatedImageCollection[]>([])
  const [collectionsLoaded, setCollectionsLoaded] = useState(false)
  const visibleCollections = collections

  useEffect(() => {
    if (!enabled || collectionsLoaded) return
    let active = true
    void fetchJsonWithTimeout<{ collections?: StoredImageCollection[] }>(
      apiRoutes.imageCollections
    )
      .then((payload) => {
        // An empty list is a real answer: never show placeholder collections.
        if (active && payload.collections) {
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

  async function persistCollection(collection: CreatedImageCollection) {
    if (collection.virtual) return
    const payload = await fetchJsonWithTimeout<{ collection?: StoredImageCollection }>(
      apiRoutes.imageCollections,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectionToStored(collection)),
      }
    )
    // Adopt the saved row id so later renames update this row.
    const serverId = payload.collection?.id
    if (serverId && serverId !== collection.serverId) {
      setCollections((current) =>
        current.map((item) => (item.id === collection.id ? { ...item, serverId } : item))
      )
    }
  }

  async function commitCollection(
    previous: CreatedImageCollection | null,
    next: CreatedImageCollection,
    failureMessage: string
  ) {
    setCollections((current) => [
      next,
      ...current.filter(
        (collection) => collection.id !== next.id && collection.id !== previous?.id
      ),
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
      await fetchJsonWithTimeout(apiRoutes.imageCollections, {
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
              void fetchJsonWithTimeout(apiRoutes.imageCollections, {
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
