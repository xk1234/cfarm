"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  IconBrandFacebookFilled,
  IconBrandGoogleFilled,
  IconBrandTiktok,
  IconBrandX,
  IconChevronDown,
  IconWorld,
  IconWriting,
  IconShoppingBag,
  IconSearch,
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { Select } from "radix-ui"
import type { ColDef, ICellRendererParams } from "ag-grid-community"

import { AgDataTable } from "@/components/ui/ag-data-table"
import { SwipeDetailPage } from "@/components/realfarm/swipe-detail-page"
import {
  toSwipeDisplayModel,
  type SwipeDisplayModel,
} from "@/components/realfarm/swipe-display-model"
import { SwipeMedia } from "@/components/realfarm/swipe-media"
import { Button } from "@/components/ui/button"
import { CardGridSkeleton } from "@/components/ui/loading-skeleton"
import { SelectLike } from "@/components/ui/form-controls"
import { ViewModeToggle, type ViewMode } from "@/components/ui/view-mode-toggle"
import { fetchJsonWithTimeout, toastApiError } from "@/lib/client-api"
import type { SwipeRecord } from "@/lib/swipes"
import { cn } from "@/lib/utils"

type SwipeTableRow = {
  id: string
  advertiser: string
  title: string
  platform: string
  format: string
  folder: string
  processingStatus: string
  swipedAt: string
  shared: boolean
}

