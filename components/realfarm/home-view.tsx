"use client"

import { useMemo, useState, type ComponentType } from "react"
import {
  IconAlertCircle,
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
  IconSlideshow,
} from "@tabler/icons-react"

import {
  SlideshowPublishActions,
  type PublishableSlideshow,
} from "@/components/realfarm/publish/slideshow-publish-dialog"
import {
  GenerationFailurePlaceholder,
  MediaCardShell,
  MediaFrame,
} from "@/components/realfarm/shared-media"
import {
  SlideshowViewerModal,
  type SlideshowViewerItem,
  type SlideshowViewerMetadata,
} from "@/components/realfarm/slideshow-viewer-modal"
import { Button } from "@/components/ui/button"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { clientQueryFetcher } from "@/lib/client-fetcher"
import { useAppQuery } from "@/lib/client-query"
import type { CalendarAlertSummary } from "@/lib/calendar-summary"
import { cn } from "@/lib/utils"

const ITEMS_PER_PAGE = 10
const RENDERS_URL = "/api/slideshows?limit=100"

/**
 * The persisted slideshow fields the home grid reads. Mirrors the subset of
 * `SlideshowRecord` returned by `GET /api/slideshows`.
 */
export type HomeSlideshow = PublishableSlideshow & {
  status: "exported" | "failed" | string
  created_at?: string
  updated_at?: string
  settings?: { aspect_ratio?: string }
  images?: Array<{ image_url?: string; textItems?: Array<{ text?: string }> }>
}

type SlideshowsPayload = {
  slideshows?: HomeSlideshow[]
  slideshowsCount?: number
}

