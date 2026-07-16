"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type * as React from "react"
import {
  IconBrackets,
  IconChevronLeft,
  IconLayoutDashboard,
  IconList,
  IconPhoto,
  IconPhotoPlus,
  IconPin,
  IconPinFilled,
  IconPlus,
  IconShoppingBag,
  IconTrash,
  IconUpload,
  IconVideo,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Popover, Tabs } from "radix-ui"
import type { ColDef, ICellRendererParams } from "ag-grid-community"

import { AgDataTable } from "@/components/ui/ag-data-table"
import { Button } from "@/components/ui/button"
import {
  LabelledSelect,
  SearchControl,
  SelectControl,
  SwitchPillButton,
  ToggleRow,
} from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import { SkeletonBlock } from "@/components/ui/loading-skeleton"
import { ViewModeToggle, type ViewMode } from "@/components/ui/view-mode-toggle"
import { ImageViewerModal } from "@/components/realfarm/image-viewer-modal"
import {
  CollectionPreview,
  ControlRow,
  ControlToggle,
  MediaCardShell,
  PinterestPreviewTile,
  SlideThumb,
} from "@/components/realfarm/shared-media"
import { PinterestCollectionSearch } from "@/components/realfarm/pinterest-collection-search"
import { VariableCollectionsPanel } from "@/components/realfarm/variable-collections-panel"
import { ProductCollectionsPanel } from "@/components/realfarm/product-collections-panel"
import {
  collectionToStored,
  pinnedCollectionsFirst,
  type CreatedImageCollection,
  type StoredImageCollection,
} from "@/lib/realfarm-collections"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import type { ProductCollection } from "@/lib/product-collections"
import { cn } from "@/lib/utils"

type CaptionProgressState = {
  total: number
  completed: number
  status: "running" | "complete" | "error"
  currentTitle: string
  error?: string
}

