"use client"

import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import {
  IconBug,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDownload,
  IconLoader2,
  IconPhotoEdit,
  IconTrash,
  IconX,
} from "@tabler/icons-react"

import { DeleteSlideshowDialog } from "@/components/realfarm/delete-slideshow-dialog"
import { TemplateGeneratedPreview } from "@/components/realfarm/template-showcase-preview"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useDirtyGuard } from "@/components/ui/use-dirty-guard"
import { exportSlideshowAsPngZip } from "@/lib/slideshow-export"
import { cn } from "@/lib/utils"

export type SlideshowViewerSlide = {
  id: string
  imageUrl: string
  text: string
  section: "hook" | "content" | "cta"
  durationSeconds?: number
}

export type SlideshowViewerItem = {
  id: string
  label: string
  title: string
  caption?: string
  hashtags?: string
  slides: SlideshowViewerSlide[]
}

export type SlideshowViewerDetails = {
  creationDate: string
  postDate: string
  language: string
}

export type SlideshowViewerImageOption = {
  id: string
  imageUrl: string
  caption: string
  collectionName: string
  usedInSlideIndexes: number[]
}

export type SlideshowViewerMetadata = {
  title: string
  caption: string
  hashtags: string
}

export function SlideshowViewerModal({
  title,
  slideshows,
  initialSlideshowId,
  fallbackSlides = [],
  details,
  publicationStatusControl,
  onDebug,
  onDelete,
  onDeleteSlide,
  onLoadSlideImages,
  onReplaceSlideImage,
  onUpdateMetadata,
  onClose,
}: {
  title: string
  slideshows: SlideshowViewerItem[]
  initialSlideshowId?: string
  fallbackSlides?: SlideshowViewerSlide[]
  details?: SlideshowViewerDetails
  publicationStatusControl?: ReactNode
  onDebug?: () => void
  onDelete?: () => Promise<void>
  onDeleteSlide?: (slideshowItemId: string, slideIndex: number) => Promise<void>
  onLoadSlideImages?: (
    slideshowItemId: string
  ) => Promise<SlideshowViewerImageOption[]>
  onReplaceSlideImage?: (
    slideshowItemId: string,
    slideIndex: number,
    imageUrl: string
  ) => Promise<void>
  onUpdateMetadata?: (
    slideshowItemId: string,
    metadata: SlideshowViewerMetadata
  ) => Promise<void>
  onClose: () => void
}) {
  const initialIndex = Math.max(
    0,
    slideshows.findIndex((slideshow) => slideshow.id === initialSlideshowId)
  )
  const boundedIndex =
    slideshows.length > 0 ? Math.min(initialIndex, slideshows.length - 1) : 0
  const selectedSlideshow = slideshows[boundedIndex]
  const [metadataDirty, setMetadataDirty] = useState(false)
  const dirtyGuard = useDirtyGuard(metadataDirty)

  function requestClose() {
    dirtyGuard.run(onClose)
  }

  return (
    <>
      <AppModal onClose={requestClose}>
        <AppModalPanel
          accessibleTitle={title}
          className="h-[min(880px,94vh)] max-w-[1180px] rounded-[10px] bg-[#b9b9b6]"
        >
          <SlideshowViewerContent
            key={selectedSlideshow?.id ?? "empty"}
            title={title}
            exportTitle={selectedSlideshow?.title || title}
            slideshowTitle={selectedSlideshow?.title}
            caption={selectedSlideshow?.caption}
            hashtags={selectedSlideshow?.hashtags}
            slides={selectedSlideshow?.slides ?? []}
            fallbackSlides={fallbackSlides}
            details={details}
            publicationStatusControl={publicationStatusControl}
            onDebug={onDebug}
            onDelete={onDelete}
            onDeleteSlide={
              onDeleteSlide && selectedSlideshow
                ? (slideIndex) =>
                    onDeleteSlide(selectedSlideshow.id, slideIndex)
                : undefined
            }
            onLoadSlideImages={
              onLoadSlideImages && selectedSlideshow
                ? () => onLoadSlideImages(selectedSlideshow.id)
                : undefined
            }
            onReplaceSlideImage={
              onReplaceSlideImage && selectedSlideshow
                ? (slideIndex, imageUrl) =>
                    onReplaceSlideImage(
                      selectedSlideshow.id,
                      slideIndex,
                      imageUrl
                    )
                : undefined
            }
            onUpdateMetadata={
              onUpdateMetadata && selectedSlideshow
                ? (metadata) => onUpdateMetadata(selectedSlideshow.id, metadata)
                : undefined
            }
            onDirtyChange={setMetadataDirty}
            onClose={requestClose}
          />
        </AppModalPanel>
      </AppModal>
      {dirtyGuard.confirmation}
    </>
  )
}