export function HomeView({
  onOpenSchedule,
  onOpenCollections,
}: {
  onOpenSchedule: () => void
  onOpenCollections: () => void
}) {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const {
    data,
    error,
    isLoading,
    mutate: mutateRenders,
  } = useAppQuery<SlideshowsPayload>(RENDERS_URL, clientQueryFetcher)
  const { data: calendarStatus } = useAppQuery<{
    summary: CalendarAlertSummary
  }>("/api/calendar/summary", clientQueryFetcher, {
    refreshInterval: 10 * 60_000,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  })

  const renders = useMemo(
    () =>
      [...(data?.slideshows ?? [])].sort(
        (first, second) => timestamp(second) - timestamp(first)
      ),
    [data?.slideshows]
  )
  const outstandingActionCount = calendarStatus
    ? calendarStatus.summary.needsAction + calendarStatus.summary.failed
    : null
  const totalPages = Math.max(1, Math.ceil(renders.length / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pagedRenders = renders.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  )
  const selected = renders.find((item) => item.id === selectedId) ?? null

  function replaceRender(updated: HomeSlideshow) {
    void mutateRenders(
      {
        ...data,
        slideshows: (data?.slideshows ?? []).map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item
        ),
      },
      false
    )
  }

  async function deleteRender(id: string) {
    await fetchJsonWithTimeout(`/api/slideshows/${encodeURIComponent(id)}`, {
      method: "DELETE",
      timeoutMs: 15_000,
      toastOnError: false,
    })
    setSelectedId(null)
    void mutateRenders(
      {
        ...data,
        slideshows: (data?.slideshows ?? []).filter((item) => item.id !== id),
      },
      true
    )
  }

  async function updateMetadata(
    slideshow: HomeSlideshow,
    metadata: SlideshowViewerMetadata
  ) {
    const payload = await fetchJsonWithTimeout<{ slideshow?: HomeSlideshow }>(
      `/api/slideshows/${encodeURIComponent(slideshow.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateMetadata", ...metadata }),
        toastOnError: false,
      }
    )
    replaceRender(payload.slideshow ?? { ...slideshow, ...metadata })
  }

  return (
    <div className="mx-auto max-w-[1280px] pb-16">
      <h1 className="pt-5 text-[30px] leading-none font-semibold tracking-[-0.04em] text-app-text sm:pt-7">
        Home
      </h1>
      <section className="py-5 sm:py-6 lg:py-7">
        <div className="grid gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
          <DashboardMetric
            icon={IconSlideshow}
            label="Renders"
            value={isLoading ? null : (data?.slideshowsCount ?? renders.length)}
          />
          <DashboardMetric
            icon={IconAlertCircle}
            label="Outstanding actions"
            value={outstandingActionCount}
          />
          <div className="flex flex-wrap items-center gap-3 min-[420px]:col-span-2 lg:col-span-1 lg:justify-end">
            <Button
              variant="softControl"
              size="appDefault"
              onClick={onOpenSchedule}
            >
              <IconCalendarEvent className="size-4" />
              Schedule
            </Button>
            <Button
              variant="softControl"
              size="appDefault"
              onClick={onOpenCollections}
            >
              <IconPhoto className="size-4" />
              Collections
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-4 max-w-[1210px] sm:mt-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-y-2">
          <h2 className="text-[20px] font-semibold tracking-[-0.025em] text-app-text">
            Renders
          </h2>
          {totalPages > 1 ? (
            <div className="flex items-center gap-2 text-[13px] font-semibold text-[#6f7888] sm:gap-3 sm:text-[14px]">
              <Button
                variant="iconControl"
                size="icon-control"
                aria-label="Previous page"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <IconChevronLeft className="size-4" />
              </Button>
              Page {safePage} of {totalPages}
              <Button
                variant="iconControl"
                size="icon-control"
                aria-label="Next page"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <IconChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </div>

        {pagedRenders.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {pagedRenders.map((item) => (
              <RenderCard
                key={item.id}
                item={item}
                onOpen={() => setSelectedId(item.id)}
              />
            ))}
          </div>
        ) : isLoading ? (
          <HomeCardSkeletonRow />
        ) : error ? (
          <HomeLoadError
            message={getApiErrorMessage(error, "Failed to load renders")}
            onRetry={() => void mutateRenders()}
          />
        ) : (
          <div className="grid min-h-[86px] place-items-center text-center text-[16px] font-medium text-app-muted-text">
            No renders yet. Submit a slideshow spec through the API or MCP to
            render one.
          </div>
        )}
      </section>

      {selected ? (
        <SlideshowPublishActions slideshow={selected}>
          {(actions) => (
            <SlideshowViewerModal
              title={selected.title || "Slideshow"}
              slideshows={[viewerItem(selected)]}
              initialSlideshowId={selected.id}
              details={{
                creationDate: formatDate(selected.created_at),
                postDate: "Not scheduled",
                language: "English",
              }}
              actions={actions}
              onDelete={() => deleteRender(selected.id)}
              onUpdateMetadata={(_, metadata) =>
                updateMetadata(selected, metadata)
              }
              onClose={() => setSelectedId(null)}
            />
          )}
        </SlideshowPublishActions>
      ) : null}
    </div>
  )
}

function viewerItem(slideshow: HomeSlideshow): SlideshowViewerItem {
  const cacheKey = slideshow.updated_at
  return {
    id: slideshow.id,
    label: formatDate(slideshow.created_at) || "Slideshow",
    title: slideshow.title || "Slideshow",
    caption: slideshow.caption,
    hashtags: slideshow.hashtags,
    slides: renderedSlideUrls(slideshow).map((imageUrl, index) => ({
      id: `${slideshow.id}-${index}`,
      imageUrl: cacheBustedImageUrl(imageUrl, cacheKey),
      text:
        slideshow.images?.[index]?.textItems
          ?.map((item) => item.text?.trim())
          .filter(Boolean)
          .join(" ") ?? "",
      section: index === 0 ? "hook" : "content",
    })),
  }
}

function renderedSlideUrls(slideshow: HomeSlideshow) {
  const rendered = (slideshow.output_images ?? [])
    .map((url) => url.trim())
    .filter(Boolean)
  if (rendered.length > 0) return rendered
  return (slideshow.images ?? [])
    .map((image) => image.image_url?.trim() ?? "")
    .filter(Boolean)
}

function cacheBustedImageUrl(imageUrl: string, updatedAt?: string) {
  if (!updatedAt) return imageUrl
  const separator = imageUrl.includes("?") ? "&" : "?"
  return `${imageUrl}${separator}v=${encodeURIComponent(updatedAt)}`
}

function timestamp(slideshow: HomeSlideshow) {
  const value = slideshow.created_at || slideshow.updated_at
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function formatDate(value?: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function HomeLoadError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className="grid min-h-[110px] place-items-center rounded-[8px] border border-red-200 bg-red-50 px-4 text-center">
      <div>
        <p className="text-[13px] font-semibold text-red-700">{message}</p>
        <Button
          className="mt-3"
          variant="outline"
          size="compact"
          onClick={onRetry}
        >
          Try again
        </Button>
      </div>
    </div>
  )
}

function HomeCardSkeletonRow() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="aspect-[4/5] animate-pulse rounded-[9px] bg-[#e8e7e1]"
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

function RenderCard({
  item,
  onOpen,
}: {
  item: HomeSlideshow
  onOpen: () => void
}) {
  const coverUrl = renderedSlideUrls(item)[0]
  const failed = item.status === "failed"
  const title = item.title || "Slideshow"

  return (
    <div className="relative rounded-[10px]">
      <span
        className={cn(
          "absolute top-2 right-2 z-20 rounded-full px-2 py-1 text-[10px] font-semibold text-white",
          failed ? "bg-app-danger" : "bg-black/75"
        )}
      >
        {failed ? "Render failed" : "Rendered"}
      </span>
      <MediaCardShell danger={failed}>
        {failed ? (
          <MediaFrame>
            <GenerationFailurePlaceholder message="This slideshow could not be rendered." />
          </MediaFrame>
        ) : (
          <button
            type="button"
            className="block w-full text-left"
            onClick={onOpen}
            aria-label={`Open ${title}`}
          >
            <MediaFrame>
              {coverUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- Rendered slides are already image artifacts. */
                <img
                  src={cacheBustedImageUrl(coverUrl, item.updated_at)}
                  alt={`${title} first slide`}
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="app-media-poster-fallback absolute inset-0" />
              )}
            </MediaFrame>
          </button>
        )}
      </MediaCardShell>
      <div className="mt-2 truncate px-0.5 text-[13px] font-semibold text-app-text">
        {title}
      </div>
    </div>
  )
}

function DashboardMetric({
  className,
  icon: Icon,
  label,
  value,
}: {
  className?: string
  icon: ComponentType<{ className?: string }>
  label: string
  value: string | number | null
}) {
  return (
    <div
      className={cn(
        "flex min-h-[86px] items-center gap-3 rounded-[12px] border border-app-panel-border bg-app-surface px-4 py-3 shadow-sm",
        className
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-app-strong/10 text-app-strong">
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] leading-4 font-semibold tracking-[0.08em] text-app-text-faint uppercase">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[17px] leading-6 font-semibold tracking-[-0.025em] text-app-text">
          {value === null ? (
            <span
              className="inline-block h-4 w-16 animate-pulse rounded bg-app-control-hover"
              aria-label={`${label} loading`}
            />
          ) : (
            value
          )}
        </span>
      </span>
    </div>
  )
}