const INITIAL_VISIBLE_ROWS = 3
const LOAD_MORE_ROWS = 3
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
  onDeleteCollections: (ids: string[]) => void
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
                      onDeleteCollections([data.id])
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
    [onDeleteCollections, onOpenCollection, onToggleCollectionPin]
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

  function deleteCollections(ids: string[]) {
    onDeleteCollections(ids)
    setSelectedCollectionIds(new Set())
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
          <span className="group relative grid size-6 place-items-center rounded-full border border-[#aeb5c0] text-[14px] font-semibold text-[#7b8492]">
            ?
            <span className="pointer-events-none absolute top-7 left-1/2 z-20 hidden w-[280px] -translate-x-1/2 rounded-[8px] bg-[#2f2f2d] px-3 py-2 text-left text-[12px] leading-5 font-medium text-white shadow-lg group-hover:block">
              Collections organize images, videos, and reusable variables for
              automations.
            </span>
          </span>
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
              onClick={() => deleteCollections(selectedIds)}
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
                                  "absolute top-2 left-2 z-10 opacity-0 shadow-sm group-hover:opacity-100",
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
                                  "absolute top-2 right-2 z-10 opacity-0 shadow-sm group-hover:opacity-100",
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
                                className="absolute top-11 right-2 z-10 text-app-danger opacity-0 shadow-sm group-hover:opacity-100"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  deleteCollections([collection.id])
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

function CollectionGridSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading collections"
      aria-busy="true"
      className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5"
    >
      {Array.from({ length: 14 }, (_, index) => (
        <div
          key={index}
          className="min-w-0 overflow-hidden rounded-[8px] border border-app-panel-border bg-app-surface"
        >
          <SkeletonBlock className="h-[170px] w-full rounded-none" />
          <div className="px-4 py-4">
            <SkeletonBlock className="h-3.5 w-4/5 rounded" />
            <SkeletonBlock className="mt-2 h-3 w-2/5 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function CollectionTableSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading collections"
      aria-busy="true"
      className="overflow-hidden rounded-[8px] border border-app-panel-border bg-app-surface"
    >
      <SkeletonBlock className="h-11 w-full rounded-none" />
      {Array.from({ length: 8 }, (_, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(220px,1.6fr)_120px_110px_160px_210px] gap-4 border-t border-app-panel-border px-4 py-4"
        >
          {Array.from({ length: 5 }, (_, cellIndex) => (
            <SkeletonBlock key={cellIndex} className="h-3 w-full rounded" />
          ))}
        </div>
      ))}
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

function CaptionProgressModal({
  progress,
  onClose,
}: {
  progress: CaptionProgressState
  onClose: () => void
}) {
  const complete = progress.status === "complete"
  const failed = progress.status === "error"
  const percent =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0

  return (
    <AppModal className="z-[70]" onClose={onClose}>
      <AppModalPanel
        accessibleTitle={failed ? "Captioning stopped" : "Captioning images"}
        className="max-w-[460px] p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-bold text-app-text">
              {failed
                ? "Captioning stopped"
                : complete
                  ? "Captions generated"
                  : "Generating captions"}
            </h2>
            <p className="mt-1 text-[13px] font-semibold text-app-muted-text">
              {progress.completed} of {progress.total} captions generated
            </p>
          </div>
          {(complete || failed) && (
            <Button
              type="button"
              variant="iconControl"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close captions progress"
            >
              <IconX className="size-5" />
            </Button>
          )}
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3 text-[12px] font-semibold text-app-muted-text">
            <span className="min-w-0 truncate">
              {failed
                ? "Failed"
                : complete
                  ? "Complete"
                  : `Captioning ${progress.currentTitle}`}
            </span>
            <span>{percent}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-md bg-app-control-bg">
            <div
              className={cn(
                "h-full rounded-md transition-all",
                failed ? "bg-destructive" : "bg-app-action"
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        {progress.error && (
          <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-[12px] font-semibold text-destructive">
            {progress.error}
          </div>
        )}
        {(complete || failed) && (
          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              variant={failed ? "outline" : "action"}
              size="compact"
              onClick={onClose}
            >
              Done
            </Button>
          </div>
        )}
      </AppModalPanel>
    </AppModal>
  )
}

export function CollectionDetailView({
  collection,
  readonly,
  onBack,
  onAddImages,
  onRemoveImages,
  onUpdateCollection,
  onRename,
  onCreateAutomation,
}: {
  collection: CreatedImageCollection
  readonly?: boolean
  onBack: () => void
  onAddImages: (images: PinterestSearchResult[]) => void
  onRemoveImages: (keys: string[]) => void
  onUpdateCollection: (collection: CreatedImageCollection) => void
  onRename: (title: string) => void
  onCreateAutomation: (name: string) => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(collection.title)
  const [columns, setColumns] = useState(5)
  const [visibleRows, setVisibleRows] = useState(INITIAL_VISIBLE_ROWS)
  const [showDescriptions, setShowDescriptions] = useState(false)
  const [noCollectionsOnly, setNoCollectionsOnly] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({})
  const [captioning, setCaptioning] = useState(false)
  const [captionProgress, setCaptionProgress] =
    useState<CaptionProgressState | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedImageKeys, setSelectedImageKeys] = useState<string[]>([])
  const visibleImageCount = visibleRows * columns
  const visibleImages = collection.images.slice(0, visibleImageCount)
  const visibleImageKeys = visibleImages.map(imageKey)
  const hasMoreImages = visibleImages.length < collection.images.length
  const selectedCount = selectedImageKeys.length
  const selectedVisibleCount = visibleImageKeys.filter((key) =>
    selectedImageKeys.includes(key)
  ).length

  useEffect(() => {
    const reset = window.setTimeout(() => {
      setVisibleRows(INITIAL_VISIBLE_ROWS)
      setViewerIndex(null)
      setSelectedImageKeys([])
    }, 0)
    return () => window.clearTimeout(reset)
  }, [collection.id])

  function saveTitle() {
    const nextTitle = titleDraft.trim()
    if (nextTitle && nextTitle !== collection.title) {
      onRename(nextTitle)
    }
    setEditingTitle(false)
  }

  function imageKey(image: PinterestSearchResult) {
    return image.id || image.imageUrl
  }

  function captionFor(image: PinterestSearchResult) {
    return captionEdits[imageKey(image)] ?? image.description ?? ""
  }

  async function captionImages() {
    if (readonly || captioning) {
      return
    }

    if (collection.images.length === 0) {
      return
    }

    let workingCollection: CreatedImageCollection = {
      ...collection,
      images: collection.images.map((image) => ({
        ...image,
        description: captionFor(image),
      })),
    }

    setCaptioning(true)
    setCaptionEdits({})
    setCaptionProgress({
      total: workingCollection.images.length,
      completed: 0,
      status: "running",
      currentTitle: workingCollection.images[0]?.title || "Image 1",
    })

    try {
      const payload = await fetchJsonWithTimeout<{
        collection?: StoredImageCollection
      }>("/api/image-collections/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeoutMs: 180_000,
        toastOnError: false,
        body: JSON.stringify(collectionToStored(workingCollection)),
      })
      if (!payload.collection) {
        throw new Error("Failed to caption images")
      }

      workingCollection = {
        ...workingCollection,
        title: payload.collection.name,
        createdAt: payload.collection.created_at,
        images: workingCollection.images.map((image, index) => ({
          ...image,
          description:
            payload.collection!.images[index]?.caption ?? image.description,
        })),
      }
      onUpdateCollection(workingCollection)
      setCaptionProgress({
        total: workingCollection.images.length,
        completed: workingCollection.images.length,
        status: "complete",
        currentTitle:
          workingCollection.images.at(-1)?.title ||
          `Image ${workingCollection.images.length}`,
      })
      toast.success(
        `Generated ${workingCollection.images.length} image captions`
      )
    } catch (captionError) {
      const message = getApiErrorMessage(
        captionError,
        "Failed to caption images"
      )
      setCaptionProgress((current) =>
        current ? { ...current, status: "error", error: message } : null
      )
      toast.error(message)
    } finally {
      setCaptioning(false)
    }
  }

  function toggleImageSelection(key: string) {
    setSelectedImageKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    )
  }

  function deleteSelectedImages() {
    if (readonly || selectedImageKeys.length === 0) {
      return
    }
    onRemoveImages(selectedImageKeys)
    setSelectedImageKeys([])
  }

  function importFiles(fileList: FileList | null) {
    if (!fileList || readonly) {
      return
    }

    const uploadedImages = Array.from(fileList)
      .filter((file) => file.type.startsWith("image/"))
      .map((file, index): PinterestSearchResult => ({
        id: `upload-${Date.now()}-${index}`,
        title: file.name.replace(/\.[^.]+$/, ""),
        description: "",
        imageUrl: URL.createObjectURL(file),
        sourceUrl: "",
        dominantColor: "#d9d8d0",
      }))

    if (uploadedImages.length > 0) {
      onAddImages(uploadedImages)
    }
  }

  return (
    <div className="mx-auto max-w-[1120px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="iconControl"
            size="icon-control"
            onClick={onBack}
            aria-label="Back to collections"
          >
            <IconChevronLeft className="size-5" />
          </Button>
          {editingTitle ? (
            <input
              className="h-8 min-w-[280px] rounded-[6px] border border-[#d9d8d0] bg-app-surface px-2 text-[22px] font-semibold outline-none"
              value={titleDraft}
              autoFocus
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  saveTitle()
                }
                if (event.key === "Escape") {
                  setTitleDraft(collection.title)
                  setEditingTitle(false)
                }
              }}
            />
          ) : (
            <h1 className="truncate text-[22px] font-semibold">
              {collection.title}
            </h1>
          )}
          {!readonly && editingTitle && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={saveTitle}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  setTitleDraft(collection.title)
                  setEditingTitle(false)
                }}
              >
                Cancel
              </Button>
            </div>
          )}
          {!readonly && !editingTitle && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setTitleDraft(collection.title)
                setEditingTitle(true)
              }}
            >
              Edit
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="softControl"
            size="compact"
            disabled={readonly || captioning || collection.images.length === 0}
            onClick={() => void captionImages()}
          >
            <IconPhotoPlus className="size-4" />
            {captioning ? "Captioning..." : "Get image captions"}
          </Button>
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button variant="softControl" size="compact">
                <IconList className="size-4" />
                View
              </Button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                sideOffset={8}
                align="end"
                className="z-50 w-[210px] rounded-[8px] bg-app-surface p-3 text-[13px] font-semibold shadow-xl outline-none"
              >
                <label className="flex items-center justify-between gap-3">
                  Columns:
                  <SelectControl
                    value={columns}
                    onChange={(event) => setColumns(Number(event.target.value))}
                  >
                    {[3, 4, 5, 6].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </SelectControl>
                </label>
                <div className="mt-3 border-t border-app-panel-border pt-3">
                  <ToggleRow
                    label="No collections only"
                    enabled={noCollectionsOnly}
                    onToggle={() => setNoCollectionsOnly((current) => !current)}
                  />
                  <ToggleRow
                    label="Show descriptions"
                    enabled={showDescriptions}
                    onToggle={() => setShowDescriptions((current) => !current)}
                  />
                </div>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {!readonly && (
            <Button
              variant="action"
              size="compact"
              onClick={() => setSearchOpen(true)}
            >
              <IconPlus className="size-4" />
              Add
            </Button>
          )}
        </div>
      </div>

      {!readonly && (
        <UploadDropzone
          inputRef={fileInputRef}
          accept="image/*"
          multiple
          className="mb-6 min-h-[150px]"
          onFiles={importFiles}
        >
          <span>
            <IconUpload className="mx-auto mb-2 size-5 text-app-muted-text" />
            <span className="block text-[15px] font-semibold">
              Drag and drop (or click to upload)
            </span>
            <span className="mt-2 block text-[12px] text-[#8b8a83]">
              Upload your images (PNG, JPEG up to 10MB each)
            </span>
          </span>
        </UploadDropzone>
      )}

      {collection.images.length === 0 ? (
        <div className="app-empty-state grid min-h-[260px] place-items-center text-center text-[13px]">
          <span>
            No {collection.mediaType === "video" ? "videos" : "images"} yet.
          </span>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="softControl"
                size="compact"
                onClick={() =>
                  setSelectedImageKeys((current) =>
                    Array.from(new Set([...current, ...visibleImageKeys]))
                  )
                }
              >
                Select loaded
              </Button>
              <Button
                variant="softControl"
                size="compact"
                onClick={() =>
                  setSelectedImageKeys(collection.images.map(imageKey))
                }
              >
                Select all ({collection.images.length})
              </Button>
              {selectedCount > 0 && (
                <Button
                  variant="softControl"
                  size="compact"
                  onClick={() => setSelectedImageKeys([])}
                >
                  Clear
                </Button>
              )}
            </div>
            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[8px] bg-app-surface px-3 py-2 text-[13px] font-semibold text-app-text-soft shadow-sm">
                  {selectedCount} selected
                  {selectedVisibleCount > 0 ? ` loaded` : ""}
                </span>
                {!readonly && (
                  <Button
                    variant="destructive"
                    size="compact"
                    onClick={deleteSelectedImages}
                  >
                    <IconTrash className="size-4" />
                    Delete
                  </Button>
                )}
              </div>
            )}
          </div>

          <div
            className="grid gap-x-4 gap-y-6"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {visibleImages.map((image, index) => {
              const key = imageKey(image)
              const selected = selectedImageKeys.includes(key)
              return (
                <MediaCardShell
                  key={`${key}-${index}`}
                  className={cn(
                    "relative p-2 transition",
                    selected
                      ? "border-app-action ring-2 ring-app-action/20"
                      : "border-app-panel-border"
                  )}
                >
                  <input
                    className="absolute top-3 left-3 z-10 size-4 accent-app-action"
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleImageSelection(key)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select ${image.title}`}
                  />
                  <button
                    className="block w-full text-left"
                    onClick={() => setViewerIndex(index)}
                  >
                    <PinterestPreviewTile
                      image={image}
                      index={index}
                      fit="contain"
                      className="aspect-square w-full rounded-[3px] bg-app-surface"
                    />
                    {showDescriptions && (
                      <div className="mt-2 line-clamp-3 min-h-12 text-[11px] leading-4 text-[#647084]">
                        {captionFor(image) || "No description"}
                      </div>
                    )}
                    {image.lastUsedAt ? (
                      <div className="mt-2 text-[10px] font-semibold tracking-[0.04em] text-app-text-faint uppercase">
                        Last used {formatCollectionImageDate(image.lastUsedAt)}
                      </div>
                    ) : null}
                  </button>
                </MediaCardShell>
              )
            })}
          </div>
          {hasMoreImages && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="softControl"
                size="appDefault"
                onClick={() =>
                  setVisibleRows((current) => current + LOAD_MORE_ROWS)
                }
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      {searchOpen && (
        <PinterestCollectionSearch
          onCancel={() => setSearchOpen(false)}
          onCreateCollection={(nextCollection) => {
            onAddImages(nextCollection.images)
            setSearchOpen(false)
          }}
        />
      )}
      {captionProgress && (
        <CaptionProgressModal
          progress={captionProgress}
          onClose={() => {
            if (!captioning) {
              setCaptionProgress(null)
            }
          }}
        />
      )}
      {editorOpen && (
        <CollectionAutomationEditor
          collection={collection}
          onClose={() => setEditorOpen(false)}
          onCreateAutomation={onCreateAutomation}
        />
      )}
      {viewerIndex !== null && visibleImages[viewerIndex] && (
        <ImageViewerModal
          image={visibleImages[viewerIndex]}
          caption={captionFor(visibleImages[viewerIndex])}
          index={viewerIndex}
          total={visibleImages.length}
          onCaptionChange={(caption) => {
            const image = visibleImages[viewerIndex]
            setCaptionEdits((current) => ({
              ...current,
              [imageKey(image)]: caption,
            }))
            onUpdateCollection({
              ...collection,
              images: collection.images.map((item) =>
                imageKey(item) === imageKey(image)
                  ? { ...item, description: caption }
                  : item
              ),
            })
          }}
          onImageReplace={(imageUrl) => {
            const image = visibleImages[viewerIndex]
            onUpdateCollection({
              ...collection,
              images: collection.images.map((item) =>
                imageKey(item) === imageKey(image)
                  ? { ...item, imageUrl }
                  : item
              ),
            })
          }}
          onPrevious={() =>
            setViewerIndex((current) =>
              current === null ? 0 : Math.max(0, current - 1)
            )
          }
          onNext={() =>
            setViewerIndex((current) =>
              current === null
                ? 0
                : Math.min(visibleImages.length - 1, current + 1)
            )
          }
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}

function formatCollectionImageDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return "recently"
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

function CollectionAutomationEditor({
  collection,
  onClose,
  onCreateAutomation,
}: {
  collection: CreatedImageCollection
  onClose: () => void
  onCreateAutomation: (name: string) => void
}) {
  const [wordRange, setWordRange] = useState("3-5 words")
  const [displayText, setDisplayText] = useState(true)
  const [ctaEnabled, setCtaEnabled] = useState(false)
  const [activeTab, setActiveTab] = useState<"Hook" | "Content" | "CTA">(
    "Content"
  )
  const [createOpen, setCreateOpen] = useState(false)
  const previewImages = collection.images.slice(0, 4)

  return (
    <AppModal className="z-40 bg-[#24251f]/48" onClose={onClose}>
      <AppModalPanel
        accessibleTitle="Automation editor"
        className="relative grid max-w-[760px] rounded-[10px] bg-[#d0d0cc] md:grid-cols-[255px_1fr]"
      >
        <div className="flex min-h-[520px] flex-col bg-app-surface p-4">
          <div className="mb-5 flex items-center justify-between text-[13px]">
            <Button
              type="button"
              variant="ghost"
              size="compact"
              className="justify-start"
              onClick={onClose}
            >
              <IconChevronLeft className="size-4" />
              Back
            </Button>
            <div className="flex gap-2 text-[#8c8b84]">
              <IconList className="size-4" />
              <IconLayoutDashboard className="size-4" />
            </div>
          </div>
          <div className="mb-4 grid grid-cols-3 border-b text-center text-[11px] font-semibold text-app-text-faint">
            {(["Hook", "Content", "CTA"] as const).map((tab) => (
              <button
                key={tab}
                className={cn(
                  "pb-3",
                  activeTab === tab &&
                    "border-b-2 border-app-strong text-app-text"
                )}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          {activeTab === "CTA" ? (
            <div className="mt-5 flex items-center justify-between text-[14px] font-semibold">
              Enable CTA
              <SwitchPillButton
                enabled={ctaEnabled}
                onClick={() => setCtaEnabled((value) => !value)}
                aria-label="Enable CTA"
              />
            </div>
          ) : (
            <>
              <ControlRow label={activeTab} value={collection.title} image />
              {activeTab === "Content" && (
                <ControlRow label="Slide count" value="Static     4" />
              )}
              <ControlRow
                label="Aspect Ratio"
                value={activeTab === "Hook" ? "9:16" : "3:2"}
              />
              <ControlRow label="Image Grid" value="None" />
              <ControlToggle label="Overlay" enabled={false} />
              {activeTab === "Content" && (
                <ControlToggle label="Overlay Image" enabled={false} />
              )}
              <ControlToggle
                label="Display text"
                enabled={displayText}
                onClick={() => setDisplayText((value) => !value)}
              />
              <div className="mt-6 text-[12px] font-semibold text-app-muted-text">
                Advanced
              </div>
              {activeTab === "Content" && (
                <div className="mt-6 text-[12px]">
                  <div className="mb-1 font-semibold text-[#6b6a64]">
                    Image overrides{" "}
                    <span className="float-right text-app-action">+ Add</span>
                  </div>
                  <p className="leading-4 text-app-text-faint">
                    Override the image collection for a specific slide.
                  </p>
                </div>
              )}
            </>
          )}
          <Button
            type="button"
            variant="action"
            size="appDefault"
            className="mt-auto w-full"
            onClick={() => {
              if (activeTab === "CTA") {
                onClose()
              } else {
                setCreateOpen(true)
              }
            }}
          >
            {activeTab === "CTA" ? "Save Changes" : "Create automation"}
          </Button>
        </div>

        <div className="min-h-[520px] p-6">
          <div
            className={cn(
              "mx-auto grid max-w-[390px] gap-3",
              activeTab === "Hook" ? "grid-cols-[1fr_120px]" : "grid-cols-3"
            )}
          >
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className={cn(
                  activeTab === "Hook" && index > 0 && "opacity-80"
                )}
              >
                <div className="mb-2 text-center text-[11px] font-semibold text-[#6c6b66]">
                  {index === 0 ? activeTab : `Content ${index}`}
                </div>
                {previewImages[index] ? (
                  <div className="relative">
                    <PinterestPreviewTile
                      image={previewImages[index]}
                      index={index}
                      className={cn(
                        "w-full rounded-[3px] shadow-sm",
                        activeTab === "Hook" && index === 0 ? "h-72" : "h-44"
                      )}
                    />
                    {displayText && (
                      <div className="absolute inset-x-3 top-[44%] rounded border border-[#4f91ff] bg-black/35 px-2 py-1 text-center font-tiktok text-[10px] leading-tight font-bold text-white">
                        {index === 0
                          ? "uncomfortable things to build extreme confidence"
                          : "Et dolore magna"}
                      </div>
                    )}
                  </div>
                ) : (
                  <SlideThumb
                    index={index + 6}
                    className={cn(
                      "w-full rounded-[3px]",
                      activeTab === "Hook" && index === 0 ? "h-72" : "h-44"
                    )}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="mx-auto mt-5 flex w-fit gap-1">
            {[0, 1, 2, 3, 4].map((dot) => (
              <span
                key={dot}
                className={cn(
                  "size-1.5 rounded-full",
                  dot === 0 ? "bg-app-surface" : "bg-white/45"
                )}
              />
            ))}
          </div>
          <div className="mt-5 rounded-[8px] bg-app-surface p-4">
            <div className="grid grid-cols-3 gap-3">
              <LabelledSelect
                label={activeTab === "Hook" ? "Font" : "Content direction"}
                value={activeTab === "Hook" ? "Default" : wordRange}
                options={[
                  "Default",
                  "1-2 words",
                  "2-3 words",
                  "3-5 words",
                  "5-7 words",
                  "10-15 words",
                ]}
                onChange={setWordRange}
              />
              <LabelledSelect
                label="Style"
                value="Outline"
                options={["Outline", "Bold", "Plain"]}
              />
              <LabelledSelect
                label="Size"
                value={activeTab === "Hook" ? "14px" : "12px"}
                options={["12px", "14px", "16px"]}
              />
              <LabelledSelect
                label="Position"
                value="Center"
                options={["Center", "Bottom", "Top"]}
              />
              <LabelledSelect
                label="Width"
                value="100%"
                options={["50%", "75%", "100%"]}
              />
            </div>
            <input
              className="mt-4 h-10 w-full rounded-[6px] border border-app-panel-border px-3 text-[12px] outline-none"
              placeholder="e.g. A bold hook about..."
            />
            <div className="mt-4 flex items-center justify-between text-[12px]">
              <Button type="button" variant="ghost" size="xs">
                Advanced ^
              </Button>
              <div className="flex gap-4">
                <Button type="button" variant="ghost" size="xs">
                  + Add text
                </Button>
              </div>
            </div>
          </div>
        </div>
      </AppModalPanel>
      {createOpen && (
        <CreateAutomationDialog
          defaultName="Custom Automation"
          onCancel={() => setCreateOpen(false)}
          onCreate={(name) => {
            setCreateOpen(false)
            onCreateAutomation(name)
          }}
        />
      )}
    </AppModal>
  )
}

function CreateAutomationDialog({
  defaultName,
  onCancel,
  onCreate,
}: {
  defaultName: string
  onCancel: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)

  return (
    <AppModal layer="absolute" className="z-50" onClose={onCancel}>
      <AppModalPanel className="max-w-[430px] rounded-[8px] shadow-2xl">
        <AppModalHeader
          title="Create Automation"
          description="Name your automation, add hooks, and set the tone & style."
          onClose={onCancel}
        />
        <div className="p-5">
          <label className="mt-5 block text-[12px] font-semibold">
            Automation name
            <input
              className="mt-2 h-10 w-full rounded-[7px] border border-app-panel-border px-3 text-[13px] outline-none"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="mt-4 flex border-b text-[12px] font-semibold">
            <button className="border-b-2 border-app-strong pr-6 pb-2">
              Hooks (1)
            </button>
            <button className="pb-2 text-[#8b8a83]">Tone & Style</button>
          </div>
          <div className="mt-4 text-[14px] font-semibold">
            Slideshow Hooks <span className="text-app-text-faint">⊙</span>
          </div>
          <div className="mt-1 text-[12px] font-semibold text-app-action">
            Each line is a separate hook
          </div>
          <textarea
            className="mt-3 h-28 w-full resize-none rounded-[8px] border border-app-panel-border p-3 text-[13px] outline-none"
            defaultValue="uncomfortable things to build extreme confidence"
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="softControl" size="appDefault" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="action"
              size="appDefault"
              onClick={() => onCreate(name.trim() || defaultName)}
            >
              Create
            </Button>
          </div>
        </div>
      </AppModalPanel>
    </AppModal>
  )
}