function SlideshowViewerContent({
  title,
  exportTitle,
  slideshowTitle,
  caption,
  hashtags,
  slides,
  fallbackSlides,
  details,
  publicationStatusControl,
  onDebug,
  onDelete,
  onDeleteSlide,
  onLoadSlideImages,
  onReplaceSlideImage,
  onUpdateMetadata,
  onDirtyChange,
  onClose,
}: {
  title: string
  exportTitle: string
  slideshowTitle?: string
  caption?: string
  hashtags?: string
  slides: SlideshowViewerSlide[]
  fallbackSlides: SlideshowViewerSlide[]
  details?: SlideshowViewerDetails
  publicationStatusControl?: ReactNode
  onDebug?: () => void
  onDelete?: () => Promise<void>
  onDeleteSlide?: (slideIndex: number) => Promise<void>
  onLoadSlideImages?: () => Promise<SlideshowViewerImageOption[]>
  onReplaceSlideImage?: (slideIndex: number, imageUrl: string) => Promise<void>
  onUpdateMetadata?: (metadata: SlideshowViewerMetadata) => Promise<void>
  onDirtyChange: (dirty: boolean) => void
  onClose: () => void
}) {
  const [activeSlide, setActiveSlide] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteSlideOpen, setDeleteSlideOpen] = useState(false)
  const [deletingSlide, setDeletingSlide] = useState(false)
  const [imagePickerOpen, setImagePickerOpen] = useState(false)
  const [imageOptions, setImageOptions] = useState<
    SlideshowViewerImageOption[]
  >([])
  const [imageOptionsLoading, setImageOptionsLoading] = useState(false)
  const [replacingImage, setReplacingImage] = useState(false)
  const initialMetadata = {
    title: slideshowTitle ?? "",
    caption: caption ?? "",
    hashtags: hashtags ?? "",
  }
  const [metadata, setMetadata] =
    useState<SlideshowViewerMetadata>(initialMetadata)
  const [savedMetadata, setSavedMetadata] =
    useState<SlideshowViewerMetadata>(initialMetadata)
  const [savingMetadata, setSavingMetadata] = useState(false)
  const boundedActiveSlide =
    slides.length > 0 ? Math.min(activeSlide, slides.length - 1) : 0
  const visibleSlide = slides[boundedActiveSlide]
  const descriptionAndHashtags = [
    metadata.caption.trim(),
    metadata.hashtags.trim(),
  ]
    .filter(Boolean)
    .join("\n\n")
  const metadataChanged =
    metadata.title !== savedMetadata.title ||
    metadata.caption !== savedMetadata.caption ||
    metadata.hashtags !== savedMetadata.hashtags

  useEffect(() => {
    onDirtyChange(metadataChanged)
    return () => onDirtyChange(false)
  }, [metadataChanged, onDirtyChange])

  async function copyMetadata(label: string, value: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`)
    } catch {
      toast.error(`${label} couldn’t be copied`)
    }
  }

  async function exportSlides() {
    setExporting(true)
    try {
      await exportSlideshowAsPngZip({
        title: metadata.title.trim() || exportTitle,
        slides,
      })
    } catch (error) {
      toast.error("Slideshow couldn’t be exported", {
        description:
          error instanceof Error
            ? error.message
            : "The slideshow could not be exported.",
      })
    } finally {
      setExporting(false)
    }
  }

  async function deleteActiveSlide() {
    if (!onDeleteSlide || slides.length === 0 || deletingSlide) return
    setDeletingSlide(true)
    try {
      await onDeleteSlide(boundedActiveSlide)
      setActiveSlide((current) => Math.max(0, current - 1))
      toast.success(`Slide ${boundedActiveSlide + 1} deleted`)
    } finally {
      setDeletingSlide(false)
    }
  }

  async function openImagePicker() {
    if (!onLoadSlideImages || imageOptionsLoading) return
    setImagePickerOpen(true)
    setImageOptionsLoading(true)
    try {
      setImageOptions(await onLoadSlideImages())
    } catch (error) {
      setImagePickerOpen(false)
      toast.error("Images could not be loaded", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setImageOptionsLoading(false)
    }
  }

  async function replaceActiveSlideImage(imageUrl: string) {
    if (!onReplaceSlideImage || replacingImage) return
    setReplacingImage(true)
    const toastId = toast.loading(
      `Rerendering slide ${boundedActiveSlide + 1}…`
    )
    try {
      await onReplaceSlideImage(boundedActiveSlide, imageUrl)
      setImagePickerOpen(false)
      toast.success(`Slide ${boundedActiveSlide + 1} updated`, { id: toastId })
    } catch (error) {
      toast.error("The slide image could not be changed", {
        id: toastId,
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setReplacingImage(false)
    }
  }

  async function saveMetadata() {
    if (!onUpdateMetadata || savingMetadata || !metadataChanged) return
    if (!metadata.title.trim()) {
      toast.error("Add a title before saving")
      return
    }
    setSavingMetadata(true)
    try {
      const normalized = {
        title: metadata.title.trim(),
        caption: metadata.caption.trim(),
        hashtags: metadata.hashtags.trim(),
      }
      await onUpdateMetadata(normalized)
      setMetadata(normalized)
      setSavedMetadata(normalized)
      toast.success("Slideshow details saved")
    } catch (error) {
      toast.error("The slideshow details could not be saved", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      })
    } finally {
      setSavingMetadata(false)
    }
  }

  return (
    <>
      <header className="flex h-[60px] items-center justify-between border-b border-[#d7d6d0] bg-app-surface px-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            className="grid size-8 place-items-center rounded-[5px] text-app-muted-text hover:bg-app-surface-subtle"
            onClick={onClose}
            aria-label="Close slideshow"
          >
            <IconX className="size-5" />
          </button>
          <h2 className="min-w-0 truncate text-[18px] font-semibold text-app-text">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {publicationStatusControl}
          <button
            type="button"
            className="grid size-9 place-items-center rounded-[7px] bg-app-action text-white shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-action active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
            aria-label="Export PNGs"
            title={exporting ? "Exporting PNGs" : "Export PNGs"}
            disabled={exporting || slides.length === 0}
            onClick={() => void exportSlides()}
          >
            {exporting ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconDownload className="size-4" />
            )}
          </button>
          {onDebug ? (
            <button
              type="button"
              className="grid size-9 place-items-center rounded-[7px] border border-app-panel-border bg-app-surface text-[#56554f] shadow-sm transition hover:bg-[#f4f3ee] hover:text-app-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-action active:translate-y-px"
              onClick={onDebug}
              aria-label="Generation debug"
              title="Generation debug"
            >
              <IconBug className="size-4" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="grid size-9 place-items-center rounded-[7px] border border-red-200 bg-app-surface text-red-600 shadow-sm transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 active:translate-y-px"
              onClick={() => setDeleteOpen(true)}
              aria-label="Delete slideshow"
              title="Delete slideshow"
            >
              <IconTrash className="size-4" />
            </button>
          ) : null}
        </div>
      </header>
      <main className="relative flex h-[calc(100%-60px)] min-h-0 flex-col overflow-hidden bg-[#efefec]">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-8 py-7 sm:px-10">
            {slides.length === 0 ? (
              <TemplateGeneratedPreview
                exampleSlides={fallbackSlides}
                tileCount={3}
                className="h-[356px] w-[620px] max-w-full rounded-[9px] shadow-xl"
              />
            ) : (
              <div className="flex max-w-full items-center justify-center gap-3">
                <button
                  type="button"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-white/88 text-app-text shadow-md transition hover:bg-app-surface disabled:cursor-not-allowed disabled:opacity-30"
                  onClick={() => setActiveSlide(boundedActiveSlide - 1)}
                  disabled={boundedActiveSlide === 0}
                  aria-label="Previous slide"
                >
                  <IconChevronLeft className="size-5" />
                </button>
                <div
                  className="relative shrink-0 overflow-hidden rounded-[9px] bg-black text-left shadow-xl ring-2 ring-white"
                  role="group"
                  aria-label={`Slide ${boundedActiveSlide + 1} of ${slides.length}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Generated slides can be local or remote assets without stable dimensions. */}
                  <img
                    src={visibleSlide.imageUrl}
                    alt={
                      visibleSlide.text ||
                      `${title} slide ${boundedActiveSlide + 1}`
                    }
                    className="block h-auto max-h-[clamp(300px,52vh,460px)] w-auto max-w-[min(72vw,760px)] object-contain"
                    draggable={false}
                  />
                  {onReplaceSlideImage ||
                  (onDeleteSlide && slides.length > 1) ? (
                    <div className="absolute top-2 right-2 flex gap-1.5">
                      {onReplaceSlideImage ? (
                        <button
                          type="button"
                          className="grid size-8 cursor-pointer place-items-center rounded-full bg-black/60 text-white transition hover:bg-app-action disabled:opacity-50"
                          aria-label={`Edit picture for slide ${boundedActiveSlide + 1}`}
                          title="Edit picture"
                          onClick={() => void openImagePicker()}
                        >
                          <IconPhotoEdit className="size-4" />
                        </button>
                      ) : null}
                      {onDeleteSlide && slides.length > 1 ? (
                        <button
                          type="button"
                          className="grid size-8 cursor-pointer place-items-center rounded-full bg-black/60 text-white transition hover:bg-red-600 disabled:opacity-50"
                          aria-label={`Delete slide ${boundedActiveSlide + 1}`}
                          title="Delete this slide"
                          onClick={() => setDeleteSlideOpen(true)}
                        >
                          <IconTrash className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-white/88 text-app-text shadow-md transition hover:bg-app-surface disabled:cursor-not-allowed disabled:opacity-30"
                  onClick={() => setActiveSlide(boundedActiveSlide + 1)}
                  disabled={boundedActiveSlide === slides.length - 1}
                  aria-label="Next slide"
                >
                  <IconChevronRight className="size-5" />
                </button>
              </div>
            )}
            {slides.length > 0 ? (
              <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
                {slides.map((_, dot) => (
                  <button
                    key={dot}
                    type="button"
                    className={cn(
                      "size-2 rounded-full",
                      dot === boundedActiveSlide
                        ? "bg-app-surface"
                        : "bg-white/55"
                    )}
                    onClick={() => setActiveSlide(dot)}
                    aria-label={`Show slide ${dot + 1}`}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </section>
        <SlideshowInformationPanel
          metadata={metadata}
          metadataChanged={metadataChanged}
          saving={savingMetadata}
          editable={Boolean(onUpdateMetadata)}
          details={details}
          onMetadataChange={setMetadata}
          onSave={() => void saveMetadata()}
          onCopyTitle={() => void copyMetadata("Title", metadata.title)}
          onCopyDescription={() =>
            void copyMetadata(
              "Description and hashtags",
              descriptionAndHashtags
            )
          }
        />
      </main>
      {deleteOpen && onDelete ? (
        <DeleteSlideshowDialog
          onCancel={() => setDeleteOpen(false)}
          onConfirm={onDelete}
        />
      ) : null}
      {deleteSlideOpen && onDeleteSlide ? (
        <ConfirmDialog
          title={`Delete slide ${boundedActiveSlide + 1}?`}
          description="This permanently removes the slide from this slideshow."
          confirmLabel="Delete slide"
          pendingLabel="Deleting…"
          onCancel={() => setDeleteSlideOpen(false)}
          onConfirm={deleteActiveSlide}
        />
      ) : null}
      {imagePickerOpen ? (
        <SlideImagePickerModal
          slideIndex={boundedActiveSlide}
          images={imageOptions}
          loading={imageOptionsLoading}
          replacing={replacingImage}
          onSelect={(imageUrl) => void replaceActiveSlideImage(imageUrl)}
          onClose={() => {
            if (!replacingImage) setImagePickerOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function SlideImagePickerModal({
  slideIndex,
  images,
  loading,
  replacing,
  onSelect,
  onClose,
}: {
  slideIndex: number
  images: SlideshowViewerImageOption[]
  loading: boolean
  replacing: boolean
  onSelect: (imageUrl: string) => void
  onClose: () => void
}) {
  const [selectedImageUrl, setSelectedImageUrl] = useState("")
  const selected = images.find((image) => image.imageUrl === selectedImageUrl)
  const usedByAnotherSlide = (image: SlideshowViewerImageOption) =>
    image.usedInSlideIndexes.some((index) => index !== slideIndex)

  return (
    <AppModal className="z-[90]" onClose={onClose}>
      <AppModalPanel
        accessibleTitle="Choose a replacement image"
        className="flex h-[min(680px,90vh)] max-w-[900px] flex-col rounded-[10px] bg-app-surface-subtle"
      >
        <header className="flex items-start justify-between gap-4 border-b border-app-panel-border bg-app-surface px-5 py-4">
          <div>
            <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-app-text">
              Choose a replacement image
            </h3>
            <p className="mt-1 text-[12px] font-medium text-app-muted-text">
              From this automation’s photo collections. Text and layout stay
              unchanged.
            </p>
          </div>
          <button
            type="button"
            className="grid size-8 shrink-0 place-items-center rounded-[6px] text-app-muted-text transition hover:bg-app-surface-subtle"
            onClick={onClose}
            disabled={replacing}
            aria-label="Close image picker"
          >
            <IconX className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div
              className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5"
              role="status"
              aria-label="Loading automation images"
            >
              {Array.from({ length: 15 }, (_, index) => (
                <div
                  key={index}
                  className="aspect-[4/5] animate-pulse rounded-[8px] bg-[#deddd7]"
                />
              ))}
            </div>
          ) : images.length ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
              {images.map((image) => {
                const unavailable = usedByAnotherSlide(image)
                const active = image.imageUrl === selectedImageUrl
                return (
                  <button
                    key={image.id}
                    type="button"
                    className={cn(
                      "group relative aspect-[4/5] overflow-hidden rounded-[8px] bg-[#deddd7] text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-action",
                      active && "ring-3 ring-app-action ring-offset-2",
                      unavailable
                        ? "cursor-not-allowed opacity-35"
                        : "hover:-translate-y-0.5 hover:shadow-md"
                    )}
                    disabled={unavailable || replacing}
                    onClick={() => setSelectedImageUrl(image.imageUrl)}
                    aria-label={`${unavailable ? "Already used: " : "Select "}${image.caption || image.collectionName}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- User collection assets may be local or remote. */}
                    <img
                      src={image.imageUrl}
                      alt={image.caption || image.collectionName}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-8 pb-2 text-[10px] leading-3 font-semibold text-white">
                      {unavailable ? "Already used" : image.collectionName}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="grid h-full min-h-[320px] place-items-center text-center">
              <div>
                <div className="text-[15px] font-semibold text-app-text">
                  No replacement images available
                </div>
                <p className="mt-1 text-[12px] text-app-muted-text">
                  Add images to this automation’s selected photo collections
                  first.
                </p>
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-app-panel-border bg-app-surface px-5 py-3">
          <p className="min-w-0 truncate text-[12px] font-medium text-app-muted-text">
            {selected
              ? selected.caption || selected.collectionName
              : `Editing slide ${slideIndex + 1}`}
          </p>
          <button
            type="button"
            className="h-9 shrink-0 rounded-[7px] bg-app-action px-4 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!selected || replacing}
            onClick={() => selected && onSelect(selected.imageUrl)}
          >
            {replacing ? "Rerendering…" : "Use image"}
          </button>
        </footer>
      </AppModalPanel>
    </AppModal>
  )
}

function SlideshowInformationPanel({
  metadata,
  metadataChanged,
  saving,
  editable,
  details,
  onMetadataChange,
  onSave,
  onCopyTitle,
  onCopyDescription,
}: {
  metadata: SlideshowViewerMetadata
  metadataChanged: boolean
  saving: boolean
  editable: boolean
  details?: SlideshowViewerDetails
  onMetadataChange: (metadata: SlideshowViewerMetadata) => void
  onSave: () => void
  onCopyTitle: () => void
  onCopyDescription: () => void
}) {
  const [publishingCopy, setPublishingCopy] = useState(() =>
    combinePublishingCopy(metadata)
  )

  function updatePublishingCopy(value: string) {
    setPublishingCopy(value)
    onMetadataChange({ ...metadata, ...splitPublishingCopy(value) })
  }

  return (
    <section className="max-h-[270px] w-full min-w-0 shrink-0 overflow-x-hidden overflow-y-auto border-t border-[#cfcec8] bg-[#f8f8f5] px-5 py-4">
      <div className="mx-auto w-full max-w-[1040px] min-w-0">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-app-text">
                Publishing details
              </h3>
              <p className="mt-0.5 text-[11px] text-[#85837c]">
                Edit what appears with this slideshow when it is posted.
              </p>
            </div>
            {editable ? (
              <button
                type="button"
                className={cn(
                  "h-8 shrink-0 rounded-[6px] px-3.5 text-[12px] font-semibold transition active:translate-y-px disabled:cursor-not-allowed",
                  metadataChanged
                    ? "bg-app-action text-white hover:brightness-95 disabled:opacity-45"
                    : "bg-[#e8e7e1] text-app-muted-text"
                )}
                disabled={!metadataChanged || saving || !metadata.title.trim()}
                onClick={onSave}
              >
                {saving
                  ? "Saving…"
                  : metadataChanged
                    ? "Save changes"
                    : "Saved"}
              </button>
            ) : null}
          </div>

          {details ? (
            <dl className="mb-4 grid grid-cols-1 gap-3 rounded-[8px] bg-app-surface-subtle px-3 py-3 sm:grid-cols-3">
              <ViewerDetail
                label="Creation date"
                value={details.creationDate}
              />
              <ViewerDetail label="Post date" value={details.postDate} />
              <ViewerDetail label="Language" value={details.language} />
            </dl>
          ) : null}

          <div className="min-w-0 divide-y divide-[#deddd7] border-y border-app-panel-border">
            <div className="min-w-0 py-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="slideshow-publishing-title"
                  className="text-[10px] font-semibold tracking-[0.04em] text-app-muted-text"
                >
                  Title
                </label>
                <InlineCopyButton label="Copy title" onClick={onCopyTitle} />
              </div>
              <input
                id="slideshow-publishing-title"
                className={cn(
                  "block h-7 w-full min-w-0 border-0 bg-transparent p-0 text-[15px] font-semibold tracking-[-0.01em] text-[#292925] outline-none placeholder:text-[#aaa8a0] focus:text-app-action",
                  !editable && "cursor-default text-[#65645f]"
                )}
                value={metadata.title}
                readOnly={!editable}
                maxLength={180}
                onChange={(event) =>
                  onMetadataChange({ ...metadata, title: event.target.value })
                }
                placeholder="Add a title"
              />
            </div>

            <div className="min-w-0 py-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="slideshow-publishing-copy"
                  className="text-[10px] font-semibold tracking-[0.04em] text-app-muted-text"
                >
                  Description + hashtags
                </label>
                <InlineCopyButton
                  label="Copy description and hashtags"
                  onClick={onCopyDescription}
                />
              </div>
              <textarea
                id="slideshow-publishing-copy"
                className={cn(
                  "block h-[76px] w-full min-w-0 resize-none border-0 bg-transparent p-0 text-[13px] leading-5 font-medium text-[#3c3b37] outline-none placeholder:text-[#aaa8a0] focus:text-app-text",
                  !editable && "cursor-default text-[#65645f]"
                )}
                value={publishingCopy}
                readOnly={!editable}
                maxLength={2700}
                onChange={(event) => updatePublishingCopy(event.target.value)}
                placeholder="Add the post description and hashtags"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function InlineCopyButton({
  label,
  onClick,
}: {
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="grid size-7 place-items-center rounded-[5px] text-app-muted-text transition hover:bg-[#e7e6e0] hover:text-app-action"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <IconCopy className="size-3.5" />
    </button>
  )
}

function combinePublishingCopy(metadata: SlideshowViewerMetadata) {
  return [metadata.caption.trim(), metadata.hashtags.trim()]
    .filter(Boolean)
    .join("\n\n")
}

function splitPublishingCopy(value: string) {
  const paragraphs = value.split(/\n\s*\n/)
  const lastParagraph = paragraphs.at(-1)?.trim() || ""
  const isHashtagParagraph =
    Boolean(lastParagraph) &&
    lastParagraph
      .split(/\s+/)
      .filter(Boolean)
      .every((token) => token.startsWith("#"))

  return isHashtagParagraph
    ? {
        caption: paragraphs.slice(0, -1).join("\n\n").trim(),
        hashtags: lastParagraph,
      }
    : { caption: value, hashtags: "" }
}

function ViewerDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold tracking-[0.04em] text-app-text-faint">
        {label}
      </dt>
      <dd
        className="mt-1 truncate text-[13px] font-semibold text-[#292925] tabular-nums"
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}
