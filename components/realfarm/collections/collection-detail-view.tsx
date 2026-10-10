"use client"

import { useEffect, useRef, useState } from "react"
import type * as React from "react"
import {
  IconChevronLeft,
  IconList,
  IconPlus,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Popover } from "radix-ui"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SelectControl, ToggleRow } from "@/components/ui/form-controls"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import { ImageViewerModal } from "@/components/realfarm/image-viewer-modal"
import {
  MediaCardShell,
  PinterestPreviewTile,
} from "@/components/realfarm/shared-media"
import { PinterestCollectionSearch } from "@/components/realfarm/pinterest-collection-search"
import type { CreatedImageCollection } from "@/lib/realfarm-collections"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { AssetRecord } from "@/lib/assets"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
import { cn } from "@/lib/utils"
import { apiRoutes } from "@/components/realfarm/api-client"

const INITIAL_VISIBLE_ROWS = 3
const LOAD_MORE_ROWS = 3

export function CollectionDetailView({
  collection,
  readonly,
  onBack,
  onAddImages,
  onRemoveImages,
  onUpdateCollection,
  onRename,
}: {
  collection: CreatedImageCollection
  readonly?: boolean
  onBack: () => void
  onAddImages: (
    images: PinterestSearchResult[]
  ) => void | boolean | Promise<void | boolean>
  onRemoveImages: (keys: string[]) => void
  onUpdateCollection: (collection: CreatedImageCollection) => void
  onRename: (title: string) => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(collection.title)
  const [columns, setColumns] = useState(5)
  const [visibleRows, setVisibleRows] = useState(INITIAL_VISIBLE_ROWS)
  const [showDescriptions, setShowDescriptions] = useState(false)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedImageKeys, setSelectedImageKeys] = useState<string[]>([])
  const [deleteImagesOpen, setDeleteImagesOpen] = useState(false)
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

  async function importFiles(fileList: FileList | null) {
    if (!fileList || readonly || uploading) {
      return
    }

    const files = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/")
    )
    if (files.length === 0) {
      toast.error("Choose at least one image file")
      return
    }

    setUploading(true)
    try {
      const results = await Promise.allSettled(
        files.map(async (file): Promise<PinterestSearchResult> => {
          const formData = new FormData()
          formData.set("file", file)
          formData.set("scope", "global")
          formData.set("category", "reference")
          formData.set("name", file.name.replace(/\.[^.]+$/, ""))
          const payload = await fetchJsonWithTimeout<{ asset: AssetRecord }>(
            apiRoutes.collectionAssetUpload,
            { method: "POST", body: formData }
          )
          if (!payload.asset.fileUrl) {
            throw new Error(`Upload did not return a URL for ${file.name}`)
          }
          return {
            id: payload.asset.id,
            title: payload.asset.name,
            description: payload.asset.caption,
            imageUrl: payload.asset.fileUrl,
            sourceUrl: payload.asset.fileUrl,
            dominantColor: "#d9d8d0",
          }
        })
      )
      const uploadedImages = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      )
      const failed = results.length - uploadedImages.length
      if (uploadedImages.length > 0) {
        const saved = await onAddImages(uploadedImages)
        if (saved !== false) {
          toast.success(
            `Uploaded ${uploadedImages.length} image${uploadedImages.length === 1 ? "" : "s"}`
          )
        }
      }
      if (failed > 0) {
        toast.error(
          `${failed} image${failed === 1 ? "" : "s"} could not be uploaded`
        )
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to upload images"))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1120px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
          <Button
            type="button"
            variant="iconControl"
            size="icon-control"
            className="size-10 sm:size-8"
            onClick={onBack}
            aria-label="Back to collections"
          >
            <IconChevronLeft className="size-5" />
          </Button>
          {editingTitle ? (
            <input
              className="h-10 min-w-0 flex-1 rounded-[6px] border border-[#d9d8d0] bg-app-surface px-2 text-[18px] font-semibold outline-none sm:h-8 sm:min-w-[280px] sm:flex-none sm:text-[22px]"
              aria-label="Collection name"
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
            <h1 className="flex h-10 min-w-0 flex-1 items-center truncate text-[22px] leading-none font-semibold sm:h-8">
              {collection.title}
            </h1>
          )}
          {!readonly && editingTitle && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-10 sm:h-6"
                onClick={saveTitle}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="h-10 sm:h-6"
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
              className="h-10 sm:h-6"
              onClick={() => {
                setTitleDraft(collection.title)
                setEditingTitle(true)
              }}
            >
              Edit
            </Button>
          )}
        </div>
        <div className="flex w-full items-center gap-2 overflow-x-auto sm:w-auto">
          <Popover.Root>
            <Popover.Trigger asChild>
              <Button
                variant="softControl"
                size="compact"
                className="h-10 sm:h-8"
              >
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
              className="h-10 sm:h-8"
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
          disabled={uploading}
          className="mb-6 min-h-[150px]"
          onFiles={(files) => void importFiles(files)}
        >
          <span>
            <IconUpload className="mx-auto mb-2 size-5 text-app-muted-text" />
            <span className="block text-[15px] font-semibold">
              {uploading
                ? "Uploading images…"
                : "Drag and drop (or click to upload)"}
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
            No images yet.
          </span>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-nowrap items-center justify-between gap-3 overflow-x-auto pb-1">
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="softControl"
                size="compact"
                className="h-10 sm:h-8"
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
                className="h-10 sm:h-8"
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
                  className="h-10 sm:h-8"
                  onClick={() => setSelectedImageKeys([])}
                >
                  Clear
                </Button>
              )}
            </div>
            {selectedCount > 0 && (
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-[8px] bg-app-surface px-3 py-2 text-[13px] font-semibold text-app-text-soft shadow-sm">
                  {selectedCount} selected
                  {selectedVisibleCount > 0 ? ` loaded` : ""}
                </span>
                {!readonly && (
                  <Button
                    variant="destructive"
                    size="compact"
                    className="h-10 sm:h-8"
                    onClick={() => setDeleteImagesOpen(true)}
                  >
                    <IconTrash className="size-4" />
                    Delete
                  </Button>
                )}
              </div>
            )}
          </div>

          <div
            className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-6 md:[grid-template-columns:repeat(var(--collection-columns),minmax(0,1fr))]"
            style={
              {
                "--collection-columns": columns,
              } as React.CSSProperties
            }
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
                  <label
                    className="absolute top-1 left-1 z-10 grid size-10 place-items-center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      className="size-5 accent-app-action"
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleImageSelection(key)}
                      aria-label={`Select ${image.title}`}
                    />
                  </label>
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
      {deleteImagesOpen ? (
        <ConfirmDialog
          title={`Delete ${selectedImageKeys.length} selected image${selectedImageKeys.length === 1 ? "" : "s"}?`}
          description="This permanently removes the selected images from this collection."
          confirmLabel="Delete images"
          onCancel={() => setDeleteImagesOpen(false)}
          onConfirm={deleteSelectedImages}
        />
      ) : null}
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
