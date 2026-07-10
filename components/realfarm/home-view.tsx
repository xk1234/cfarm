"use client"

import { useEffect, useRef, useState } from "react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
  IconPlayerPlay,
  IconPlus,
  IconSlideshow,
  IconVideo,
} from "@tabler/icons-react"

import {
  TemplateGeneratedPreview,
  generatedExampleSlideshows,
  type GeneratedShowcaseRun,
  type TemplateExampleSlideshow,
} from "@/components/realfarm/template-showcase-preview"
import {
  MediaCardShell,
  MediaFrame,
  MediaPendingState,
} from "@/components/realfarm/shared-media"
import { ExampleSlideshowModal } from "@/components/realfarm/example-slideshow-modal"
import { Button } from "@/components/ui/button"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import type { GeneratedVideoExport } from "@/lib/generated-video-types"
import type { Automation, RealFarmData } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

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
  templates,
  recentRunsByAutomationId,
  generatedRunsByAutomationId,
  onCreate,
  onUseTemplate,
  onAutomations,
}: {
  data: RealFarmData
  templates: Automation[]
  recentRunsByAutomationId: Record<string, GeneratedShowcaseRun[]>
  generatedRunsByAutomationId: Record<string, GeneratedShowcaseRun[]>
  onCreate: () => void
  onUseTemplate: (automation: Automation) => void
  onAutomations: () => void
}) {
  const [activeTab, setActiveTab] = useState<"slideshows" | "videos">(
    "slideshows"
  )
  const [videos, setVideos] = useState<GeneratedVideoExport[]>([])
  const [page, setPage] = useState(1)
  const [quickStartPage, setQuickStartPage] = useState(1)
  const [selectedExample, setSelectedExample] = useState<{
    automation: Automation
    slideshowId?: string
  } | null>(null)
  const [selectedGeneratedSlideshow, setSelectedGeneratedSlideshow] =
    useState<{
      title: string
      runs: GeneratedShowcaseRun[]
      slideshowId: string
    } | null>(null)
  const quickStartTemplates = templates
  const generatedSlideshowCards = generatedHomeSlideshowCards(
    generatedRunsByAutomationId
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
    let active = true

    async function loadGeneratedVideos() {
      try {
        const payload = await fetchJsonWithTimeout<{
          exports?: GeneratedVideoExport[]
        }>("/api/generated-videos", {
          timeoutMs: 12_000,
          toastOnError: false,
        })
        if (active) {
          setVideos(payload?.exports ?? [])
        }
      } catch {
        if (active) {
          setVideos([])
        }
      }
    }

    void loadGeneratedVideos()

    return () => {
      active = false
    }
  }, [])

  function switchTab(tab: "slideshows" | "videos") {
    setActiveTab(tab)
    setPage(1)
  }

  return (
    <div className="mx-auto max-w-[1260px] pb-12">
      <section className="py-16 text-center">
        <h1 className="text-[24px] font-semibold tracking-normal text-[#30302e]">
          Welcome, UU odi
        </h1>
        <p className="mt-2 text-[14px] leading-5 font-medium text-[#888883]">
          use AI to generate TikTok videos that don&apos;t feel like AI
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Button variant="action" size="appDefault" onClick={onCreate}>
            <IconPlus className="size-5" />
            New Automation
          </Button>
          <Button
            variant="softControl"
            size="appDefault"
            onClick={onAutomations}
          >
            <IconPlayerPlay className="size-5" />
            Automations
          </Button>
        </div>
      </section>

      <section className="mx-auto mt-20 max-w-[1210px]">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              className={cn(
                "rounded-[7px] px-4 py-2 text-[14px] font-semibold transition",
                activeTab === "slideshows"
                  ? "bg-[#242421] text-white"
                  : "text-[#6f7888] hover:bg-[#ecebe4]"
              )}
              onClick={() => switchTab("slideshows")}
            >
              Slideshows ({generatedSlideshowCards.length})
            </button>
            <button
              className={cn(
                "rounded-[7px] px-4 py-2 text-[14px] font-semibold transition",
                activeTab === "videos"
                  ? "bg-[#242421] text-white"
                  : "text-[#6f7888] hover:bg-[#ecebe4]"
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
                onOpen={() =>
                  setSelectedGeneratedSlideshow({
                    title: item.title,
                    runs: item.runs,
                    slideshowId: item.slideshow.id,
                  })
                }
              />
            ))}
          </div>
        ) : activeTab === "slideshows" ? (
          <div className="grid min-h-[86px] place-items-center text-[16px] font-medium text-[#667085]">
            No generated slideshows yet. Run a slideshow automation to create
            one.
          </div>
        ) : pagedVideos.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            {pagedVideos.map((item) => (
              <VideoCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="grid min-h-[86px] place-items-center text-[16px] font-medium text-[#667085]">
            No videos yet. Generate a video from the Greenscreen or UGC Ads
            editors.
          </div>
        )}
      </section>

      <section className="mx-auto mt-24 max-w-[1210px]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-[19px] font-bold text-[#30302e]">Quick start</h2>
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
          <div className="grid min-h-[120px] place-items-center rounded-[7px] border border-dashed border-[#d7d6cf] bg-white/55 px-6 text-center text-[16px] font-medium text-[#667085]">
            No templates available.
          </div>
        )}
      </section>
      {selectedExample ? (
        <ExampleSlideshowModal
          title={selectedExample.automation.name}
          runs={recentRunsByAutomationId[selectedExample.automation.id]}
          initialSlideshowId={selectedExample.slideshowId}
          onClose={() => setSelectedExample(null)}
        />
      ) : null}
      {selectedGeneratedSlideshow ? (
        <ExampleSlideshowModal
          title={selectedGeneratedSlideshow.title}
          runs={selectedGeneratedSlideshow.runs}
          initialSlideshowId={selectedGeneratedSlideshow.slideshowId}
          onClose={() => setSelectedGeneratedSlideshow(null)}
        />
      ) : null}
    </div>
  )
}

