"use client"

import { useRef, useState, type FormEvent } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconArrowLeft,
  IconArrowsShuffle,
  IconPhoto,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react"

import {
  listCollections,
  listMedia,
  mediaThumbnailUrl,
  searchStockImages,
  uploadMedia,
  type MediaView,
  type StockImage,
  type StockSource,
} from "@/components/realfarm/api-client"
import { Button } from "@/components/ui/button"
import { IconButton } from "@/components/ui/icon-button"
import { AppModal, AppModalHeader, AppModalPanel } from "@/components/ui/modal"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import type { Collection } from "@/lib/data/types"
import type { ImageSource } from "@/lib/render/spec"
import { cn } from "@/lib/utils"

import { randomCollectionSource } from "./slot-values"

export type MediaPickerTab = "uploads" | "collections" | "pexels" | "pinterest"

/** What the picker hands back, plus a thumbnail for the slot tile. */
export type PickedImage = { source: ImageSource; thumbnailUrl: string | null; label: string }

export function MediaPicker({
  title,
  initialTab = "uploads",
  onSelect,
  onClose,
}: {
  title: string
  initialTab?: MediaPickerTab
  onSelect: (picked: PickedImage) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<MediaPickerTab>(initialTab)

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="flex h-[min(720px,90vh)] w-[min(880px,calc(100vw-24px))] flex-col overflow-hidden p-0">
        <AppModalHeader title={title} closeLabel="Close image picker" onClose={onClose} />
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as MediaPickerTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabsList className="overflow-x-auto px-5">
            <TabsTrigger value="uploads">Uploads</TabsTrigger>
            <TabsTrigger value="collections">Collections</TabsTrigger>
            <TabsTrigger value="pexels">Pexels</TabsTrigger>
            <TabsTrigger value="pinterest">Pinterest</TabsTrigger>
          </TabsList>
          <TabsContent value="uploads" className="min-h-0 flex-1 overflow-y-auto p-5">
            <UploadsPanel onSelect={onSelect} />
          </TabsContent>
          <TabsContent value="collections" className="min-h-0 flex-1 overflow-y-auto p-5">
            <CollectionsPanel onSelect={onSelect} />
          </TabsContent>
          <TabsContent value="pexels" className="min-h-0 flex-1 overflow-y-auto p-5">
            <StockPanel source="pexels" onSelect={onSelect} />
          </TabsContent>
          <TabsContent value="pinterest" className="min-h-0 flex-1 overflow-y-auto p-5">
            <StockPanel source="pinterest" onSelect={onSelect} />
          </TabsContent>
        </Tabs>
      </AppModalPanel>
    </AppModal>
  )
}

function mediaPick(media: MediaView): PickedImage {
  return {
    source: { media: media.id },
    thumbnailUrl: mediaThumbnailUrl(media),
    label: media.name ?? "Upload",
  }
}