export function SwipesView({ currentUserId }: { currentUserId: string }) {
  const [swipes, setSwipes] = useState<SwipeRecord[]>([])
  const [selectedSwipeId, setSelectedSwipeId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [platform, setPlatform] = useState("All")
  const [format, setFormat] = useState("All")
  const [sort, setSort] = useState("Recent")
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    let cancelled = false

    async function loadSwipes() {
      try {
        const payload = await fetchJsonWithTimeout<{ swipes?: SwipeRecord[] }>(
          "/api/swipes",
          {
            cache: "no-store",
            timeoutMs: 12_000,
            toastOnError: false,
          }
        )
        if (!cancelled) {
          setSwipes(payload.swipes ?? [])
          setStatus("ready")
        }
      } catch (error) {
        if (!cancelled) {
          setStatus("error")
          toastApiError(error, "Failed to load swipes")
        }
      }
    }

    void loadSwipes()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function syncFromHash() {
      const match = window.location.hash.match(/^#swipe=(.+)$/)
      setSelectedSwipeId(match?.[1] ? decodeURIComponent(match[1]) : null)
    }

    syncFromHash()
    window.addEventListener("hashchange", syncFromHash)
    return () => window.removeEventListener("hashchange", syncFromHash)
  }, [])

  const displaySwipes = useMemo(
    () => swipes.map((swipe) => ({ swipe, model: toSwipeDisplayModel(swipe) })),
    [swipes]
  )
  const selectedSwipe = selectedSwipeId
    ? swipes.find((swipe) => swipe.id === selectedSwipeId)
    : undefined

  const filteredSwipes = useMemo(
    () =>
      displaySwipes
        .filter(({ model }) => {
          const haystack =
            `${model.advertiser} ${model.title} ${model.caption} ${model.platform}`.toLowerCase()
          return haystack.includes(search.trim().toLowerCase())
        })
        .filter(
          ({ model }) => platform === "All" || platform === model.platform
        )
        .filter(({ model }) => format === "All" || format === model.format)
        .toSorted((a, b) => {
          if (sort === "Oldest") {
            return Date.parse(a.model.swipedAt) - Date.parse(b.model.swipedAt)
          }
          return Date.parse(b.model.swipedAt) - Date.parse(a.model.swipedAt)
        }),
    [displaySwipes, format, platform, search, sort]
  )

  const inspectSwipe = useCallback((id: string) => {
    history.pushState(
      {},
      document.title,
      `${window.location.pathname}${window.location.search}#swipe=${encodeURIComponent(id)}`
    )
    setSelectedSwipeId(id)
  }, [])

  const backToList = useCallback(() => {
    if (window.location.hash.startsWith("#swipe=")) {
      history.pushState(
        {},
        document.title,
        window.location.pathname + window.location.search
      )
    }
    setSelectedSwipeId(null)
  }, [])

  const deleteSwipe = useCallback(
    async (id: string) => {
      const deleted = swipes.find((swipe) => swipe.id === id)
      if (!deleted) {
        return
      }

      setSwipes((current) => current.filter((swipe) => swipe.id !== id))
      if (selectedSwipeId === id) {
        backToList()
      }

      try {
        await fetchJsonWithTimeout(`/api/swipes/${encodeURIComponent(id)}`, {
          method: "DELETE",
          timeoutMs: 12_000,
          toastOnError: false,
        })
        toast.success("Swipe deleted")
      } catch (error) {
        setSwipes((current) => [deleted, ...current])
        toastApiError(error, "Failed to delete swipe")
      }
    },
    [backToList, selectedSwipeId, swipes]
  )

  const tableRows = useMemo<SwipeTableRow[]>(
    () =>
      filteredSwipes.map(({ swipe, model }) => ({
        id: model.id,
        advertiser: model.advertiser,
        title: model.title,
        platform: model.platform,
        format: model.format,
        folder: model.folder,
        processingStatus: model.processingStatus || "ready",
        swipedAt: model.swipedAt,
        shared: Boolean(swipe.ownerId && swipe.ownerId !== currentUserId),
      })),
    [currentUserId, filteredSwipes]
  )
  const tableColumns = useMemo<ColDef<SwipeTableRow>[]>(
    () => [
      {
        field: "advertiser",
        headerName: "Advertiser",
        minWidth: 180,
        flex: 1.1,
      },
      { field: "title", headerName: "Title", minWidth: 260, flex: 1.7 },
      { field: "platform", headerName: "Platform", minWidth: 130 },
      { field: "format", headerName: "Format", minWidth: 120 },
      { field: "folder", headerName: "Folder", minWidth: 150, flex: 0.8 },
      {
        field: "processingStatus",
        headerName: "Status",
        minWidth: 120,
      },
      {
        field: "swipedAt",
        headerName: "Swiped",
        minWidth: 150,
        valueFormatter: ({ value }) => formatTableDate(String(value)),
      },
      {
        field: "shared",
        headerName: "Access",
        minWidth: 110,
        cellRenderer: ({ value }: ICellRendererParams<SwipeTableRow>) =>
          value ? "Shared" : "Mine",
      },
      {
        headerName: "Actions",
        minWidth: 170,
        sortable: false,
        filter: false,
        cellRenderer: ({ data }: ICellRendererParams<SwipeTableRow>) =>
          data ? (
            <div className="flex h-full items-center gap-2">
              <Button
                type="button"
                variant="softControl"
                size="compact"
                onClick={(event) => {
                  event.stopPropagation()
                  inspectSwipe(data.id)
                }}
              >
                Inspect
              </Button>
              {!data.shared ? (
                <Button
                  type="button"
                  variant="iconControl"
                  size="icon-sm"
                  className="text-app-danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    void deleteSwipe(data.id)
                  }}
                  aria-label={`Delete ${data.title}`}
                >
                  <IconTrash className="size-4" />
                </Button>
              ) : null}
            </div>
          ) : null,
      },
    ],
    [deleteSwipe, inspectSwipe]
  )

  if (selectedSwipe) {
    return <SwipeDetailPage swipe={selectedSwipe} onBack={backToList} />
  }

  return (
    <div className="mx-auto max-w-[1540px]">
      <div className="mb-5 grid gap-4 xl:grid-cols-[220px_1fr_auto]">
        <div>
          <h1 className="text-[17px] font-semibold text-[#28255d]">
            Swipe File
          </h1>
          <p className="mt-1 text-[13px] font-medium text-[#6d6b90]">
            All your private swipes
          </p>
        </div>
        <label className="relative block max-w-[430px]">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#aaa9c6]" />
          <input
            className="h-10 w-full rounded-[7px] border border-[#e4e3f4] bg-app-surface pr-3 pl-10 text-[13px] font-medium outline-none placeholder:text-[#b5b4ca]"
            placeholder="Search By Brand Name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div
          className="flex flex-nowrap items-center gap-3 overflow-x-auto pb-1"
          role="group"
          aria-label="Swipe filters"
        >
          <PlatformSelect value={platform} onChange={setPlatform} />
          <div className="shrink-0">
            <SelectLike
              value={`Sort by: ${sort}`}
              options={["Sort by: Recent", "Sort by: Oldest"]}
              onChange={(value) => setSort(value.replace("Sort by: ", ""))}
              placement="bottom"
            />
          </div>
          <div className="shrink-0">
            <SelectLike
              value={`Format: ${format}`}
              options={[
                "Format: All",
                "Format: image",
                "Format: video",
                "Format: carousel",
                "Format: unknown",
              ]}
              onChange={(value) => setFormat(value.replace("Format: ", ""))}
              placement="bottom"
            />
          </div>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {status === "error" && (
        <div className="rounded-[8px] border border-[#f1c5bc] bg-[#fff3f0] px-4 py-3 text-[13px] font-semibold text-[#b44d38]">
          Could not load local swipes. Make sure the dev server has access to
          data/swipes/swipes.json.
        </div>
      )}

      {status === "loading" ? (
        <CardGridSkeleton count={8} className="lg:grid-cols-4" />
      ) : filteredSwipes.length === 0 ? (
        <div className="grid min-h-[360px] place-items-center rounded-[10px] border border-dashed border-[#d6d4ee] bg-[#f6f5ff] text-center">
          <div>
            <div className="text-[18px] font-semibold text-[#28255d]">
              No swipes yet
            </div>
            <p className="mt-2 max-w-[420px] text-[13px] leading-5 text-[#6d6b90]">
              Load the extension, visit a supported ad platform, and click Swipe
              to save ads into this local file.
            </p>
          </div>
        </div>
      ) : viewMode === "table" ? (
        <AgDataTable
          rows={tableRows}
          columns={tableColumns}
          getRowId={(row) => row.id}
          onRowClick={(row) => inspectSwipe(row.id)}
          emptyMessage="No matching swipes"
        />
      ) : (
        <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5">
          {filteredSwipes.map(({ swipe, model }, index) => (
            <SwipeCard
              key={model.id}
              swipe={model}
              index={index}
              onInspect={() => inspectSwipe(model.id)}
              shared={Boolean(swipe.ownerId && swipe.ownerId !== currentUserId)}
              onDelete={() => void deleteSwipe(model.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const platformOptions = [
  "All",
  "facebook",
  "tiktok",
  "tiktok-creative",
  "tiktok-seller",
  "google",
  "twitter",
] as const

type SwipePlatformFilter = (typeof platformOptions)[number]

function PlatformSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const selected = platformOptions.includes(value as SwipePlatformFilter)
    ? (value as SwipePlatformFilter)
    : "All"

  return (
    <Select.Root value={selected} onValueChange={onChange}>
      <Select.Trigger asChild>
        <Button
          type="button"
          variant="softControl"
          size="appDefault"
          className="min-w-[158px] shrink-0 justify-between gap-3"
        >
          <Select.Value>
            <PlatformOptionContent platform={selected} />
          </Select.Value>
          <Select.Icon asChild>
            <IconChevronDown className="size-4 text-app-muted-text" />
          </Select.Icon>
        </Button>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={8}
          className="z-50 w-[190px] rounded-lg border border-app-panel-border bg-app-control-bg p-1 text-sm shadow-xl"
        >
          <Select.Viewport>
            {platformOptions.map((option) => (
              <Select.Item
                key={option}
                value={option}
                className={cn(
                  "flex h-9 w-full cursor-default items-center gap-2 rounded-md px-2 text-left font-semibold outline-none data-[highlighted]:bg-app-control-hover",
                  option === selected && "bg-app-control-hover"
                )}
              >
                <Select.ItemText>
                  <PlatformOptionContent platform={option} />
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

function PlatformOptionContent({
  platform,
}: {
  platform: SwipePlatformFilter
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-app-strong text-white">
        {platformIcon(platform)}
      </span>
      <span className="truncate">{platformLabel(platform)}</span>
    </span>
  )
}

function platformIcon(platform: SwipePlatformFilter) {
  switch (platform) {
    case "facebook":
      return <IconBrandFacebookFilled className="size-3.5" />
    case "tiktok":
      return <IconBrandTiktok className="size-3.5" />
    case "tiktok-creative":
      return <IconWriting className="size-3.5" />
    case "tiktok-seller":
      return <IconShoppingBag className="size-3.5" />
    case "google":
      return <IconBrandGoogleFilled className="size-3.5" />
    case "twitter":
      return <IconBrandX className="size-3.5" />
    case "All":
      return <IconWorld className="size-3.5" />
  }
}

function platformLabel(platform: SwipePlatformFilter) {
  return platform === "All" ? "All" : platform
}

function SwipeCard({
  swipe,
  index,
  shared,
  onInspect,
  onDelete,
}: {
  swipe: SwipeDisplayModel
  index: number
  shared: boolean
  onInspect: () => void
  onDelete: () => void
}) {
  return (
    <article
      className={cn(
        "relative mb-5 break-inside-avoid overflow-hidden rounded-[6px] border bg-app-surface shadow-[0_4px_16px_rgba(40,37,93,0.08)]",
        shared
          ? "border-[#9b7bea] ring-2 ring-[#6d28d9]/15"
          : "border-[#e6e4f7]"
      )}
    >
      {shared ? (
        <span className="absolute top-2 left-2 z-10 rounded-full bg-app-action px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
          Shared
        </span>
      ) : null}
      {!shared ? (
        <button
          type="button"
          className="absolute top-2 right-2 z-10 grid size-8 place-items-center rounded-full bg-white/95 text-[#b44d38] shadow-sm ring-1 ring-[#f1d6d2] transition hover:bg-[#fff0ed]"
          onClick={onDelete}
          aria-label={`Delete swipe ${swipe.title}`}
          title="Delete swipe"
        >
          <IconTrash className="size-4" />
        </button>
      ) : null}
      <div className="flex items-start gap-3 p-4 pr-12 pb-3">
        <SwipeAvatar name={swipe.advertiser} index={index} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-[#28255d]">
            {swipe.advertiser}
          </div>
          <div className="text-[11px] font-medium text-[#7d7aa6] lowercase">
            {swipe.platform}
          </div>
        </div>
        <span className="ml-auto text-[10px] font-bold tracking-[0.08em] text-[#9b99bd] uppercase">
          Swipe
        </span>
      </div>
      <SwipeMedia
        swipe={swipe}
        className={cn(
          index % 5 === 1 ? "h-72" : index % 5 === 2 ? "h-56" : "h-64"
        )}
      />
      <div className="p-4 pt-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {swipe.processingStatus === "processing" && (
            <span className="rounded-full bg-[#fff5d6] px-2 py-1 text-[10px] font-bold tracking-[0.06em] text-[#8a6400] uppercase">
              processing...
            </span>
          )}
          {swipe.processingStatus === "failed" && (
            <span className="rounded-full bg-[#fff0ed] px-2 py-1 text-[10px] font-bold tracking-[0.06em] text-[#b44d38] uppercase">
              failed
            </span>
          )}
        </div>
        <h2 className="line-clamp-2 text-[14px] leading-5 font-semibold text-[#28255d]">
          {swipe.title}
        </h2>
        <p className="mt-2 line-clamp-3 text-[12px] leading-5 font-medium text-[#5f5d80]">
          {swipe.caption}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-semibold text-[#7d7aa6]">
          <span>Swiped: {formatSwipeDate(swipe.swipedAt)}</span>
          <span>Format: {swipe.format}</span>
          <span className="col-span-2">{swipe.folder}</span>
        </div>
        <Button
          type="button"
          variant="action"
          size="appDefault"
          className="mt-4 w-full min-w-0"
          onClick={onInspect}
        >
          Inspect Swipe
        </Button>
      </div>
    </article>
  )
}

function SwipeAvatar({ name, index }: { name: string; index: number }) {
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white",
        swipeAvatarTone(index)
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

function formatSwipeDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "N/A"
  }
  return date.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  })
}

function formatTableDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
}

function swipeAvatarTone(index: number) {
  const tones = [
    "bg-[#54b75d]",
    "bg-[#111111]",
    "bg-[#b5448e]",
    "bg-[#343197]",
    "bg-[#0b7a68]",
  ]
  return tones[index % tones.length]
}
