"use client"

export { CollectionDetailView } from "@/components/realfarm/collections/collection-detail-view"

import { useMemo, useState } from "react"
import type * as React from "react"
import {
  IconBrackets,
  IconPhoto,
  IconPhotoPlus,
  IconPin,
  IconPinFilled,
  IconPlus,
  IconShoppingBag,
  IconTrash,
  IconVideo,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Tabs } from "radix-ui"
import type { ColDef, ICellRendererParams } from "ag-grid-community"

import { AgDataTable } from "@/components/ui/ag-data-table"
import { Button } from "@/components/ui/button"
import { SkeletonBlock } from "@/components/ui/loading-skeleton"
import {
  SearchControl,
  SelectControl,
} from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { ViewModeToggle, type ViewMode } from "@/components/ui/view-mode-toggle"
import {
  CollectionPreview,
  MediaCardShell,
  PinterestPreviewTile,
} from "@/components/realfarm/shared-media"
import { PinterestCollectionSearch } from "@/components/realfarm/pinterest-collection-search"
import { VariableCollectionsPanel } from "@/components/realfarm/variable-collections-panel"
import { ProductCollectionsPanel } from "@/components/realfarm/product-collections-panel"
import {
  CollectionGridSkeleton,
  CollectionTableSkeleton,
} from "@/components/realfarm/collections/collection-loading-states"
import {
  collectionToStored,
  pinnedCollectionsFirst,
  type CreatedImageCollection,
} from "@/lib/realfarm-collections"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { ProductCollection } from "@/lib/product-collections"
import { cn } from "@/lib/utils"

const COLLECTION_PAGE_SIZE = 28

type CollectionTab = "images" | "videos" | "products" | "variables"
type CollectionSort =
  "newest" | "oldest" | "name-asc" | "name-desc" | "images-desc" | "images-asc"

type CollectionTableRow = {
  id: string
  name: string
  mediaType: "Image" | "Video"
  previewImage: CreatedImageCollection["images"][number] | null
  itemCount: number
  createdAt: string
  pinned: boolean
  virtual: boolean
}

type CollectionDeletePreview = {
  collections: { name: string; created_at: string; itemCount: number }[]
  itemCount: number
  dependentAutomations: { id: string; name: string }[]
  dependentTemplates: { id: string; name: string }[]
  recoveryDays: number
}