type GeneratedHomeSlideshowCard = {
  title: string
  runs: GeneratedShowcaseRun[]
  slideshow: TemplateExampleSlideshow
}

function GeneratedSlideshowCard({
  item,
  onOpen,
}: {
  item: GeneratedHomeSlideshowCard
  onOpen: () => void
}) {
  const coverSlides = item.slideshow.slides.slice(0, 3)
  const generatedAt = formatGeneratedSlideshowDate(
    item.slideshow.createdAt || item.slideshow.scheduledFor
  )

  return (
    <MediaCardShell>
      <button
        type="button"
        className="block w-full text-left"
        onClick={onOpen}
        aria-label={`Open ${item.title} generated slideshow`}
      >
        <div className="h-[172px] w-full">
          <TemplateGeneratedPreview
            exampleSlides={coverSlides}
            className="h-full"
            selectLabel={`Open ${item.title} slideshow`}
          />
        </div>
        <div className="px-3 py-3">
          <div className="truncate text-[15px] font-bold text-[#30302e]">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <IconSlideshow className="size-4 shrink-0 text-[#67665f]" />
              <span className="truncate">{item.title}</span>
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-[#8a8a83]">
            <IconPhoto className="size-3.5" />
            {generatedAt || item.slideshow.slides.length + " slides"}
          </div>
        </div>
      </button>
    </MediaCardShell>
  )
}

function generatedHomeSlideshowCards(
  runsByAutomationId: Record<string, GeneratedShowcaseRun[]>
) {
  return Object.entries(runsByAutomationId)
    .flatMap<GeneratedHomeSlideshowCard>(([, runs]) => {
      const slideshows = generatedExampleSlideshows(runs)
      return slideshows.map((slideshow) => ({
        title:
          runs.find((run) => run.id === slideshow.id)?.automationTitle?.trim() ||
          slideshow.title,
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

function formatGeneratedSlideshowDate(value?: string) {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    return ""
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
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
    <article className="overflow-hidden rounded-[7px] border border-[#deddd5] bg-white shadow-sm">
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

function VideoCard({ item }: { item: GeneratedVideoExport }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const isPending =
    !item.videoUrl && (item.status === "queued" || item.status === "processing")

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
      <MediaCardShell>
        <MediaPendingState label="Creating hook video..." />
      </MediaCardShell>
    )
  }

  return (
    <MediaCardShell>
      <MediaFrame>
        {item.videoUrl ? (
          <>
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              src={item.videoUrl}
              muted
              playsInline
              preload="metadata"
              onEnded={() => setPlaying(false)}
            />
            <button
              className="absolute inset-0 z-10 flex items-center justify-center"
              onClick={togglePlay}
              aria-label={playing ? "Pause video" : "Play video"}
            >
              {!playing && (
                <div className="grid size-14 place-items-center rounded-full bg-black/50 backdrop-blur-sm transition hover:bg-black/60">
                  <IconPlayerPlay className="size-7 text-white" fill="white" />
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
  )
}
