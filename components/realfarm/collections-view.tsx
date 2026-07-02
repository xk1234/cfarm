"use client"

import { useState } from "react"
import type * as React from "react"
import { IconChevronLeft, IconChevronRight, IconLayoutDashboard, IconList, IconPhotoPlus, IconPlus, IconSearch, IconTrash, IconUpload, IconX } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { LabelledSelect, ToggleRow } from "@/components/ui/form-controls"
import { CollectionPreview, ControlRow, ControlToggle, PinterestPreviewTile, SlideThumb } from "@/components/realfarm/shared-media"
import { PinterestCollectionSearch } from "@/components/realfarm/pinterest-collection-search"
import {
  collectionToStored,
  defaultImageCollections,
  storedToCollection,
  type CreatedImageCollection,
  type PinterestCollectionCreatePayload,
  type StoredImageCollection,
} from "@/lib/realfarm-collections"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"

export function CollectionsView({
  collections,
  onCreateCollection,
  onDeleteCollections,
  onOpenCollection,
}: {
  collections: CreatedImageCollection[]
  onCreateCollection: (collection: CreatedImageCollection) => void
  onDeleteCollections: (ids: string[]) => void
  onOpenCollection: (id: string) => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set())
  const selectedIds = Array.from(selectedCollectionIds)

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

  return (
    <div className="mx-auto max-w-[1540px]">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-[34px] font-bold">
          My Image Collections
          <span className="group relative grid size-8 place-items-center rounded-full border border-[#aeb5c0] text-[22px] font-semibold text-[#7b8492]">
            ?
            <span className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-[280px] -translate-x-1/2 rounded-[8px] bg-[#2f2f2d] px-3 py-2 text-left text-[12px] font-medium leading-5 text-white shadow-lg group-hover:block">
              Image collections allow you organize images so you can generate slideshows with a specific aesthetic or mood.
            </span>
          </span>
        </h1>
        {selectedIds.length > 0 ? (
          <div className="flex items-center gap-4">
            <button className="h-11 rounded-[12px] px-4 text-[17px] font-bold text-[#8c8b84] hover:text-[#242421]" onClick={() => setSelectedCollectionIds(new Set())}>
              Clear
            </button>
            <Button className="h-11 rounded-[12px] bg-[#e82929] px-5 text-[16px] font-bold text-white hover:bg-[#d72121]" onClick={() => deleteCollections(selectedIds)}>
              <IconTrash className="mr-2 size-5" />
              Delete {selectedIds.length} {selectedIds.length === 1 ? "Collection" : "Collections"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              className="h-12 rounded-[14px] bg-white px-7 text-[19px] font-bold text-[#242421] shadow-sm ring-1 ring-[#deddd5] hover:bg-white"
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
              Create empty collection
            </button>
            <Button variant="action" size="largeAction" className="rounded-[14px] px-7 text-[20px] font-bold" onClick={() => setSearchOpen(true)}>
              <IconPlus className="size-7" />
              Add
            </Button>
          </div>
        )}
      </div>
      {collections.length === 0 ? (
        <button
          className="grid min-h-[470px] w-full place-items-center rounded-[12px] border border-dashed border-[#d3d1c8] bg-[#efefea] text-center"
          onClick={() => setSearchOpen(true)}
        >
          <span className="max-w-[360px]">
            <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-white text-[#e46954] shadow-sm">
              <IconPhotoPlus className="size-6" />
            </span>
            <span className="block text-[18px] font-semibold">No image collections yet</span>
            <span className="mt-2 block text-[13px] leading-5 text-[#77766f]">
              Search Pinterest, choose the first batch of images, then create your first collection.
            </span>
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,170px)] gap-5">
          {collections.map((collection, index) => (
            <article key={collection.id} className="group relative w-[170px] overflow-hidden rounded-[8px] bg-white text-left shadow-sm ring-1 ring-[#e4e3dc]">
              {!collection.virtual && (
                <>
                  <button
                    className={cn(
                      "absolute left-2 top-2 z-10 grid size-6 place-items-center rounded-[5px] border border-[#d7d6cf] bg-white text-[13px] font-bold text-[#ff5626] opacity-0 shadow-sm transition group-hover:opacity-100",
                      selectedCollectionIds.has(collection.id) && "opacity-100"
                    )}
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleCollection(collection.id)
                    }}
                    aria-label={`Select ${collection.title}`}
                  >
                    {selectedCollectionIds.has(collection.id) ? "✓" : ""}
                  </button>
                  <button
                    className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-[6px] bg-white text-[#e82929] opacity-0 shadow-sm transition group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation()
                      deleteCollections([collection.id])
                    }}
                    aria-label={`Delete ${collection.title}`}
                  >
                    <IconTrash className="size-4" />
                  </button>
                </>
              )}
              <button className="block w-full text-left" onClick={() => onOpenCollection(collection.id)}>
                <CollectionPreview collection={collection} index={index} />
                <div className="bg-white px-4 py-4">
                  <div className="truncate text-[17px] font-bold leading-6">{collection.title}</div>
                  <div className="mt-1 text-[15px] font-medium text-[#7a7f8a]">{collection.images.length} images</div>
                </div>
              </button>
            </article>
          ))}
          <button
            className="grid h-[242px] w-[170px] place-items-center rounded-[8px] bg-[#e5e5e0] text-[#77766f]"
            onClick={() => setSearchOpen(true)}
            aria-label="Add image collection"
          >
            <IconPlus className="size-10" />
          </button>
        </div>
      )}
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
  const [viewOpen, setViewOpen] = useState(false)
  const [columns, setColumns] = useState(5)
  const [imagesPerPage, setImagesPerPage] = useState(48)
  const [showDescriptions, setShowDescriptions] = useState(false)
  const [noCollectionsOnly, setNoCollectionsOnly] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({})
  const [captioning, setCaptioning] = useState(false)
  const [selectedImageKeys, setSelectedImageKeys] = useState<string[]>([])
  const visibleImages = collection.images.slice(0, imagesPerPage)
  const visibleImageKeys = visibleImages.map(imageKey)
  const selectedCount = selectedImageKeys.length
  const selectedOnPageCount = visibleImageKeys.filter((key) => selectedImageKeys.includes(key)).length

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

  async function captionUncaptionedImages() {
    if (readonly || captioning) {
      return
    }

    setCaptioning(true)
    try {
      const response = await fetch("/api/image-collections/captions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(collectionToStored({
          ...collection,
          images: collection.images.map((image) => ({
            ...image,
            description: captionFor(image),
          })),
        })),
      })
      const payload = (await response.json().catch(() => ({}))) as { collection?: StoredImageCollection; error?: string }
      if (!response.ok || !payload.collection) {
        throw new Error(payload.error || "Failed to caption images")
      }
      const captionedCollection = storedToCollection(payload.collection)
      const nextCollection: CreatedImageCollection = {
        ...collection,
        title: captionedCollection.title,
        createdAt: captionedCollection.createdAt,
        images: collection.images.map((image, index) => ({
          ...image,
          description: payload.collection?.images[index]?.caption ?? image.description,
        })),
      }
      setCaptionEdits({})
      onUpdateCollection(nextCollection)
    } finally {
      setCaptioning(false)
    }
  }

  function toggleImageSelection(key: string) {
    setSelectedImageKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
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
          <button className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-[#ecebe4]" onClick={onBack} aria-label="Back to collections">
            <IconChevronLeft className="size-5" />
          </button>
          {editingTitle ? (
            <input
              className="h-8 min-w-[280px] rounded-[6px] border border-[#d9d8d0] bg-white px-2 text-[22px] font-semibold outline-none"
              value={titleDraft}
              autoFocus
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={saveTitle}
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
            <h1 className="truncate text-[22px] font-semibold">{collection.title}</h1>
          )}
          {!readonly && (
            <button
              className="text-[12px] font-semibold text-[#3f81c9]"
              onClick={() => {
                setTitleDraft(collection.title)
                setEditingTitle(true)
              }}
            >
              Edit
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="softControl" size="compact" className="rounded-[7px] text-[12px]" disabled={readonly || captioning} onClick={() => void captionUncaptionedImages()}>
            <IconPhotoPlus className="size-4" />
            {captioning ? "Captioning..." : "Get image captions"}
          </Button>
          <div className="relative">
            <Button variant="softControl" size="compact" className="rounded-[7px] text-[12px] font-semibold" onClick={() => setViewOpen((current) => !current)}>
              <IconList className="size-4" />
              View
            </Button>
            {viewOpen && (
              <div className="absolute right-0 top-10 z-20 w-[210px] rounded-[8px] bg-white p-3 text-[13px] font-semibold shadow-xl">
                <label className="mb-3 flex items-center justify-between gap-3">
                  Columns:
                  <select className="h-9 rounded-[6px] border border-[#deddd5] bg-white px-2 text-[15px] outline-none" value={columns} onChange={(event) => setColumns(Number(event.target.value))}>
                    {[3, 4, 5, 6].map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className="mb-3 flex items-center justify-between gap-3">
                  Images per page:
                  <select className="h-9 rounded-[6px] border border-[#deddd5] bg-white px-2 text-[15px] outline-none" value={imagesPerPage} onChange={(event) => setImagesPerPage(Number(event.target.value))}>
                    {[24, 48, 72, 96].map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <div className="border-t border-[#ecebe4] pt-3">
                  <ToggleRow label="No collections only" enabled={noCollectionsOnly} onToggle={() => setNoCollectionsOnly((current) => !current)} />
                  <ToggleRow label="Show descriptions" enabled={showDescriptions} onToggle={() => setShowDescriptions((current) => !current)} />
                </div>
              </div>
            )}
          </div>
          {!readonly && (
            <Button variant="action" size="compact" className="rounded-[7px] px-4 text-[12px]" onClick={() => setSearchOpen(true)}>
              <IconPlus className="size-4" />
              Add
            </Button>
          )}
        </div>
      </div>

      {!readonly && (
        <label
          className="mb-6 grid min-h-[150px] w-full cursor-pointer place-items-center rounded-[8px] border border-dashed border-[#bebdb4] bg-[#f5f4ef] text-center hover:bg-[#f1f0eb]"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            importFiles(event.dataTransfer.files)
          }}
        >
          <input
            className="hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              importFiles(event.currentTarget.files)
              event.currentTarget.value = ""
            }}
          />
          <span>
            <IconUpload className="mx-auto mb-2 size-5 text-[#77766f]" />
            <span className="block text-[15px] font-semibold">Drag and drop (or click to upload)</span>
            <span className="mt-2 block text-[12px] text-[#8b8a83]">Upload your images (PNG, JPEG up to 10MB each)</span>
          </span>
        </label>
      )}

      {collection.images.length === 0 ? (
        <div className="grid min-h-[260px] place-items-center rounded-[8px] bg-[#efeee9] text-center text-[13px] text-[#77766f]">
          <span>No images yet. Upload images or use Add to search Pinterest.</span>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="h-9 rounded-[8px] bg-white px-4 text-[13px] font-semibold"
                onClick={() => setSelectedImageKeys((current) => Array.from(new Set([...current, ...visibleImageKeys])))}
              >
                Select page
              </Button>
              <Button
                variant="outline"
                className="h-9 rounded-[8px] bg-white px-4 text-[13px] font-semibold"
                onClick={() => setSelectedImageKeys(collection.images.map(imageKey))}
              >
                Select all ({collection.images.length})
              </Button>
              {selectedCount > 0 && (
                <Button
                  variant="outline"
                  className="h-9 rounded-[8px] bg-white px-4 text-[13px] font-semibold"
                  onClick={() => setSelectedImageKeys([])}
                >
                  Clear
                </Button>
              )}
            </div>
            {selectedCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-[8px] bg-white px-3 py-2 text-[13px] font-semibold text-[#55544f] shadow-sm">
                  {selectedCount} selected{selectedOnPageCount > 0 ? ` on this page` : ""}
                </span>
                {!readonly && (
                  <Button
                    className="h-9 rounded-[8px] bg-[#ef4444] px-4 text-[13px] font-semibold text-white hover:bg-[#dc2626]"
                    onClick={deleteSelectedImages}
                  >
                    <IconTrash className="size-4" />
                    Delete
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-x-4 gap-y-6" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {visibleImages.map((image, index) => {
              const key = imageKey(image)
              const selected = selectedImageKeys.includes(key)
              return (
                <article
                  key={`${key}-${index}`}
                  className={cn(
                    "relative rounded-[5px] border bg-white p-2 shadow-sm transition",
                    selected ? "border-[#2f80ed] ring-2 ring-[#2f80ed]/20" : "border-[#e1e0d8]"
                  )}
                >
                  <input
                    className="absolute left-3 top-3 z-10 size-4 accent-[#2f80ed]"
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleImageSelection(key)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select ${image.title}`}
                  />
                  <button className="block w-full text-left" onClick={() => setViewerIndex(index)}>
                    <PinterestPreviewTile image={image} index={index} fit="contain" className="aspect-square w-full rounded-[3px] bg-white" />
                    {showDescriptions && (
                      <div className="mt-2 line-clamp-3 min-h-12 text-[11px] leading-4 text-[#647084]">{captionFor(image) || "No description"}</div>
                    )}
                  </button>
                </article>
              )
            })}
          </div>
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
            setCaptionEdits((current) => ({ ...current, [imageKey(image)]: caption }))
            onUpdateCollection({
              ...collection,
              images: collection.images.map((item) =>
                imageKey(item) === imageKey(image) ? { ...item, description: caption } : item
              ),
            })
          }}
          onPrevious={() => setViewerIndex((current) => current === null ? 0 : Math.max(0, current - 1))}
          onNext={() => setViewerIndex((current) => current === null ? 0 : Math.min(visibleImages.length - 1, current + 1))}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  )
}

function ImageViewerModal({
  image,
  caption,
  index,
  total,
  onCaptionChange,
  onPrevious,
  onNext,
  onClose,
}: {
  image: PinterestSearchResult
  caption: string
  index: number
  total: number
  onCaptionChange: (caption: string) => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/86 text-white">
      <button className="absolute right-8 top-7 z-10 grid size-9 place-items-center rounded-full hover:bg-white/10" onClick={onClose} aria-label="Close image viewer">
        <IconX className="size-8" />
      </button>
      <button
        className="absolute left-8 top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
        onClick={onPrevious}
        disabled={index === 0}
        aria-label="Previous image"
      >
        <IconChevronLeft className="size-10" />
      </button>
      <button
        className="absolute right-8 top-1/2 z-10 grid size-12 -translate-y-1/2 place-items-center rounded-full hover:bg-white/10 disabled:opacity-30"
        onClick={onNext}
        disabled={index === total - 1}
        aria-label="Next image"
      >
        <IconChevronRight className="size-10" />
      </button>
      <div className="flex h-full flex-col items-center justify-center px-20 py-10">
        <div
          className="h-[70vh] w-[72vw] max-w-[980px] bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${image.imageUrl})` }}
          role="img"
          aria-label={image.title}
        />
        <textarea
          className="mt-7 min-h-[58px] w-full max-w-[860px] resize-none bg-transparent text-center text-[18px] font-semibold leading-7 text-white outline-none placeholder:text-white/55"
          value={caption}
          placeholder="Add image caption..."
          onChange={(event) => onCaptionChange(event.target.value)}
        />
        <div className="mt-3 rounded-[3px] bg-black/55 px-6 py-3 text-[20px] font-bold">{index + 1} / {total}</div>
      </div>
    </div>
  )
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
  const [activeTab, setActiveTab] = useState<"Hook" | "Content" | "CTA">("Content")
  const [createOpen, setCreateOpen] = useState(false)
  const previewImages = collection.images.slice(0, 4)

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[#24251f]/48 p-4">
      <section className="relative grid w-full max-w-[760px] overflow-hidden rounded-[10px] bg-[#d0d0cc] shadow-2xl md:grid-cols-[255px_1fr]">
        <div className="flex min-h-[520px] flex-col bg-white p-4">
          <div className="mb-5 flex items-center justify-between text-[13px]">
            <button className="flex items-center gap-2 text-[#686761]" onClick={onClose}>
              <IconChevronLeft className="size-4" />
              Back
            </button>
            <div className="flex gap-2 text-[#8c8b84]">
              <IconList className="size-4" />
              <IconLayoutDashboard className="size-4" />
            </div>
          </div>
          <div className="mb-4 grid grid-cols-3 border-b text-center text-[11px] font-semibold text-[#9a9991]">
            {(["Hook", "Content", "CTA"] as const).map((tab) => (
              <button
                key={tab}
                className={cn("pb-3", activeTab === tab && "border-b-2 border-[#242421] text-[#242421]")}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          {activeTab === "CTA" ? (
            <div className="mt-5 flex items-center justify-between text-[14px] font-semibold">
              Enable CTA
              <button
                className={cn("flex h-7 w-12 items-center rounded-full p-1 transition", ctaEnabled ? "bg-[#3594ff]" : "bg-[#ecece8]")}
                onClick={() => setCtaEnabled((value) => !value)}
                aria-label="Enable CTA"
              >
                <span className={cn("block size-5 rounded-full bg-white shadow-sm transition", ctaEnabled && "translate-x-5")} />
              </button>
            </div>
          ) : (
            <>
              <ControlRow label={activeTab} value={collection.title} image />
              {activeTab === "Content" && <ControlRow label="Slide count" value="Static     4" />}
              <ControlRow label="Aspect Ratio" value={activeTab === "Hook" ? "9:16" : "3:2"} />
              <ControlRow label="Image Grid" value="None" />
              <ControlToggle label="Overlay" enabled={false} />
              {activeTab === "Content" && <ControlToggle label="Overlay Image" enabled={false} />}
              <ControlToggle label="Display text" enabled={displayText} onClick={() => setDisplayText((value) => !value)} />
              <div className="mt-6 text-[12px] font-semibold text-[#77766f]">Advanced</div>
              {activeTab === "Content" && (
                <div className="mt-6 text-[12px]">
                  <div className="mb-1 font-semibold text-[#6b6a64]">Image overrides <span className="float-right text-[#3f81c9]">+ Add</span></div>
                  <p className="leading-4 text-[#9a9991]">Override the image collection for a specific slide.</p>
                </div>
              )}
            </>
          )}
          <button
            className="mt-auto w-full rounded-[8px] bg-[#ff5626] py-3 text-[14px] font-semibold text-white hover:bg-[#ed4d22]"
            onClick={() => {
              if (activeTab === "CTA") {
                onClose()
              } else {
                setCreateOpen(true)
              }
            }}
          >
            {activeTab === "CTA" ? "Save Changes" : "Create automation"}
          </button>
        </div>

        <div className="min-h-[520px] p-6">
          <div className={cn("mx-auto grid max-w-[390px] gap-3", activeTab === "Hook" ? "grid-cols-[1fr_120px]" : "grid-cols-3")}>
            {[0, 1, 2].map((index) => (
              <div key={index} className={cn(activeTab === "Hook" && index > 0 && "opacity-80")}>
                <div className="mb-2 text-center text-[11px] font-semibold text-[#6c6b66]">
                  {index === 0 ? activeTab : `Content ${index}`}
                </div>
                {previewImages[index] ? (
                  <div className="relative">
                    <PinterestPreviewTile
                      image={previewImages[index]}
                      index={index}
                      className={cn("w-full rounded-[3px] shadow-sm", activeTab === "Hook" && index === 0 ? "h-72" : "h-44")}
                    />
                    {displayText && (
                      <div className="font-tiktok absolute inset-x-3 top-[44%] rounded border border-[#4f91ff] bg-black/35 px-2 py-1 text-center text-[10px] font-bold leading-tight text-white">
                        {index === 0 ? "uncomfortable things to build extreme confidence" : "Et dolore magna"}
                      </div>
                    )}
                  </div>
                ) : (
                  <SlideThumb index={index + 6} className={cn("w-full rounded-[3px]", activeTab === "Hook" && index === 0 ? "h-72" : "h-44")} />
                )}
              </div>
            ))}
          </div>
          <div className="mx-auto mt-5 flex w-fit gap-1">
            {[0, 1, 2, 3, 4].map((dot) => (
              <span key={dot} className={cn("size-1.5 rounded-full", dot === 0 ? "bg-white" : "bg-white/45")} />
            ))}
          </div>
          <div className="mt-5 rounded-[8px] bg-white p-4">
            <div className="grid grid-cols-3 gap-3">
              <LabelledSelect label={activeTab === "Hook" ? "Font" : "Content direction"} value={activeTab === "Hook" ? "Default" : wordRange} options={["Default", "1-2 words", "2-3 words", "3-5 words", "5-7 words", "10-15 words"]} onChange={setWordRange} />
              <LabelledSelect label="Style" value="Outline" options={["Outline", "Bold", "Plain"]} />
              <LabelledSelect label="Size" value={activeTab === "Hook" ? "14px" : "12px"} options={["12px", "14px", "16px"]} />
              <LabelledSelect label="Position" value="Center" options={["Center", "Bottom", "Top"]} />
              <LabelledSelect label="Width" value="100%" options={["50%", "75%", "100%"]} />
            </div>
            <input className="mt-4 h-10 w-full rounded-[6px] border border-[#ecebe4] px-3 text-[12px] outline-none" placeholder="e.g. A bold hook about..." />
            <div className="mt-4 flex items-center justify-between text-[12px]">
              <button className="text-[#8b8a83]">Advanced ^</button>
              <div className="flex gap-4">
                <button className="text-[#3f81c9]">+ Add text</button>
                <button className="text-[#d76565]">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </section>
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
    </div>
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
    <div className="absolute inset-0 z-50 grid place-items-center bg-[#24251f]/32 p-4">
      <section className="w-full max-w-[430px] rounded-[8px] bg-white p-5 shadow-2xl">
        <h2 className="text-[18px] font-semibold">Create Automation</h2>
        <p className="mt-1 text-[13px] text-[#77766f]">Name your automation, add hooks, and set the tone & style.</p>
        <label className="mt-5 block text-[12px] font-semibold">
          Automation name
          <input
            className="mt-2 h-10 w-full rounded-[7px] border border-[#ecebe4] px-3 text-[13px] outline-none"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="mt-4 flex border-b text-[12px] font-semibold">
          <button className="border-b-2 border-[#242421] pb-2 pr-6">Hooks (1)</button>
          <button className="pb-2 text-[#8b8a83]">Tone & Style</button>
        </div>
        <div className="mt-4 text-[14px] font-semibold">Slideshow Hooks <span className="text-[#aaa9a2]">⊙</span></div>
        <div className="mt-1 text-[12px] font-semibold text-[#3f81c9]">Each line is a separate hook</div>
        <textarea
          className="mt-3 h-28 w-full resize-none rounded-[8px] border border-[#ecebe4] p-3 text-[13px] outline-none"
          defaultValue="uncomfortable things to build extreme confidence"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="softControl" size="appDefault" className="rounded-[8px] px-4 text-[13px]" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="action"
            size="appDefault"
            className="rounded-[8px] px-5 text-[13px]"
            onClick={() => onCreate(name.trim() || defaultName)}
          >
            Create
          </Button>
        </div>
      </section>
    </div>
  )
}