function UploadsPanel({ onSelect }: { onSelect: (picked: PickedImage) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const uploads = useQuery({
    queryKey: ["media", "uploads"],
    queryFn: () => listMedia({ collectionId: null, limit: 100 }),
  })

  async function upload(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setUploading(true)
    setError("")
    try {
      const media = await uploadMedia(file)
      await queryClient.invalidateQueries({ queryKey: ["media", "uploads"] })
      onSelect(mediaPick(media))
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.")
    } finally {
      setUploading(false)
    }
  }

  const images = (uploads.data?.items ?? []).filter((media) => media.kind === "image")

  return (
    <div className="space-y-5">
      <UploadDropzone
        inputRef={inputRef}
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        disabled={uploading}
        onFiles={(files) => void upload(files)}
        className="min-h-28"
      >
        <span className="flex flex-col items-center gap-2 text-sm font-semibold text-app-text">
          <IconUpload className="size-5 text-app-muted-text" />
          {uploading ? "Uploading…" : "Drop an image or choose a file"}
        </span>
      </UploadDropzone>
      {error ? <p role="alert" className="text-sm font-medium text-app-danger">{error}</p> : null}
      <MediaGrid
        loading={uploads.isLoading}
        error={uploads.error ? "Uploads could not be loaded." : ""}
        empty="No uploads yet."
        items={images.map((media) => ({
          key: media.id,
          thumbnailUrl: mediaThumbnailUrl(media),
          label: media.name ?? "Upload",
          onClick: () => onSelect(mediaPick(media)),
        }))}
      />
    </div>
  )
}

function CollectionsPanel({ onSelect }: { onSelect: (picked: PickedImage) => void }) {
  const [selected, setSelected] = useState<Collection | null>(null)
  const collections = useQuery({ queryKey: ["collections"], queryFn: listCollections })
  const media = useQuery({
    queryKey: ["media", "collection", selected?.id],
    queryFn: () => listMedia({ collectionId: selected!.id, limit: 100 }),
    enabled: !!selected,
  })

  if (!selected) {
    const items = (collections.data ?? []).filter(
      (collection) => collection.mediaKind === "image" && !collection.deletedAt
    )
    return (
      <MediaGrid
        loading={collections.isLoading}
        error={collections.error ? "Collections could not be loaded." : ""}
        empty="No image collections yet."
        items={items.map((collection) => ({
          key: collection.id,
          thumbnailUrl: collection.coverMediaId
            ? mediaThumbnailUrl({ id: collection.coverMediaId, fileId: collection.coverMediaId })
            : null,
          label: `${collection.name} · ${collection.itemCount}`,
          onClick: () => setSelected(collection),
        }))}
      />
    )
  }

  const images = (media.data?.items ?? []).filter((item) => item.kind === "image")
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Back to collections" onClick={() => setSelected(null)}>
          <IconArrowLeft />
        </IconButton>
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-app-text">
          {selected.name}
        </h3>
        <Button
          type="button"
          variant="softControl"
          size="appDefault"
          disabled={images.length === 0}
          onClick={() =>
            onSelect({
              source: randomCollectionSource(selected.id),
              thumbnailUrl: images[0] ? mediaThumbnailUrl(images[0]) : null,
              label: `Random from ${selected.name}`,
            })
          }
        >
          <IconArrowsShuffle />
          Random from collection
        </Button>
      </div>
      <MediaGrid
        loading={media.isLoading}
        error={media.error ? "Images could not be loaded." : ""}
        empty="This collection has no images."
        items={images.map((item) => ({
          key: item.id,
          thumbnailUrl: mediaThumbnailUrl(item),
          label: item.name ?? selected.name,
          onClick: () => onSelect(mediaPick(item)),
        }))}
      />
    </div>
  )
}

function StockPanel({
  source,
  onSelect,
}: {
  source: StockSource
  onSelect: (picked: PickedImage) => void
}) {
  const [query, setQuery] = useState("")
  const [submitted, setSubmitted] = useState("")
  const results = useQuery({
    queryKey: ["stock", source, submitted],
    queryFn: () => searchStockImages(source, submitted),
    enabled: submitted.length > 0,
    staleTime: 5 * 60_000,
  })
  const name = source === "pexels" ? "Pexels" : "Pinterest"

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitted(query.trim())
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex gap-2" role="search">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search {name}</span>
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-app-text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${name}`}
            className="h-9 w-full rounded-[10px] border border-app-panel-border bg-app-control-bg pr-3 pl-9 text-sm outline-none focus:border-app-action"
          />
        </label>
        <Button type="submit" variant="action" size="appDefault" disabled={!query.trim()}>
          Search
        </Button>
      </form>
      {submitted ? (
        <MediaGrid
          loading={results.isLoading}
          error={results.error ? `${name} search failed.` : ""}
          empty="No results."
          items={(results.data ?? []).map((image: StockImage) => ({
            key: image.id,
            thumbnailUrl: image.thumbnailUrl,
            label: image.title || image.attribution || name,
            onClick: () =>
              onSelect({
                source: { url: image.imageUrl },
                thumbnailUrl: image.thumbnailUrl,
                label: image.title || name,
              }),
          }))}
        />
      ) : null}
    </div>
  )
}

type GridItem = {
  key: string
  thumbnailUrl: string | null
  label: string
  onClick: () => void
}

function MediaGrid({
  items,
  loading,
  error,
  empty,
}: {
  items: GridItem[]
  loading: boolean
  error: string
  empty: string
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5" aria-busy="true">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="aspect-square animate-pulse rounded-lg bg-app-surface-subtle" />
        ))}
      </div>
    )
  }
  if (error) return <p role="alert" className="text-sm font-medium text-app-danger">{error}</p>
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-app-muted-text">{empty}</p>
  }
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          title={item.label}
          className="lc-focus-ring group relative aspect-square overflow-hidden rounded-lg bg-app-media-placeholder text-left"
        >
          {item.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote/owner-checked thumbnails
            <img
              src={item.thumbnailUrl}
              alt={item.label}
              loading="lazy"
              className="size-full object-cover transition duration-200 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="grid size-full place-items-center text-app-muted-text">
              <IconPhoto className="size-5" />
            </span>
          )}
          <span
            className={cn(
              "absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-[11px] font-semibold text-white"
            )}
          >
            {item.label}
          </span>
        </button>
      ))}
    </div>
  )
}
