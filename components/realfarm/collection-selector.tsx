"use client"

import { useMemo, useState } from "react"
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
  onChange,
  onCreateCollection,
}: {
  label: string
  collection?: CreatedImageCollection
  collections: CreatedImageCollection[]
  onChange: (collectionId: string) => void
  onCreateCollection: (collection: CreatedImageCollection) => void
}) {
  const [open, setOpen] = useState(false)
  const [showPinterestSearch, setShowPinterestSearch] = useState(false)
  const selectableCollections = useMemo(
    () => collections.filter((item) => !item.virtual && item.images.length > 0),
    [collections]
  )
  const previewImages = collection?.images.slice(0, collection.images.length === 1 ? 1 : 3) ?? []

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
        className="mb-4 w-full cursor-pointer rounded-xl border border-[#eee] bg-white px-3 py-3 text-left text-[14px] font-medium text-[#333] shadow-sm transition-colors hover:opacity-[65%]"
        onClick={() => setOpen(true)}
      >
        <div className="flex w-full items-center justify-between gap-3">
          <span className="flex min-w-0 items-center text-[13px] font-bold text-[#333]">
            {label}
            <ChevronRight className="ml-1 size-4 shrink-0 stroke-[3]" />
          </span>
          <span className="max-w-[140px] truncate text-[12px] font-normal text-[#666]">
            {collection?.title ?? "Select collection"}
          </span>
        </div>
        <div className="mt-2 flex justify-center gap-1 overflow-hidden rounded-md">
          {previewImages.length > 0 ? (
            previewImages.map((image, index) => (
              <div key={`${image.id}-${index}`} className="aspect-[2/3] w-1/3 max-w-[96px] overflow-hidden rounded-md bg-gray-200">
                <PinterestPreviewTile image={image} index={index} className="h-full rounded-none" />
              </div>
            ))
          ) : (
            <div className="grid aspect-[2/3] w-1/3 max-w-[96px] place-items-center rounded-md bg-gray-200 text-[#8c8b84]">
              <Images className="size-5" />
            </div>
          )}
        </div>
      </button>

      {open && (
        <AppModal className="bg-[#24251f]/45" onClose={() => setOpen(false)}>
          <AppModalPanel className="flex h-[min(680px,86vh)] w-[min(760px,calc(100vw-40px))] flex-col rounded-[12px]">
            <div className="flex items-center gap-3 border-b border-[#ecebe4] px-4 py-3">
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full text-[#77766f] hover:bg-[#f1f0eb] hover:text-[#242421]"
                onClick={() => setOpen(false)}
                aria-label="Close collection selector"
              >
                <X className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <h2 className="text-[18px] font-bold text-[#242421]">Select collection</h2>
                <p className="text-[12px] font-medium text-[#77766f]">Choose a collection for this slideshow section.</p>
              </div>
              <Button type="button" variant="action" size="appDefault" onClick={() => setShowPinterestSearch(true)}>
                <Plus className="size-4" />
                Add collection
              </Button>
            </div>
            <CollectionSelectorBody
              collections={selectableCollections}
              selectedCollectionId={collection?.id ?? ""}
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
  onSelect,
}: {
  collections: CreatedImageCollection[]
  selectedCollectionId: string
  onSelect: (collectionId: string) => void
}) {
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLowerCase()
  const filteredCollections = collections.filter((collection) =>
    !normalizedQuery || collection.title.toLowerCase().includes(normalizedQuery)
  )

  return (
    <>
      <div className="border-b border-[#ecebe4] px-4 py-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8c8b84]" />
          <input
            className="h-10 w-full rounded-[8px] border border-[#e4e3dc] bg-white pl-10 pr-3 text-[14px] font-medium outline-none placeholder:text-[#aaa9a2] focus:border-[#b8b7ae]"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search collections"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {filteredCollections.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filteredCollections.map((collection, index) => (
              <CollectionOption
                key={collection.id}
                collection={collection}
                index={index}
                selected={collection.id === selectedCollectionId}
                onClick={() => onSelect(collection.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid h-full min-h-[300px] place-items-center text-center">
            <div>
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-[#f1f0eb] text-[#77766f]">
                <Images className="size-5" />
              </div>
              <div className="mt-3 text-[15px] font-bold text-[#242421]">No collections found</div>
              <div className="mt-1 text-[13px] font-medium text-[#77766f]">Add a collection or try another search.</div>
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
  onClick,
}: {
  collection: CreatedImageCollection
  index: number
  selected: boolean
  onClick: () => void
}) {
  const coverImage = collection.images[0]

  return (
    <button
      type="button"
      className={cn(
        "group text-left outline-none",
        selected && "text-app-action"
      )}
      onClick={onClick}
    >
      <div className={cn("relative aspect-square overflow-hidden rounded-[8px] bg-[#d9d8d0] ring-offset-2", selected ? "ring-2 ring-app-action" : "ring-1 ring-[#e2e1da]")}>
        {coverImage ? (
          <PinterestPreviewTile image={coverImage} index={index} className="h-full rounded-none transition duration-200 group-hover:scale-[1.02]" />
        ) : (
          <div className="grid h-full place-items-center text-[#8c8b84]">
            <Images className="size-6" />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 translate-y-full bg-black/70 px-2 py-2 text-[11px] font-semibold leading-tight text-white transition group-hover:translate-y-0">
          {collection.title}
        </div>
      </div>
      <div className="mt-2 min-w-0">
        <div className="truncate text-[13px] font-bold text-[#242421]">{collection.title}</div>
        <div className="text-[11px] font-medium text-[#77766f]">{collection.images.length} images</div>
      </div>
    </button>
  )
}
