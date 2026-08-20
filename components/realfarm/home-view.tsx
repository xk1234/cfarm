"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import dynamic from "next/dynamic"
import {
  IconAlertCircle,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconPlayerPlay,
  IconTrash,
  IconTemplate,
} from "@tabler/icons-react"
import { toast } from "sonner"
import useSWR from "swr"

import {
  generatedExampleSlideshows,
  type GeneratedShowcaseRun,
  type TemplateExampleSlideshow,
} from "@/components/realfarm/template-showcase-preview"
import {
  GenerationFailurePlaceholder,
  MediaCardShell,
  MediaFrame,
  MediaPendingState,
} from "@/components/realfarm/shared-media"
import { AutomationRecentRunCard } from "@/components/realfarm/automation-settings/automation-recent-run-card"
import type { AutomationRunApiRecord } from "@/components/realfarm/automation-settings/types"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import { clientSWRFetcher } from "@/lib/client-swr"
import { nextUpcomingAutomationPost } from "@/lib/automation-upcoming-posts"
import type { CalendarAlertSummary } from "@/lib/calendar-summary"
import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import type { Automation } from "@/lib/realfarm-data"
import { PostFrequencyGraph } from "@/components/realfarm/post-frequency-graph"
import { cn } from "@/lib/utils"

import { useVideoThumbnailFrame } from "./use-video-thumbnail-frame"

const ITEMS_PER_PAGE = 5

const loadGeneratedSlideshowViewer = () =>
  import("@/components/realfarm/automation-settings/generated-slideshow-viewer")

const GeneratedSlideshowViewerModal = dynamic(
  () =>
    loadGeneratedSlideshowViewer().then(
      (module) => module.GeneratedSlideshowViewerModal
    ),
  { loading: () => <ViewerLoadingModal /> }
)

