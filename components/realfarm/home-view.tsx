"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
  IconPlayerPlay,
  IconPlus,
  IconSlideshow,
  IconTrash,
  IconVideo,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  TemplateGeneratedPreview,
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
import { ExampleSlideshowModal } from "@/components/realfarm/example-slideshow-modal"
import { GeneratedSlideshowViewerModal } from "@/components/realfarm/automation-settings/generated-slideshow-viewer"
import type { AutomationRunApiRecord } from "@/components/realfarm/automation-settings/types"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"
import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import type { Automation, RealFarmData } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

import { useVideoThumbnailFrame } from "./use-video-thumbnail-frame"

const ITEMS_PER_PAGE = 5
const QUICK_START_ITEMS_PER_PAGE = 6

export function CreatorsView() {
  return (
    <div className="mx-auto max-w-[1160px]">
      <h1 className="text-[24px] font-semibold">Creators</h1>
    </div>
  )
}

export function HomeView({
  currentUserId,
  templates,
  recentRunsByAutomationId,
  generatedRunsByAutomationId,
  generatedRunsLoading,
  generatedRunsError,
  onRetryGeneratedRuns,
  onCreate,
  onUseTemplate,
  onAutomations,
  onGenerationRunRemove,
}: {
  currentUserId: string
  data: RealFarmData
  templates: Automation[]
  recentRunsByAutomationId: Record<string, GeneratedShowcaseRun[]>
  generatedRunsByAutomationId: Record<string, GeneratedShowcaseRun[]>
  generatedRunsLoading?: boolean
  generatedRunsError?: string
  onRetryGeneratedRuns: () => void
  onCreate: () => void
  onUseTemplate: (automation: Automation) => void
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
  const [quickStartPage, setQuickStartPage] = useState(1)
  const [selectedExample, setSelectedExample] = useState<{
    automation: Automation
    slideshowId?: string
  } | null>(null)
  const [selectedGeneratedSlideshow, setSelectedGeneratedSlideshow] = useState<{
    runs: GeneratedShowcaseRun[]
    runId: string
  } | null>(null)
  const quickStartTemplates = templates
  const generatedSlideshowCards = generatedHomeSlideshowCards(
    generatedRunsByAutomationId
  )
  const selectedGeneratedRun = selectedGeneratedSlideshow?.runs.find(
    (run) => run.id === selectedGeneratedSlideshow.runId
  )

  const totalItems =
    activeTab === "slideshows" ? generatedSlideshowCards.length : videos.length
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const pagedGeneratedSlideshows = generatedSlideshowCards.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  )
  const pagedVideos = videos.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE
  )
  const quickStartTotalPages = Math.max(
    1,
    Math.ceil(quickStartTemplates.length / QUICK_START_ITEMS_PER_PAGE)
  )
  const safeQuickStartPage = Math.min(quickStartPage, quickStartTotalPages)
  const quickStartOffset = (safeQuickStartPage - 1) * QUICK_START_ITEMS_PER_PAGE
  const pagedQuickStartTemplates = quickStartTemplates.slice(
    quickStartOffset,
    quickStartOffset + QUICK_START_ITEMS_PER_PAGE
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

  return (
    <div className="mx-auto max-w-[1280px] pb-16">
      <div className="flex items-center gap-2.5 py-2 md:hidden">
        <span className="flex size-8 items-center justify-center overflow-hidden rounded-[9px]">
          <Image
            src="/brand/lumenclip-mark.png"
            alt=""
            width={32}
            height={32}
            className="size-8 object-contain"
          />
        </span>
        <span className="text-[16px] font-semibold tracking-[-0.03em] text-app-text">
          LumenClip
        </span>
      </div>
      <section className="py-10 text-center lg:py-14">
        <div className="mx-auto max-w-[980px]">
          <div className="lc-spectrum mx-auto mb-5 h-1 w-14 rounded-full" />
          <h1 className="mx-auto max-w-[17ch] text-[42px] leading-[0.98] font-semibold tracking-[-0.05em] text-app-text sm:text-[56px]">
            Turn creative sources into content that ships.
          </h1>
          <p className="mx-auto mt-5 max-w-[52ch] text-[16px] leading-6 font-medium text-app-muted-text">
            Save what works, build repeatable workflows, and keep every output
            ready for review.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button variant="action" size="appDefault" onClick={onCreate}>
              <IconPlus className="size-5" />
              New automation
            </Button>
            <Button
              variant="softControl"
              size="appDefault"
              onClick={onAutomations}
            >
              <IconPlayerPlay className="size-5" />
              View workflows
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-12 max-w-[1210px]">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              className={cn(
                "rounded-[7px] px-4 py-2 text-[14px] font-semibold transition",
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
                "rounded-[7px] px-4 py-2 text-[14px] font-semibold transition",
                activeTab === "videos"
                  ? "bg-app-strong text-white"
                  : "text-app-muted-text hover:bg-app-control-hover"
              )}
              onClick={() => switchTab("videos")}
            >
              Videos ({videos.length})
            </button>
          </div>
          <div className="flex items-center gap-3 text-[14px] font-semibold text-[#6f7888]">
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
        </div>

        {activeTab === "slideshows" && pagedGeneratedSlideshows.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {pagedGeneratedSlideshows.map((item) => (
              <GeneratedSlideshowCard
                key={item.slideshow.id}
                item={item}
                shared={Boolean(item.ownerId && item.ownerId !== currentUserId)}
                onOpen={() =>
                  setSelectedGeneratedSlideshow({
                    runs: item.runs,
                    runId: item.slideshow.id,
                  })
                }
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
            No generated slideshows yet. Run a slideshow automation to create
            one.
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

      <section className="mx-auto mt-24 max-w-[1210px]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[20px] font-semibold tracking-[-0.025em] text-app-text">
            Start from a proven workflow
          </h2>
          <div className="flex items-center gap-3 text-[14px] font-semibold text-[#6f7888]">
            <Button
              variant="iconControl"
              size="icon-control"
              aria-label="Previous quick start page"
              disabled={safeQuickStartPage <= 1}
              onClick={() => setQuickStartPage((p) => Math.max(1, p - 1))}
            >
              <IconChevronLeft className="size-4" />
            </Button>
            Page {safeQuickStartPage} of {quickStartTotalPages}
            <Button
              variant="iconControl"
              size="icon-control"
              aria-label="Next quick start page"
              disabled={safeQuickStartPage >= quickStartTotalPages}
              onClick={() =>
                setQuickStartPage((p) => Math.min(quickStartTotalPages, p + 1))
              }
            >
              <IconChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        {quickStartTemplates.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pagedQuickStartTemplates.map((automation, index) => (
              <QuickStartTemplateCard
                key={automation.id}
                automation={automation}
                index={quickStartOffset + index}
                slideshows={generatedExampleSlideshows(
                  recentRunsByAutomationId[automation.id]
                ).slice(0, 3)}
                onOpenSlideshow={(slideshowId) =>
                  setSelectedExample({ automation, slideshowId })
                }
                onUse={() => onUseTemplate(automation)}
              />
            ))}
          </div>
        ) : (
          <div className="grid min-h-[120px] place-items-center rounded-[7px] border border-dashed border-[#d7d6cf] bg-white/55 px-6 text-center text-[16px] font-medium text-app-muted-text">
            No templates available.
          </div>
        )}
      </section>
      {selectedExample ? (
        <ExampleSlideshowModal
          title={selectedExample.automation.name}
          runs={recentRunsByAutomationId[selectedExample.automation.id]}
          initialSlideshowId={selectedExample.slideshowId}
          onDeleted={onGenerationRunRemove}
          onClose={() => setSelectedExample(null)}
        />
      ) : null}
      {selectedGeneratedSlideshow && selectedGeneratedRun ? (
        <GeneratedSlideshowViewerModal
          run={selectedGeneratedRun as AutomationRunApiRecord}
          runs={selectedGeneratedSlideshow.runs as AutomationRunApiRecord[]}
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

type GeneratedHomeSlideshowCard = {
  ownerId?: string
  title: string
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

function GeneratedSlideshowCard({
  item,
  shared,
  onOpen,
}: {
  item: GeneratedHomeSlideshowCard
  shared: boolean
  onOpen: () => void
}) {
  const firstSlide = item.slideshow.slides[0]
  const failed = item.slideshow.status === "failed"

  return (
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
      <span
        className={cn(
          "absolute top-2 right-2 z-20 rounded-full px-2 py-1 text-[10px] font-semibold text-white",
          failed ? "bg-app-danger" : "bg-black/75"
        )}
      >
        {failed
          ? "Generation failed"
          : item.slideshow.status === "generating"
            ? "Generating"
            : "Not published"}
      </span>
      <MediaCardShell danger={failed}>
        {failed ? (
          <MediaFrame>
            <GenerationFailurePlaceholder
              message={
                item.slideshow.error || "This slideshow could not be generated."
              }
            />
          </MediaFrame>
        ) : (
          <button
            type="button"
            className="block w-full text-left"
            onClick={onOpen}
            aria-label={`Open ${item.title} generated slideshow`}
          >
            <MediaFrame>
              {firstSlide ? (
                /* eslint-disable-next-line @next/next/no-img-element -- Generated slides are already rendered image artifacts. */
                <img
                  src={firstSlide.imageUrl}
                  alt={firstSlide.text || `${item.title} first slide`}
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
    </div>
  )
}

function generatedHomeSlideshowCards(
  runsByAutomationId: Record<string, GeneratedShowcaseRun[]>
) {
  return Object.entries(runsByAutomationId)
    .flatMap<GeneratedHomeSlideshowCard>(([, runs]) => {
      const slideshows = generatedExampleSlideshows(runs, {
        includeFailed: true,
      })
      return slideshows.map((slideshow) => ({
        ownerId: runs.find((run) => run.id === slideshow.id)?.ownerId,
        title:
          runs
            .find((run) => run.id === slideshow.id)
            ?.automationTitle?.trim() || slideshow.title,
        runs,
        slideshow,
      }))
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

function QuickStartTemplateCard({
  automation,
  slideshows,
  index,
  onOpenSlideshow,
  onUse,
}: {
  automation: Automation
  slideshows: TemplateExampleSlideshow[]
  index: number
  onOpenSlideshow: (slideshowId: string) => void
  onUse: () => void
}) {
  const coverSlides = slideshows.map((slideshow) => slideshow.slides[0])

  return (
    <article className="overflow-hidden rounded-[7px] border border-app-panel-border bg-app-surface shadow-sm">
      <div className="h-[128px] w-full">
        <TemplateGeneratedPreview
          exampleSlides={coverSlides}
          className="h-full"
          index={index}
          onSelectSlide={(tileIndex) => {
            const slideshow = slideshows[tileIndex]
            if (slideshow) {
              onOpenSlideshow(slideshow.id)
            }
          }}
          selectLabel={`Open ${automation.name} slideshow`}
        />
      </div>
      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-bold text-[#30302e]">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {automation.automationKind === "video" ? (
                <IconVideo className="size-4 shrink-0 text-[#67665f]" />
              ) : (
                <IconSlideshow className="size-4 shrink-0 text-[#67665f]" />
              )}
              <span className="truncate">{automation.name}</span>
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-[#8a8a83]">
            {automation.automationKind === "video" ? (
              <IconPlayerPlay className="size-3.5" />
            ) : (
              <IconPhoto className="size-3.5" />
            )}
            {automation.automationKind === "video"
              ? "Video automation"
              : "Slideshow automation"}
          </div>
        </div>
        <Button variant="softControl" size="sm" onClick={onUse}>
          Use
        </Button>
      </div>
    </article>
  )
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
