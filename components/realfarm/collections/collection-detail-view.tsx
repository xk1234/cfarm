"use client"

import { useEffect, useRef, useState } from "react"
import type * as React from "react"
import { IconChevronLeft, IconLayoutDashboard, IconList, IconPhotoPlus, IconPlus, IconTrash, IconUpload, IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import { Popover } from "radix-ui"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { LabelledSelect, SelectControl, SwitchPillButton, ToggleRow } from "@/components/ui/form-controls"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import { ImageViewerModal } from "@/components/realfarm/image-viewer-modal"
import { ControlRow, ControlToggle, MediaCardShell, PinterestPreviewTile, SlideThumb } from "@/components/realfarm/shared-media"
import { PinterestCollectionSearch } from "@/components/realfarm/pinterest-collection-search"
import { collectionToStored, type CreatedImageCollection, type StoredImageCollection } from "@/lib/realfarm-collections"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { AssetRecord } from "@/lib/assets"
import type { PinterestSearchResult } from "@/lib/pinterest-search"
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
              {complete || failed
                ? `${progress.completed} of ${progress.total} captions generated`
                : `Processing ${progress.total} image${progress.total === 1 ? "" : "s"}. This can take a few minutes.`}
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
            <span>{complete || failed ? `${percent}%` : "Working…"}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-md bg-app-control-bg">
            <div
              className={cn(
                "h-full rounded-md transition-all",
                failed
                  ? "bg-destructive"
                  : complete
                    ? "bg-app-action"
                    : "w-1/3 animate-pulse bg-app-action"
              )}
              style={complete || failed ? { width: `${percent}%` } : undefined}
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
  onAddImages: (
    images: PinterestSearchResult[]
  ) => void | boolean | Promise<void | boolean>
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
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [captionEdits, setCaptionEdits] = useState<Record<string, string>>({})
  const [captioning, setCaptioning] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [captionProgress, setCaptionProgress] =
    useState<CaptionProgressState | null>(null)
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
            "/api/assets/upload",
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
      {deleteImagesOpen ? (
        <ConfirmDialog
          title={`Delete ${selectedImageKeys.length} selected image${selectedImageKeys.length === 1 ? "" : "s"}?`}
          description="This permanently removes the selected images from this collection."
          confirmLabel="Delete images"
          onCancel={() => setDeleteImagesOpen(false)}
          onConfirm={deleteSelectedImages}
        />
      ) : null}
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