export function HomeView({
  currentUserId,
  automations,
  automationsLoading,
  publishedPostDates,
  generatedRunsByAutomationId,
  generatedRunsLoading,
  generatedRunsError,
  onRetryGeneratedRuns,
  onAutomations,
  onGenerationRunRemove,
}: {
  currentUserId: string
  automations: Automation[]
  automationsLoading?: boolean
  /** When each LINKED post went out. Generated drafts are not posts. */
  publishedPostDates: string[]
  generatedRunsByAutomationId: Record<string, GeneratedShowcaseRun[]>
  generatedRunsLoading?: boolean
  generatedRunsError?: string
  onRetryGeneratedRuns: () => void
  onAutomations: () => void
  onGenerationRunRemove: (runId: string) => void
}) {
  const [activeTab, setActiveTab] = useState<"slideshows" | "videos">(
    "slideshows"
  )
  const [videos, setVideos] = useState<GeneratedVideoExport[]>([])
  const [videosLoading, setVideosLoading] = useState(true)
  const [videosLoaded, setVideosLoaded] = useState(false)
  const [videosError, setVideosError] = useState("")
  const [page, setPage] = useState(1)
  const { data: calendarStatus } = useSWR<{
    summary: CalendarAlertSummary
  }>("/api/calendar/summary", clientSWRFetcher, {
    refreshInterval: 10 * 60_000,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  })
  const [selectedGeneratedSlideshow, setSelectedGeneratedSlideshow] = useState<{
    runs: AutomationRunApiRecord[]
    runId: string
  } | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const activeAutomationCount = automations.filter(
    (automation) =>
      automation.status === "live" && automation.schedule?.paused !== true
  ).length
  const nextPost = useMemo(
    () => nextUpcomingAutomationPost(automations),
    [automations]
  )
  const outstandingActionCount = calendarStatus
    ? calendarStatus.summary.needsAction + calendarStatus.summary.failed
    : null
  const generatedSlideshowCards = useMemo(
    () => generatedHomeSlideshowCards(generatedRunsByAutomationId),
    [generatedRunsByAutomationId]
  )
  const selectedGeneratedRun = selectedGeneratedSlideshow?.runs.find(
    (run) => run.id === selectedGeneratedSlideshow.runId
  )

  const totalItems =
    activeTab === "slideshows" ? generatedSlideshowCards.length : videos.length
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pagedGeneratedSlideshows = useMemo(
    () =>
      generatedSlideshowCards.slice(
        (safePage - 1) * ITEMS_PER_PAGE,
        safePage * ITEMS_PER_PAGE
      ),
    [generatedSlideshowCards, safePage]
  )
  const pagedVideos = videos.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  )

  useEffect(() => {
    if (activeTab !== "videos" || videosLoaded) return
    let active = true

    async function loadGeneratedVideos() {
      try {
        const payload = await fetchJsonWithTimeout<{
          exports?: GeneratedVideoExport[]
        }>("/api/generated-videos?limit=50", {
          timeoutMs: 12_000,
          toastOnError: false,
        })
        if (active) {
          setVideos(payload?.exports ?? [])
          setVideosError("")
        }
      } catch (error) {
        if (active) {
          setVideosError(
            getApiErrorMessage(error, "Failed to load generated videos")
          )
        }
      } finally {
        if (active) {
          setVideosLoading(false)
          setVideosLoaded(true)
        }
      }
    }

    void loadGeneratedVideos()

    return () => {
      active = false
    }
  }, [activeTab, videosLoaded])

  function switchTab(tab: "slideshows" | "videos") {
    setActiveTab(tab)
    setPage(1)
  }

  async function openGeneratedSlideshow(item: GeneratedHomeSlideshowCard) {
    if (viewerLoading) return
    setViewerLoading(true)
    try {
      const [payload] = await Promise.all([
        fetchJsonWithTimeout<{ runs?: AutomationRunApiRecord[] }>(
          `/api/templates/runs?templateId=${encodeURIComponent(item.automationId)}&limit=100`,
          { timeoutMs: 12_000, toastOnError: false }
        ),
        loadGeneratedSlideshowViewer(),
      ])
      const runs = payload.runs ?? []
      const selectedRun = runs.find(
        (run) =>
          run.id === item.run.id || run.slideshowId === item.run.slideshowId
      )
      if (!selectedRun) {
        throw new Error("This slideshow is no longer available.")
      }
      setSelectedGeneratedSlideshow({ runs, runId: selectedRun.id })
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to open slideshow"))
    } finally {
      setViewerLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] pb-16">
      <h1 className="pt-5 text-[30px] leading-none font-semibold tracking-[-0.04em] text-app-text sm:pt-7">
        Home
      </h1>
      <section className="py-7 text-center sm:py-10 lg:py-14">
        <div className="mx-auto max-w-[1100px]">
          <div className="lc-spectrum mx-auto mb-5 h-1 w-14 rounded-full" />
          <div className="grid items-stretch gap-7 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-10">
            {/* Cadence, not a tagline: the gaps are the useful signal here. */}
            <PostFrequencyGraph
              dates={publishedPostDates}
              className="min-w-0 lg:mx-0"
            />
            <div className="grid grid-cols-2 gap-2 text-left sm:grid-cols-3 lg:grid-cols-1">
              <DashboardMetric
                className="col-span-2 sm:col-span-1"
                icon={IconClock}
                label="Next expected post"
                value={
                  automationsLoading
                    ? null
                    : (nextPost?.label ?? "Nothing scheduled")
                }
                title={nextPost?.scheduledAt}
              />
              <DashboardMetric
                icon={IconTemplate}
                label="Scheduled templates"
                value={automationsLoading ? null : activeAutomationCount}
              />
              <DashboardMetric
                icon={IconAlertCircle}
                label="Outstanding actions"
                value={outstandingActionCount}
              />
            </div>
          </div>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button variant="action" size="appDefault" onClick={onAutomations}>
              <IconPlayerPlay className="size-5" />
              View templates
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-[1210px] sm:mt-12">
        {/* The tabs and the pager together overflow a phone on one row. */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              className={cn(
                "shrink-0 rounded-[7px] px-3 py-2 text-[13px] font-semibold transition sm:px-4 sm:text-[14px]",
                activeTab === "slideshows"
                  ? "bg-app-strong text-white"
                  : "text-app-muted-text hover:bg-app-control-hover"
              )}
              onClick={() => switchTab("slideshows")}
            >
              Slideshows ({generatedSlideshowCards.length})
            </button>
            <button
              className={cn(
                "shrink-0 rounded-[7px] px-3 py-2 text-[13px] font-semibold transition sm:px-4 sm:text-[14px]",
                activeTab === "videos"
                  ? "bg-app-strong text-white"
                  : "text-app-muted-text hover:bg-app-control-hover"
              )}
              onClick={() => switchTab("videos")}
            >
              Videos ({videos.length})
            </button>
          </div>
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

        {activeTab === "slideshows" && pagedGeneratedSlideshows.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {pagedGeneratedSlideshows.map((item) => (
              <AutomationRecentRunCard
                key={item.slideshow.id}
                run={item.run as unknown as AutomationRunApiRecord}
                mediaKind="slideshow"
                shared={Boolean(item.ownerId && item.ownerId !== currentUserId)}
                onOpen={() => void openGeneratedSlideshow(item)}
              />
            ))}
          </div>
        ) : activeTab === "slideshows" && generatedRunsLoading ? (
          <HomeCardSkeletonRow />
        ) : activeTab === "slideshows" && generatedRunsError ? (
          <HomeLoadError
            message={generatedRunsError}
            onRetry={onRetryGeneratedRuns}
          />
        ) : activeTab === "slideshows" ? (
          <div className="grid min-h-[86px] place-items-center text-[16px] font-medium text-app-muted-text">
            No generated slideshows yet. Generate one from a slideshow template.
          </div>
        ) : pagedVideos.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {pagedVideos.map((item) => (
              <VideoCard
                key={item.id}
                item={item}
                shared={Boolean(item.ownerId && item.ownerId !== currentUserId)}
                onDeleted={() =>
                  setVideos((current) =>
                    current.filter((video) => video.id !== item.id)
                  )
                }
              />
            ))}
          </div>
        ) : videosLoading ? (
          <HomeCardSkeletonRow />
        ) : videosError ? (
          <HomeLoadError
            message={videosError}
            onRetry={() => {
              setVideosLoaded(false)
              setVideosLoading(true)
            }}
          />
        ) : (
          <div className="grid min-h-[86px] place-items-center text-[16px] font-medium text-app-muted-text">
            No videos yet. Generate a video from the Greenscreen or UGC Ads
            editors.
          </div>
        )}
      </section>

      {selectedGeneratedSlideshow && selectedGeneratedRun ? (
        <GeneratedSlideshowViewerModal
          run={selectedGeneratedRun}
          runs={selectedGeneratedSlideshow.runs}
          allowDelete={
            !selectedGeneratedRun.ownerId ||
            selectedGeneratedRun.ownerId === currentUserId
          }
          onDeleted={(runId) => {
            onGenerationRunRemove(runId)
            setSelectedGeneratedSlideshow(null)
          }}
          onClose={() => setSelectedGeneratedSlideshow(null)}
        />
      ) : null}
      {viewerLoading ? <ViewerLoadingModal /> : null}
    </div>
  )
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

