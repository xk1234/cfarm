"use client"

import { useMemo, useState } from "react"
import { IconPhoto, IconVideo } from "@tabler/icons-react"
import { ChevronRight, Images, Plus, Search, X } from "lucide-react"

import { PinterestCollectionSearch } from "@/components/realfarm/pinterest-collection-search"
import { PinterestPreviewTile } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import { cn } from "@/lib/utils"

export function CollectionSelector({
  label,
  collection,
  collections,
  showPictures = true,
  onChange,
  onCreateCollection,
}: {
  label: string
  collection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  showPictures?: boolean
  onChange: (collectionId: string) => void
  onCreateCollection: (collection: CreatedImageCollection) => void
}) {
  const [open, setOpen] = useState(false)
  const [showPinterestSearch, setShowPinterestSearch] = useState(false)
  const selectableCollections = useMemo(
    () =>
      collections.filter(
        (item) =>
          (!item.virtual || item.mediaType === "video") &&
          item.images.length > 0
      ),
    [collections]
  )
  const previewImages =
    collection?.images.slice(0, collection.images.length === 1 ? 1 : 3) ?? []

  function selectCollection(collectionId: string) {
    onChange(collectionId)
    setOpen(false)
  }

  function createAndSelectCollection(nextCollection: CreatedImageCollection) {
    onCreateCollection(nextCollection)
    onChange(nextCollection.id)
    setShowPinterestSearch(false)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className="mb-4 w-full cursor-pointer rounded-xl border border-[#eee] bg-app-surface px-3 py-3 text-left text-[14px] font-medium text-app-text shadow-sm transition-colors hover:opacity-[65%]"
        onClick={() => setOpen(true)}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex min-w-0 items-center text-[13px] font-bold text-app-text">
            {label}
            <ChevronRight className="ml-1 size-4 shrink-0 stroke-[3]" />
          </span>
          <span className="max-w-[140px] truncate text-[12px] font-normal text-[#666]">
            {collection?.title ?? "Select collection"}
          </span>
        </div>
        {showPictures ? (
          <div className="mt-2 flex justify-center gap-1 overflow-hidden rounded-md">
            {previewImages.length > 0 ? (
              previewImages.map((image, index) => (
                <div
                  key={`${image.id}-${index}`}
                  className="aspect-[2/3] w-1/3 max-w-[96px] overflow-hidden rounded-md bg-gray-200"
                >
                  <PinterestPreviewTile
                    image={image}
                    index={index}
                    className="h-full rounded-none"
                  />
                </div>
              ))
            ) : (
              <div className="grid aspect-[2/3] w-1/3 max-w-[96px] place-items-center rounded-md bg-gray-200 text-[#8c8b84]">
                <Images className="size-5" />
              </div>
            )}
          </div>
        ) : null}
      </button>

      {open && (
        <AppModal className="bg-[#24251f]/45" onClose={() => setOpen(false)}>
          <AppModalPanel
            accessibleTitle="Select collection"
            className="flex h-[min(680px,86vh)] w-[min(760px,calc(100vw-40px))] flex-col rounded-[12px]"
          >
            <div className="flex items-center gap-3 border-b border-app-panel-border px-4 py-3">
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full text-app-muted-text hover:bg-app-surface-subtle hover:text-app-text"
                onClick={() => setOpen(false)}
                aria-label="Close collection selector"
              >
                <X className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="text-[18px] font-bold text-app-text">
                  Select collection
                </h2>
                <p className="text-[12px] font-medium text-app-muted-text">
                  Choose a collection for this slideshow section.
                </p>
              </div>
              <Button
                type="button"
                variant="action"
                size="appDefault"
                onClick={() => setShowPinterestSearch(true)}
              >
                <Plus className="size-4" />
                Add collection
              </Button>
            </div>
            <CollectionSelectorBody
              collections={selectableCollections}
              selectedCollectionId={collection?.id ?? ""}
              showPictures={showPictures}
              onSelect={selectCollection}
            />
          </AppModalPanel>
        </AppModal>
      )}

      {showPinterestSearch && (
        <PinterestCollectionSearch
          onCancel={() => setShowPinterestSearch(false)}
          onCreateCollection={createAndSelectCollection}
        />
      )}
    </>
  )
}