export function CollectionsView({
  collections,
  productCollections,
  loading = false,
  onCreateCollection,
  onDeleteCollections,
  onOpenCollection,
  onToggleCollectionPin,
}: {
  collections: CreatedImageCollection[]
  productCollections: ProductCollection[]
  loading?: boolean
  onCreateCollection: (collection: CreatedImageCollection) => void
  onDeleteCollections: (ids: string[]) => void | Promise<void>
  onOpenCollection: (id: string) => void
  onToggleCollectionPin: (id: string) => void
}) {
  const [activeTab, setActiveTab] = useState<CollectionTab>("images")
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
  const mediaCollections = useMemo(
    () =>
      activeTab === "products" || activeTab === "variables"
        ? []
        : collections.filter((collection) =>
            activeTab === "videos"
              ? collection.mediaType === "video"
              : collection.mediaType !== "video"
          ),
    [activeTab, collections]
  )
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
        mediaType: collection.mediaType === "video" ? "Video" : "Image",
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
                  {data.mediaType === "Video" ? (
                    <IconVideo className="size-4" />
                  ) : (
                    <IconPhoto className="size-4" />
                  )}
                </span>
              )}
              <span className="min-w-0 truncate font-medium text-app-text">
                {data.name}
              </span>
            </div>
          ) : null,
      },
      { field: "mediaType", headerName: "Type", minWidth: 120 },
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
        "/api/image-collections/delete-preview",
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

  function selectTab(tab: CollectionTab) {
    setActiveTab(tab)
    setSelectedCollectionIds(new Set())
    setCollectionSearch("")
    setVisibleCollectionCount(COLLECTION_PAGE_SIZE)
  }

  return (
    <div className="mx-auto max-w-[1540px]">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-[24px] font-semibold tracking-normal">
          Collections
          <button
            type="button"
            aria-label="About collections"
            aria-describedby="collections-help"
            className="group relative grid size-6 place-items-center rounded-full border border-[#aeb5c0] text-[14px] font-semibold text-[#7b8492]"
          >
            ?
            <span
              id="collections-help"
              role="tooltip"
              className="pointer-events-none absolute top-7 left-1/2 z-20 hidden w-[280px] -translate-x-1/2 rounded-[8px] bg-[#2f2f2d] px-3 py-2 text-left text-[12px] leading-5 font-medium text-white shadow-lg group-hover:block group-focus:block"
            >
              Collections organize images, videos, and reusable variables for
              automations.
            </span>
          </button>
        </h1>
        {activeTab !== "variables" && selectedIds.length > 0 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="softControl"
              size="appDefault"
              onClick={() => setSelectedCollectionIds(new Set())}
            >
              Clear
            </Button>
            <Button
              variant="destructive"
              size="appDefault"
              onClick={() => void requestCollectionDelete(selectedIds)}
            >
              <IconTrash className="size-4" />
              Delete {selectedIds.length}{" "}
              {selectedIds.length === 1 ? "Collection" : "Collections"}
            </Button>
          </div>
        ) : activeTab === "images" ? (
          <div className="flex items-center gap-2">
            <Button
              variant="softControl"
              size="appDefault"
              onClick={() =>
                onCreateCollection({
                  id: `collection-empty-${Date.now()}`,
                  title: "Empty collection",
                  images: [],
                  createdAt: new Date().toISOString(),
                  source: "empty",
                })
              }
            >
              <IconPhotoPlus className="size-4" />
              Create empty collection
            </Button>
            <Button
              variant="action"
              size="appDefault"
              onClick={() => setSearchOpen(true)}
            >
              <IconPlus className="size-4" />
              Add
            </Button>
          </div>
        ) : null}
      </div>
      <Tabs.Root
        value={activeTab}
        onValueChange={(value) => selectTab(value as typeof activeTab)}
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Tabs.List
            className="flex w-fit rounded-[7px] border border-app-panel-border bg-app-surface-subtle p-1"
            aria-label="Collection types"
          >
            {(
              [
                ["images", "Images", IconPhoto],
                ["videos", "Videos", IconVideo],
                ["products", "Products", IconShoppingBag],
                ["variables", "Variables", IconBrackets],
              ] as const
            ).map(([tab, label, Icon]) => (
              <Tabs.Trigger
                key={tab}
                value={tab}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-[5px] px-4 text-[13px] font-semibold transition",
                  activeTab === tab
                    ? "bg-app-surface text-app-text shadow-sm"
                    : "text-app-muted-text hover:text-app-text"
                )}
              >
                <Icon className="size-4" />
                {label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {(activeTab === "images" || activeTab === "videos") && (
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <SearchControl
                className="w-[min(320px,45vw)]"
                value={collectionSearch}
                onChange={(event) => updateCollectionSearch(event.target.value)}
                placeholder={`Search ${activeTab}`}
                aria-label={`Search ${activeTab} collections`}
              />
              <SelectControl
                value={collectionSort}
                onChange={(event) => {
                  setCollectionSort(event.target.value as CollectionSort)
                  setVisibleCollectionCount(COLLECTION_PAGE_SIZE)
                }}
                aria-label="Sort collections"
                className="max-w-[180px]"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name-asc">Name: A–Z</option>
                <option value="name-desc">Name: Z–A</option>
                <option value="images-desc">Most images</option>
                <option value="images-asc">Fewest images</option>
              </SelectControl>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </div>
          )}
        </div>
        {activeTab === "products" ? (
          <ProductCollectionsPanel collections={productCollections} />
        ) : activeTab === "variables" ? (
          <VariableCollectionsPanel />
        ) : (
          <>
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
                onClick={() => activeTab === "images" && setSearchOpen(true)}
              >
                <span className="max-w-[360px]">
                  <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-app-surface text-[#e46954] shadow-sm">
                    <IconPhotoPlus className="size-6" />
                  </span>
                  <span className="block text-[18px] font-semibold">
                    No {activeTab} collections yet
                  </span>
                  <span className="mt-2 block text-[13px] leading-5 text-app-muted-text">
                    {activeTab === "images"
                      ? "Search Pinterest, choose the first batch of images, then create your first collection."
                      : "Video collections appear here when reusable video assets are added."}
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
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">
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
                                  "absolute top-2 left-2 z-10 opacity-100 shadow-sm md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100",
                                  selectedCollectionIds.has(collection.id) &&
                                    "opacity-100"
                                )}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  toggleCollection(collection.id)
                                }}
                                aria-label={`Select ${collection.title}`}
                              >
                                {selectedCollectionIds.has(collection.id)
                                  ? "✓"
                                  : ""}
                              </Button>
                              <Button
                                type="button"
                                variant="iconControl"
                                size="icon-control-sm"
                                className={cn(
                                  "absolute top-2 right-2 z-10 opacity-100 shadow-sm md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100",
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
                                className="absolute top-11 right-2 z-10 text-app-danger opacity-100 shadow-sm md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
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
                            className="block w-full text-left"
                            onClick={() => onOpenCollection(collection.id)}
                          >
                            <CollectionPreview
                              collection={collection}
                              index={index}
                            />
                            <div className="bg-app-surface px-4 py-4">
                              <div className="flex min-w-0 items-center gap-1.5">
                                {collection.mediaType === "video" ? (
                                  <IconVideo className="size-4 shrink-0 text-app-muted-text" />
                                ) : (
                                  <IconPhoto className="size-4 shrink-0 text-app-muted-text" />
                                )}
                                <div className="truncate text-[14px] leading-5 font-semibold text-app-text">
                                  {collection.title}
                                </div>
                              </div>
                              <div className="mt-1 text-[13px] font-medium text-app-muted-text">
                                {collection.images.length}{" "}
                                {collection.mediaType === "video"
                                  ? "videos"
                                  : "images"}
                              </div>
                            </div>
                          </button>
                        </MediaCardShell>
                      ))}
                      {activeTab === "images" ? (
                        <Button
                          type="button"
                          variant="iconControl"
                          className="grid h-[242px] min-w-0 place-items-center rounded-[7px] border border-dashed border-app-panel-border bg-app-surface-subtle text-app-muted-text hover:bg-app-control-hover"
                          onClick={() => setSearchOpen(true)}
                          aria-label="Add collection"
                        >
                          <IconPlus className="size-6" />
                        </Button>
                      ) : null}
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
          </>
        )}
      </Tabs.Root>
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
              description="This is a recoverable soft deletion."
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
                  {deletePreview.dependentAutomations.length > 0 ||
                  deletePreview.dependentTemplates.length > 0 ? (
                    <div className="rounded-lg border border-[#f0d3cc] bg-[#fff7f5] p-3 text-[#8f3d31]">
                      <div className="font-semibold">Referenced by</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {deletePreview.dependentAutomations.map((item) => (
                          <li key={`automation-${item.id}`}>
                            Automation: {item.name}
                          </li>
                        ))}
                        {deletePreview.dependentTemplates.map((item) => (
                          <li key={`template-${item.id}`}>
                            Template: {item.name}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs">
                        Those workflows will need another collection unless you
                        undo.
                      </p>
                    </div>
                  ) : (
                    <p className="text-app-muted-text">
                      No automations or templates depend on these collections.
                    </p>
                  )}
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
      {searchOpen && activeTab === "images" && (
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