function ViewerLoadingModal() {
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/45 p-4"
      role="status"
      aria-label="Loading slideshow"
    >
      <div className="aspect-[9/16] h-[min(78vh,720px)] animate-pulse rounded-[10px] bg-[#242424] shadow-2xl" />
    </div>
  )
}

type GeneratedHomeSlideshowCard = {
  automationId: string
  ownerId?: string
  run: GeneratedShowcaseRun
  runs: GeneratedShowcaseRun[]
  slideshow: TemplateExampleSlideshow
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

function DashboardMetric({
  className,
  icon: Icon,
  label,
  value,
  title,
}: {
  className?: string
  icon: ComponentType<{ className?: string }>
  label: string
  value: string | number | null
  title?: string
}) {
  return (
    <div
      className={cn(
        "flex min-h-[86px] items-center gap-3 rounded-[12px] border border-app-panel-border bg-app-surface px-4 py-3 shadow-sm",
        className
      )}
      title={title}
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

function generatedHomeSlideshowCards(
  runsByAutomationId: Record<string, GeneratedShowcaseRun[]>
) {
  return Object.entries(runsByAutomationId)
    .flatMap<GeneratedHomeSlideshowCard>(([automationId, runs]) => {
      const slideshows = generatedExampleSlideshows(runs, {
        includeFailed: true,
      })
      return slideshows.flatMap<GeneratedHomeSlideshowCard>((slideshow) => {
        const run = runs.find((candidate) => candidate.id === slideshow.id)
        if (!run) return []
        return [
          {
            automationId,
            ownerId: run.ownerId,
            run,
            runs,
            slideshow,
          },
        ]
      })
    })
    .sort(
      (first, second) =>
        slideshowTimestamp(second.slideshow) -
        slideshowTimestamp(first.slideshow)
    )
}

function slideshowTimestamp(slideshow: TemplateExampleSlideshow) {
  const value = slideshow.createdAt || slideshow.scheduledFor
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

function VideoCard({
  item,
  shared,
  onDeleted,
}: {
  item: GeneratedVideoExport
  shared: boolean
  onDeleted: () => void
}) {
  const { videoRef, thumbnailReady } = useVideoThumbnailFrame(
    item.previewUrl ? undefined : item.videoUrl
  )
  const [playing, setPlaying] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const isPending =
    !item.videoUrl && (item.status === "queued" || item.status === "processing")
  const isFailed = !item.videoUrl && item.status === "failed"
  const canDelete = !shared && !item.deletionBlockedBy
  const deleteConfirmation = deleteOpen ? (
    <ConfirmDialog
      title="Delete this video?"
      description="This permanently removes the generated video and cannot be undone."
      confirmLabel="Delete video"
      pendingLabel="Deleting…"
      onCancel={() => setDeleteOpen(false)}
      onConfirm={deleteVideo}
    />
  ) : null

  async function deleteVideo() {
    if (!canDelete || deleting) return
    setDeleting(true)
    try {
      await toast.promise(
        fetchJsonWithTimeout(
          `/api/generated-videos/${encodeURIComponent(item.id)}`,
          {
            method: "DELETE",
            timeoutMs: 15_000,
            toastOnError: false,
          }
        ),
        {
          loading: "Deleting video…",
          success: "Video deleted",
          error: (error) =>
            getApiErrorMessage(error, "The video could not be deleted"),
        }
      )
      onDeleted()
    } catch {
      // toast.promise already presents the API error.
    } finally {
      setDeleting(false)
    }
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  if (isPending) {
    return (
      <>
        <div
          className={cn(
            "relative rounded-[10px]",
            shared && "ring-2 ring-[#6d28d9]/45 ring-offset-2"
          )}
        >
          {shared ? (
            <span className="absolute top-2 left-2 z-20 rounded-full bg-app-action px-2 py-1 text-[10px] font-semibold text-white">
              Shared
            </span>
          ) : null}
          {canDelete ? (
            <VideoDeleteButton
              deleting={deleting}
              onDelete={() => setDeleteOpen(true)}
            />
          ) : null}
          <MediaCardShell>
            <MediaPendingState label="Creating hook video..." />
          </MediaCardShell>
        </div>
        {deleteConfirmation}
      </>
    )
  }

  if (isFailed) {
    return (
      <>
        <div
          className={cn(
            "relative rounded-[10px]",
            shared && "ring-2 ring-[#6d28d9]/45 ring-offset-2"
          )}
        >
          {shared ? (
            <span className="absolute top-2 left-2 z-20 rounded-full bg-app-action px-2 py-1 text-[10px] font-semibold text-white">
              Shared
            </span>
          ) : null}
          {canDelete ? (
            <VideoDeleteButton
              deleting={deleting}
              onDelete={() => setDeleteOpen(true)}
            />
          ) : null}
          <MediaCardShell danger>
            <MediaFrame>
              <GenerationFailurePlaceholder
                message={item.error || "This video could not be generated."}
              />
            </MediaFrame>
          </MediaCardShell>
        </div>
        {deleteConfirmation}
      </>
    )
  }

  return (
    <>
      <div
        className={cn(
          "relative rounded-[10px]",
          shared && "ring-2 ring-[#6d28d9]/45 ring-offset-2"
        )}
      >
        {shared ? (
          <span className="absolute top-2 left-2 z-20 rounded-full bg-app-action px-2 py-1 text-[10px] font-semibold text-white">
            Shared
          </span>
        ) : null}
        {canDelete ? (
          <VideoDeleteButton
            deleting={deleting}
            onDelete={() => setDeleteOpen(true)}
          />
        ) : null}
        <MediaCardShell>
          <MediaFrame>
            {item.videoUrl ? (
              <>
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-cover"
                  src={item.videoUrl}
                  poster={item.previewUrl}
                  muted
                  playsInline
                  preload={item.previewUrl ? "none" : "metadata"}
                  onEnded={() => setPlaying(false)}
                />
                {!item.previewUrl && !thumbnailReady && !playing ? (
                  <div className="app-media-poster-fallback pointer-events-none absolute inset-0" />
                ) : null}
                <button
                  className="absolute inset-0 z-10 flex items-center justify-center"
                  onClick={togglePlay}
                  aria-label={playing ? "Pause video" : "Play video"}
                >
                  {!playing && (
                    <div className="grid size-14 place-items-center rounded-full bg-black/50 backdrop-blur-sm transition hover:bg-black/60">
                      <IconPlayerPlay
                        className="size-7 text-white"
                        fill="white"
                      />
                    </div>
                  )}
                </button>
              </>
            ) : item.previewUrl ? (
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${item.previewUrl})` }}
              />
            ) : (
              <div className="app-media-poster-fallback absolute inset-0" />
            )}
          </MediaFrame>
        </MediaCardShell>
      </div>
      {deleteConfirmation}
    </>
  )
}

function VideoDeleteButton({
  deleting,
  onDelete,
}: {
  deleting: boolean
  onDelete: () => void
}) {
  return (
    <Button
      type="button"
      variant="iconControl"
      size="icon-control-sm"
      className="absolute top-2 right-2 z-30 bg-white/90 text-app-danger-muted shadow-sm hover:bg-app-surface"
      onClick={onDelete}
      disabled={deleting}
      aria-label="Delete video"
      title="Delete video"
    >
      <IconTrash className="size-4" />
    </Button>
  )
}