function CollectionSelectorBody({
  collections,
  selectedCollectionId,
  showPictures,
  onSelect,
}: {
  collections: CreatedImageCollection[]
  selectedCollectionId: string
  showPictures: boolean
  onSelect: (collectionId: string) => void
}) {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const filteredCollections = collections.filter(
    (collection) =>
      !normalizedQuery ||
      collection.title.toLowerCase().includes(normalizedQuery)
  )

  return (
    <>
      <div className="border-b border-app-panel-border px-4 py-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8c8b84]" />
          <input
            className="h-10 w-full rounded-[8px] border border-[#e4e3dc] bg-app-surface pr-3 pl-10 text-[14px] font-medium outline-none placeholder:text-app-text-faint focus:border-[#b8b7ae]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search collections"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {filteredCollections.length > 0 ? (
          <div
            className={cn(
              showPictures
                ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
                : "space-y-2"
            )}
          >
            {filteredCollections.map((collection, index) => (
              <CollectionOption
                key={collection.id}
                collection={collection}
                index={index}
                selected={collection.id === selectedCollectionId}
                showPictures={showPictures}
                onClick={() => onSelect(collection.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid h-full min-h-[300px] place-items-center text-center">
            <div>
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-app-surface-subtle text-app-muted-text">
                <Images className="size-5" />
              </div>
              <div className="mt-3 text-[15px] font-bold text-app-text">
                No collections found
              </div>
              <div className="mt-1 text-[13px] font-medium text-app-muted-text">
                Add a collection or try another search.
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function CollectionOption({
  collection,
  index,
  selected,
  showPictures,
  onClick,
}: {
  collection: CreatedImageCollection
  index: number
  selected: boolean
  showPictures: boolean
  onClick: () => void
}) {
  const coverImage = collection.images[0]

  if (!showPictures) {
    return (
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-3 rounded-[8px] border bg-app-surface px-3 py-3 text-left shadow-sm transition outline-none hover:bg-app-surface-subtle",
          selected
            ? "border-app-action text-app-action ring-1 ring-app-action"
            : "border-[#e2e1da] text-app-text"
        )}
        onClick={onClick}
      >
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold">
            {collection.title}
          </span>
          <span className="mt-0.5 block text-[11px] font-medium text-app-muted-text">
            {collection.images.length} {collectionMediaLabel(collection)}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-app-text-faint" />
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        "group text-left outline-none",
        selected && "text-app-action"
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-[8px] bg-[#d9d8d0] ring-offset-2",
          selected ? "ring-2 ring-app-action" : "ring-1 ring-[#e2e1da]"
        )}
      >
        {coverImage ? (
          <PinterestPreviewTile
            image={coverImage}
            index={index}
            className="h-full rounded-none transition duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="grid h-full place-items-center text-[#8c8b84]">
            <Images className="size-6" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-2 py-2 text-[11px] leading-tight font-semibold text-white transition group-hover:translate-y-0">
          {collection.title}
        </div>
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate text-[13px] font-bold text-app-text">
          {collection.title}
        </div>
        <div className="text-[11px] font-medium text-app-muted-text">
          <span className="inline-flex items-center gap-1">
            {collection.mediaType === "video" ? (
              <IconVideo className="size-3.5" />
            ) : (
              <IconPhoto className="size-3.5" />
            )}
            {collection.images.length} {collectionMediaLabel(collection)}
          </span>
        </div>
      </div>
    </button>
  )
}

function collectionMediaLabel(collection: CreatedImageCollection) {
  return collection.mediaType === "video" ? "videos" : "images"
}
