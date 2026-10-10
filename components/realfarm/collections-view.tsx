"use client"

export { CollectionDetailView } from "@/components/realfarm/collections/collection-detail-view"

import { useMemo, useState } from "react"
import type * as React from "react"
import {
  IconPhoto,
  IconPhotoPlus,
  IconPin,
  IconPinFilled,
  IconPlus,
  IconCheck,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"
import type { ColDef, ICellRendererParams } from "ag-grid-community"

import { AgDataTable } from "@/components/ui/ag-data-table"
import { Button } from "@/components/ui/button"
import { SkeletonBlock } from "@/components/ui/loading-skeleton"
import { SearchControl, SelectControl } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { ViewModeToggle, type ViewMode } from "@/components/ui/view-mode-toggle"
import {
  CollectionPreview,
  MediaCardShell,
  PinterestPreviewTile,
} from "@/components/realfarm/shared-media"
import { PinterestCollectionSearch } from "@/components/realfarm/pinterest-collection-search"
import {
  CollectionGridSkeleton,
  CollectionTableSkeleton,
} from "@/components/realfarm/collections/collection-loading-states"
import {
  collectionToStored,
  nextUntitledCollectionName,
  pinnedCollectionsFirst,
  storedCollectionId,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { cn } from "@/lib/utils"
import { apiRoutes } from "@/components/realfarm/api-client"

const COLLECTION_PAGE_SIZE = 28

type CollectionSort =
  "newest" | "oldest" | "name-asc" | "name-desc" | "images-desc" | "images-asc"

type CollectionTableRow = {
  id: string
  name: string
  previewImage: CreatedImageCollection["images"][number] | null
  itemCount: number
  createdAt: string
  pinned: boolean
  virtual: boolean
}

type CollectionDeletePreview = {
  collections: { name: string; created_at: string; itemCount: number }[]
  itemCount: number
  recoveryDays: number
}

export function CollectionsView({
  collections,
  loading = false,
  onCreateCollection,
  onDeleteCollections,
  onOpenCollection,
  onToggleCollectionPin,
}: {
  collections: CreatedImageCollection[]
  loading?: boolean
  onCreateCollection: (collection: CreatedImageCollection) => void
  onDeleteCollections: (ids: string[]) => void | Promise<void>
  onOpenCollection: (id: string) => void
  onToggleCollectionPin: (id: string) => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [collectionSearch, setCollectionSearch] = useState("")
  const [collectionSort, setCollectionSort] = useState<CollectionSort>("newest")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [visibleCollectionCount, setVisibleCollectionCount] =
    useState(COLLECTION_PAGE_SIZE)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<
    Set<string>
  >(new Set())
  const [deleteRequestIds, setDeleteRequestIds] = useState<string[]>([])
  const [deletePreview, setDeletePreview] =
    useState<CollectionDeletePreview | null>(null)
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const selectedIds = Array.from(selectedCollectionIds)
  const mediaCollections = collections
  const filteredCollections = useMemo(() => {
    const query = collectionSearch.trim().toLowerCase()
    const matchingCollections = query
      ? mediaCollections.filter((collection) =>
          collection.title.toLowerCase().includes(query)
        )
      : mediaCollections
    const sortedCollections = [...matchingCollections].sort((left, right) => {
      switch (collectionSort) {
        case "oldest":
          return Date.parse(left.createdAt) - Date.parse(right.createdAt)
        case "name-asc":
          return left.title.localeCompare(right.title, undefined, {
            sensitivity: "base",
          })
        case "name-desc":
          return right.title.localeCompare(left.title, undefined, {
            sensitivity: "base",
          })
        case "images-desc":
          return right.images.length - left.images.length
        case "images-asc":
          return left.images.length - right.images.length
        case "newest":
        default:
          return Date.parse(right.createdAt) - Date.parse(left.createdAt)
      }
    })
    return pinnedCollectionsFirst(sortedCollections)
  }, [mediaCollections, collectionSearch, collectionSort])
  const visibleCollections = filteredCollections.slice(
    0,
    visibleCollectionCount
  )
  const hasMoreCollections =
    visibleCollections.length < filteredCollections.length
  const collectionTableRows = useMemo<CollectionTableRow[]>(
    () =>
      filteredCollections.map((collection) => ({
        id: collection.id,
        name: collection.title,
        previewImage: collection.images[0] ?? null,
        itemCount: collection.images.length,
        createdAt: collection.createdAt,
        pinned: collection.pinned === true,
        virtual: collection.virtual === true,
      })),
    [filteredCollections]
  )
  const collectionTableColumns = useMemo<ColDef<CollectionTableRow>[]>(
    () => [
      {
        field: "name",
        headerName: "Collection",
        minWidth: 280,
        flex: 1.6,
        cellRenderer: ({ data }: ICellRendererParams<CollectionTableRow>) =>
          data ? (
            <div className="flex h-full min-w-0 items-center gap-3">
              {data.previewImage ? (
                <PinterestPreviewTile
                  image={data.previewImage}
                  index={0}
                  className="size-9 shrink-0 rounded-md border border-app-panel-border"
                />
              ) : (
                <span className="grid size-9 shrink-0 place-items-center rounded-md border border-app-panel-border bg-app-media-empty text-app-muted-text">
                  <IconPhoto className="size-4" />
                </span>
              )}
              <span className="min-w-0 truncate font-medium text-app-text">
                {data.name}
              </span>
            </div>
          ) : null,
      },
      {
        field: "itemCount",
        headerName: "Items",
        minWidth: 110,
        type: "numericColumn",
      },
      {
        field: "createdAt",
        headerName: "Created",
        minWidth: 160,
        valueFormatter: ({ value }) => formatCollectionDate(String(value)),
      },
      {
        headerName: "Actions",
        minWidth: 210,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: ICellRendererParams<CollectionTableRow>) =>
          data ? (
            <div className="flex h-full items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="softControl"
                size="compact"
                className="h-8 rounded-md"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenCollection(data.id)
                }}
              >
                Open
              </Button>
              {!data.virtual ? (
                <>
                  <Button
                    type="button"
                    variant="iconControl"
                    size="icon-sm"
                    className="border border-app-panel-border bg-app-surface"
                    onClick={(event) => {
                      event.stopPropagation()
                      onToggleCollectionPin(data.id)
                    }}
                    aria-label={`${data.pinned ? "Unpin" : "Pin"} ${data.name}`}
                  >
                    {data.pinned ? (
                      <IconPinFilled className="size-4" />
                    ) : (
                      <IconPin className="size-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="iconControl"
                    size="icon-sm"
                    className="border border-app-panel-border bg-app-surface text-app-danger"
                    onClick={(event) => {
                      event.stopPropagation()
                      void requestCollectionDelete([data.id])
                    }}
                    aria-label={`Delete ${data.name}`}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </>
              ) : null}
            </div>
          ) : null,
      },
    ],
    // requestCollectionDelete intentionally reads the latest collection set;
    // the renderer is rebuilt whenever collections changes through its rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [collections, onOpenCollection, onToggleCollectionPin]
  )

  function updateCollectionSearch(value: string) {
    setCollectionSearch(value)
    setVisibleCollectionCount(COLLECTION_PAGE_SIZE)
  }

  function toggleCollection(id: string) {
    setSelectedCollectionIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  async function requestCollectionDelete(ids: string[]) {
    const selected = collections.filter(
      (collection) => ids.includes(collection.id) && !collection.virtual
    )
    if (selected.length === 0) return
    setDeleteRequestIds(ids)
    setDeletePreview(null)
    setDeletePreviewLoading(true)
    try {
      const preview = await fetchJsonWithTimeout<CollectionDeletePreview>(
        apiRoutes.imageCollectionsDeletePreview,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collections: selected.map(collectionToStored),
          }),
          toastOnError: false,
        }
      )
      setDeletePreview(preview)
    } catch (error) {
      setDeleteRequestIds([])
      toast.error(getApiErrorMessage(error))
    } finally {
      setDeletePreviewLoading(false)
    }
  }

  async function confirmCollectionDelete() {
    if (deleteRequestIds.length === 0) return
    setDeleteSubmitting(true)
    try {
      await onDeleteCollections(deleteRequestIds)
      setSelectedCollectionIds(new Set())
      setDeleteRequestIds([])
      setDeletePreview(null)
    } catch {
      // The workspace restores the optimistic state and reports the API error.
    } finally {
      setDeleteSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1540px]">
      <div className="mb-6 flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-app-text">
          Collections
        </h1>
        {selectedIds.length > 0 ? (
          <div className="flex w-full items-center gap-2 overflow-x-auto md:w-auto">
            <Button
              variant="softControl"
              size="appDefault"
              className="h-10 md:h-9"
              onClick={() => setSelectedCollectionIds(new Set())}
            >
              Clear
            </Button>
            <Button
              variant="destructive"
              size="appDefault"
              className="h-10 md:h-9"
              onClick={() => void requestCollectionDelete(selectedIds)}
            >
              <IconTrash className="size-4" />
              Delete {selectedIds.length}{" "}
              {selectedIds.length === 1 ? "Collection" : "Collections"}
            </Button>
          </div>
        ) : (
          <div className="flex w-full items-center gap-2 overflow-x-auto md:w-auto">
            <Button
              variant="softControl"
              size="appDefault"
              className="h-10 md:h-9"
              onClick={() =>
                {
                  const title = nextUntitledCollectionName(collections)
                  // Same id the server list derives, so the URL survives a reload.
                  onCreateCollection({
                    id: storedCollectionId({ name: title }),
                    title,
                    images: [],
                    createdAt: new Date().toISOString(),
                    source: "empty",
                  })
                }
              }
            >
              <IconPhotoPlus className="size-4" />
              New collection
            </Button>
            <Button
              variant="action"
              size="appDefault"
              className="h-10 md:h-9"
              onClick={() => setSearchOpen(true)}
            >
              <IconPlus className="size-4" />
              Import images
            </Button>
          </div>
        )}
      </div>
      <div>
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:flex-nowrap md:w-auto">
            <SearchControl
              className="h-10 min-w-0 flex-1 basis-full sm:basis-0 md:h-9 md:w-[min(320px,45vw)] md:flex-none md:basis-auto"
              value={collectionSearch}
              onChange={(event) => updateCollectionSearch(event.target.value)}
              placeholder="Search collections"
              aria-label="Search collections"
            />
            <SelectControl
              value={collectionSort}
              onChange={(event) => {
                setCollectionSort(event.target.value as CollectionSort)
                setVisibleCollectionCount(COLLECTION_PAGE_SIZE)
              }}
              aria-label="Sort collections"
              className="h-10 min-w-0 flex-1 px-2 text-xs sm:w-[118px] sm:flex-none md:h-9 md:w-auto md:max-w-[180px] md:px-4 md:text-sm"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name-asc">Name: A–Z</option>
              <option value="name-desc">Name: Z–A</option>
              <option value="images-desc">Most images</option>
              <option value="images-asc">Fewest images</option>
            </SelectControl>
            <ViewModeToggle
              value={viewMode}
              onChange={setViewMode}
              className="[&_button]:size-10 md:[&_button]:size-8"
            />
          </div>
        </div>
        {loading ? (
          viewMode === "table" ? (
            <CollectionTableSkeleton />
          ) : (
            <CollectionGridSkeleton />
          )
        ) : mediaCollections.length === 0 ? (
          <button
            type="button"
            className="app-empty-state grid min-h-[470px] w-full place-items-center text-center transition hover:bg-app-control-hover"
            onClick={() => setSearchOpen(true)}
          >
            <span className="max-w-[360px]">
              <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-app-surface text-[#e46954] shadow-sm">
                <IconPhotoPlus className="size-6" />
              </span>
              <span className="block text-[18px] font-semibold">
                No image collections yet
              </span>
              <span className="mt-2 block text-[13px] leading-5 text-app-muted-text">
                Search Pinterest, choose the first batch of images, then create
                your first collection.
              </span>
            </span>
          </button>
        ) : (
          <>
            {filteredCollections.length === 0 ? (
              <div className="app-empty-state grid min-h-[260px] place-items-center text-center">
                <span>
                  <span className="block text-[18px] font-semibold">
                    No matching collections
                  </span>
                  <span className="mt-2 block text-[13px] leading-5 text-app-muted-text">
                    Try another search term.
                  </span>
                </span>
              </div>
            ) : viewMode === "table" ? (
              <AgDataTable
                rows={collectionTableRows}
                columns={collectionTableColumns}
                getRowId={(row) => row.id}
                onRowClick={(row) => onOpenCollection(row.id)}
                emptyMessage="No matching collections"
              />
            ) : (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 md:gap-5">
                  {visibleCollections.map((collection, index) => (
                    <MediaCardShell
                      key={collection.id}
                      className="group relative min-w-0 text-left"
                    >
                      {!collection.virtual && (
                        <>
                          <Button
                            type="button"
                            variant="iconControl"
                            size="icon-control-sm"
                            className={cn(
                              "absolute top-2 left-2 z-10 size-10 opacity-100 shadow-sm md:size-9",
                              selectedCollectionIds.has(collection.id) &&
                                "opacity-100"
                            )}
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleCollection(collection.id)
                            }}
                            aria-label={`Select ${collection.title}`}
                          >
                            {selectedCollectionIds.has(collection.id) ? (
                              <IconCheck className="size-4" />
                            ) : null}
                          </Button>
                          <Button
                            type="button"
                            variant="iconControl"
                            size="icon-control-sm"
                            className={cn(
                              "absolute top-2 right-2 z-10 size-10 opacity-100 shadow-sm md:size-9",
                              collection.pinned &&
                                "bg-app-accent hover:bg-app-accent text-white opacity-100"
                            )}
                            onClick={(event) => {
                              event.stopPropagation()
                              onToggleCollectionPin(collection.id)
                            }}
                            aria-label={`${collection.pinned ? "Unpin" : "Pin"} ${collection.title}`}
                            aria-pressed={collection.pinned === true}
                          >
                            {collection.pinned ? (
                              <IconPinFilled className="size-4" />
                            ) : (
                              <IconPin className="size-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="iconControl"
                            size="icon-control-sm"
                            className="absolute top-14 right-2 z-10 size-10 text-app-danger opacity-100 shadow-sm md:top-12 md:size-9"
                            onClick={(event) => {
                              event.stopPropagation()
                              void requestCollectionDelete([collection.id])
                            }}
                            aria-label={`Delete ${collection.title}`}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </>
                      )}
                      <button
                        type="button"
                        aria-label={`Open ${collection.title}`}
                        className="lc-focus-ring block w-full text-left"
                        onClick={() => onOpenCollection(collection.id)}
                      >
                        <CollectionPreview
                          collection={collection}
                          index={index}
                        />
                        <div className="bg-app-surface px-4 py-4">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <IconPhoto className="size-4 shrink-0 text-app-muted-text" />
                            <div className="truncate text-[14px] leading-5 font-semibold text-app-text">
                              {collection.title}
                            </div>
                          </div>
                          <div className="mt-1 text-[13px] font-medium text-app-muted-text">
                            {collection.images.length}{" "}
                            {collection.images.length === 1 ? "image" : "images"}
                          </div>
                        </div>
                      </button>
                    </MediaCardShell>
                  ))}
                  <Button
                    type="button"
                    variant="iconControl"
                    className="grid h-[242px] min-w-0 place-items-center rounded-[7px] border border-dashed border-app-panel-border bg-app-surface-subtle text-app-muted-text hover:bg-app-control-hover"
                    onClick={() => setSearchOpen(true)}
                    aria-label="Add collection"
                    title="Add collection"
                  >
                    <IconPlus className="size-6" />
                  </Button>
                </div>
                {hasMoreCollections && (
                  <div className="mt-8 flex justify-center">
                    <Button
                      variant="softControl"
                      size="appDefault"
                      onClick={() =>
                        setVisibleCollectionCount(
                          (current) => current + COLLECTION_PAGE_SIZE
                        )
                      }
                    >
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
      {deleteRequestIds.length > 0 ? (
        <AppModal
          className="z-[80]"
          onClose={() => {
            if (!deleteSubmitting) {
              setDeleteRequestIds([])
              setDeletePreview(null)
            }
          }}
        >
          <AppModalPanel
            className="max-w-[520px] overflow-hidden rounded-[10px]"
            accessibleTitle="Delete collections"
          >
            <AppModalHeader
              title={`Delete ${deleteRequestIds.length === 1 ? "collection" : `${deleteRequestIds.length} collections`}?`}
              onClose={() => {
                setDeleteRequestIds([])
                setDeletePreview(null)
              }}
            />
            <div className="space-y-4 p-5 text-sm">
              {deletePreviewLoading || !deletePreview ? (
                <SkeletonBlock className="h-28 w-full rounded-lg" />
              ) : (
                <>
                  <div className="rounded-lg border border-app-panel-border bg-app-surface-subtle p-3">
                    <div className="font-semibold text-app-text">
                      {deletePreview.collections
                        .map((item) => item.name)
                        .join(", ")}
                    </div>
                    <div className="mt-1 text-app-muted-text">
                      {deletePreview.itemCount} media item
                      {deletePreview.itemCount === 1 ? "" : "s"} · recoverable
                      for {deletePreview.recoveryDays} days
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-app-panel-border px-5 py-4">
              <Button
                variant="softControl"
                onClick={() => {
                  setDeleteRequestIds([])
                  setDeletePreview(null)
                }}
                disabled={deleteSubmitting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void confirmCollectionDelete()}
                disabled={
                  deletePreviewLoading || !deletePreview || deleteSubmitting
                }
              >
                <IconTrash className="size-4" />
                {deleteSubmitting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </AppModalPanel>
        </AppModal>
      ) : null}
      {searchOpen && (
        <PinterestCollectionSearch
          onCancel={() => setSearchOpen(false)}
          onCreateCollection={(collection) => {
            onCreateCollection(collection)
            setSearchOpen(false)
          }}
        />
      )}
    </div>
  )
}

function formatCollectionDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
}
