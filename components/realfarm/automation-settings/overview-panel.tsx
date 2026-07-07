import { useState } from "react"
import { IconBug, IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react"
import { Pencil } from "lucide-react"

import { AutomationThumb, AvatarDot } from "@/components/realfarm/shared-media"
import { SocialAccountStatusRow } from "@/components/realfarm/social-account-status"
import { AppModal, AppModalPanel } from "@/components/ui/modal"
import type { Automation } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

import {
  automationRunSlides,
  formatRunDate,
  formatRunDuration,
  formatRunSchedule,
  ratioToCss,
  runDurationSeconds,
  runScheduleDurationLine,
  runStatusBadgeClass,
  runStatusLabel,
  slideshowCaption,
  slideshowTitle,
} from "./run-helpers"
import type { AutomationRunApiRecord } from "./types"

export function AutomationOverviewPanel({
  automation,
  editingName,
  draftName,
  recentRuns,
  onDraftNameChange,
  onStartNameEdit,
  onSaveName,
  onCancelNameEdit,
}: {
  automation: Automation
  editingName: boolean
  draftName: string
  recentRuns: AutomationRunApiRecord[]
  onDraftNameChange: (value: string) => void
  onStartNameEdit: () => void
  onSaveName: () => void
  onCancelNameEdit: () => void
}) {
  const [viewerRun, setViewerRun] = useState<AutomationRunApiRecord | null>(
    null
  )
  const [debugRun, setDebugRun] = useState<AutomationRunApiRecord | null>(null)

  return (
    <div className="min-h-full bg-white">
      <div className="h-[106px] bg-gradient-to-r from-[#90464b] via-[#9a707d] to-[#94a1b0]" />
      <div className="px-6 pb-8">
        <div className="-mt-8 flex justify-center">
          <AvatarDot
            name={automation.name}
            index={12}
            className="size-16 border-4 border-white"
          />
        </div>
        <div className="mt-4 flex justify-center">
          {editingName ? (
            <input
              className="h-9 min-w-[260px] rounded-[7px] border border-[#d8d7cf] bg-white px-3 text-center text-[19px] font-semibold ring-2 ring-app-action/20 outline-none"
              value={draftName}
              autoFocus
              onChange={(event) => onDraftNameChange(event.target.value)}
              onBlur={onSaveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSaveName()
                }
                if (event.key === "Escape") {
                  onCancelNameEdit()
                }
              }}
            />
          ) : (
            <div className="flex max-w-full items-center justify-center gap-2">
              <h2 className="truncate text-center text-[19px] font-bold text-[#20201d]">
                {automation.name}
              </h2>
              <button
                className="grid size-6 place-items-center rounded-full text-[#9a9991] hover:bg-[#f1f0eb] hover:text-[#242421]"
                onClick={onStartNameEdit}
                aria-label="Edit automation name"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="mx-auto mt-4 grid max-w-[494px] grid-cols-4 overflow-hidden rounded-[10px] border border-[#e2e1da]">
          {[
            ["0", "Views"],
            ["0", "Likes"],
            ["0", "Bookmarks"],
            ["0.0%", "Engagement"],
          ].map(([value, label]) => (
            <div
              key={label}
              className="border-r border-[#e2e1da] px-4 py-3 text-center last:border-r-0"
            >
              <div className="text-[18px] font-bold text-[#171714]">
                {value}
              </div>
              <div className="mt-1 text-[11px] font-medium text-[#77766f]">
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-5 max-w-[494px]">
          <button className="mb-3 flex items-center gap-1 text-[14px] font-bold text-[#242421]">
            Recent
            <IconChevronRight className="size-4 rotate-90" />
          </button>
          {recentRuns.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recentRuns.slice(0, 3).map((run, index) => (
                <AutomationRecentRunCard
                  key={run.id}
                  run={run}
                  theme={automation.theme}
                  index={index}
                  onOpen={() => setViewerRun(run)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[8px] border border-dashed border-[#d8d7cf] bg-[#f8f8f4] px-4 py-6 text-center text-[13px] font-semibold text-[#77766f]">
              No generated slideshows yet.
            </div>
          )}
        </div>
      </div>
      {viewerRun && (
        <AutomationGeneratedSlideshowViewer
          run={viewerRun}
          onClose={() => setViewerRun(null)}
          onDebug={() => setDebugRun(viewerRun)}
        />
      )}
      {debugRun && (
        <AutomationRunDebugModal
          run={debugRun}
          onClose={() => setDebugRun(null)}
        />
      )}
    </div>
  )
}

function AutomationRecentRunCard({
  run,
  theme,
  index,
  onOpen,
}: {
  run: AutomationRunApiRecord
  theme: string
  index: number
  onOpen: () => void
}) {
  const slides = automationRunSlides(run)
  const firstSlide = slides[0]
  const title = slideshowTitle(run)
  const thumbnailUrl = run.thumbnailUrl?.trim() || firstSlide?.imageUrl

  return (
    <article className="w-[150px] shrink-0">
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[6px] bg-[#111] shadow-sm">
        <button
          type="button"
          className="absolute inset-0 text-left"
          onClick={onOpen}
          aria-label={`Open generated slideshow ${title}`}
        >
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <AutomationThumb theme={theme} index={index} />
          )}
          <span
            className={cn(
              "absolute top-2 right-2 rounded-full px-2 py-1 text-[10px] font-bold shadow-sm",
              runStatusBadgeClass(run.status)
            )}
          >
            {runStatusLabel(run.status)}
          </span>
          {run.videoUrl ? (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
              Video
            </span>
          ) : null}
        </button>
      </div>
      <SocialAccountStatusRow
        items={run.socialStatuses ?? []}
        size="compact"
        className="mt-2"
        emptyLabel="No accounts"
      />
      <div className="mt-2 truncate text-[11px] font-semibold text-[#77766f]">
        {runScheduleDurationLine(run)}
      </div>
    </article>
  )
}

function AutomationGeneratedSlideshowViewer({
  run,
  onClose,
  onDebug,
}: {
  run: AutomationRunApiRecord
  onClose: () => void
  onDebug: () => void
}) {
  const slides = automationRunSlides(run)
  const [activeSlide, setActiveSlide] = useState(0)
  const activeSlideIndex = Math.min(activeSlide, Math.max(0, slides.length - 1))
  const activeSlideRecord = slides[activeSlideIndex] ?? slides[0]
  const canGoPrev = activeSlideIndex > 0
  const canGoNext = activeSlideIndex < slides.length - 1

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="h-[min(680px,90vh)] max-w-[920px] overflow-hidden rounded-[10px] bg-white">
        <header className="flex h-[60px] items-center justify-between border-b border-[#d7d6d0] bg-white px-3">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-semibold text-[#242421]">
              {slideshowTitle(run)}
            </h2>
            <div className="truncate text-[12px] font-medium text-[#77766f]">
              {runScheduleDurationLine(run)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="grid size-8 place-items-center rounded-[5px] text-[#77766f] hover:bg-[#f1f0eb]"
              onClick={onDebug}
              aria-label="Show generation debug prompt"
            >
              <IconBug className="size-4" />
            </button>
            <button
              className="grid size-8 place-items-center rounded-[5px] text-[#77766f] hover:bg-[#f1f0eb]"
              onClick={onClose}
              aria-label="Close generated slideshow"
            >
              <IconX className="size-5" />
            </button>
          </div>
        </header>
        <main className="grid h-[calc(100%-60px)] gap-5 overflow-y-auto bg-[#f7f7f4] p-5 lg:grid-cols-[280px_1fr]">
          <section className="min-w-0">
            <div
              className="relative overflow-hidden rounded-[9px] bg-black shadow-xl"
              style={{
                aspectRatio: ratioToCss(activeSlideRecord?.aspectRatio),
              }}
            >
              {activeSlideRecord?.imageUrl ? (
                <img
                  src={activeSlideRecord.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <AutomationThumb theme="blue" index={0} />
              )}
              <span
                className={cn(
                  "absolute top-2 right-2 rounded-full px-2 py-1 text-[10px] font-bold shadow-sm",
                  runStatusBadgeClass(run.status)
                )}
              >
                {runStatusLabel(run.status)}
              </span>
              {slides.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="absolute top-1/2 left-2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/88 text-[#242421] shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={() =>
                      setActiveSlide((value) => Math.max(0, value - 1))
                    }
                    disabled={!canGoPrev}
                    aria-label="Previous slide"
                  >
                    <IconChevronLeft className="size-5" />
                  </button>
                  <button
                    type="button"
                    className="absolute top-1/2 right-2 z-10 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white/88 text-[#242421] shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-35"
                    onClick={() =>
                      setActiveSlide((value) =>
                        Math.min(slides.length - 1, value + 1)
                      )
                    }
                    disabled={!canGoNext}
                    aria-label="Next slide"
                  >
                    <IconChevronRight className="size-5" />
                  </button>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-3 pt-8 pb-2 text-center text-[12px] font-bold text-white">
                    Slide {activeSlideIndex + 1} of {slides.length}
                  </div>
                </>
              ) : null}
            </div>
            <div className="mt-2 text-[12px] font-semibold text-[#6f6e69]">
              {runScheduleDurationLine(run)}
            </div>
            {run.videoUrl ? (
              <div className="mt-4 overflow-hidden rounded-[9px] border border-[#d8d7cf] bg-black">
                <video
                  src={run.videoUrl}
                  poster={run.thumbnailUrl}
                  controls
                  className="block aspect-[4/5] w-full bg-black object-contain"
                  preload="metadata"
                />
              </div>
            ) : null}
          </section>

          <section className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-[10px] border border-[#e1e0d8] bg-white p-4">
              <AutomationRunDetail
                label="Status"
                value={runStatusLabel(run.status)}
              />
              <AutomationRunDetail
                label="Post timing"
                value={formatRunSchedule(run.scheduledFor)}
              />
              <AutomationRunDetail
                label="Duration"
                value={formatRunDuration(runDurationSeconds(run))}
              />
              <AutomationRunDetail label="Slides" value={`${slides.length}`} />
              <AutomationRunDetail
                label="Created"
                value={formatRunDate(run.createdAt)}
              />
              <AutomationRunDetail
                label="Type"
                value={run.plan?.publishType || "slideshow"}
              />
              <AutomationRunDetail
                label="Language"
                value={run.plan?.language || "default"}
              />
              <AutomationRunDetail
                label="Current slide"
                value={slides.length ? `Slide ${activeSlideIndex + 1}` : "None"}
              />
            </div>
            <div className="rounded-[10px] border border-[#e1e0d8] bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-[12px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
                  Account status
                </div>
                <div className="text-[12px] font-semibold text-[#77766f]">
                  {(run.socialStatuses ?? []).length} accounts
                </div>
              </div>
              <SocialAccountStatusRow
                items={run.socialStatuses ?? []}
                showLabels
                emptyLabel="No social accounts selected"
              />
            </div>
            <div className="rounded-[10px] border border-[#e1e0d8] bg-white p-4">
              <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
                Title
              </div>
              <p className="text-[14px] leading-6 font-medium text-[#333]">
                {slideshowTitle(run)}
              </p>
            </div>
            <div className="rounded-[10px] border border-[#e1e0d8] bg-white p-4">
              <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
                Caption
              </div>
              <p className="text-[14px] leading-6 font-medium text-[#333]">
                {slideshowCaption(run)}
              </p>
            </div>
            {run.plan?.hashtags ? (
              <div className="rounded-[10px] border border-[#e1e0d8] bg-white p-4">
                <div className="mb-2 text-[12px] font-bold tracking-[0.08em] text-[#77766f] uppercase">
                  Hashtags
                </div>
                <p className="text-[14px] leading-6 font-medium text-[#333]">
                  {run.plan.hashtags}
                </p>
              </div>
            ) : null}
            {run.error ? (
              <div className="rounded-[10px] border border-[#f0c7c7] bg-[#fff6f6] p-4 text-[13px] font-semibold text-[#b73737]">
                {run.error}
              </div>
            ) : null}
          </section>
        </main>
      </AppModalPanel>
    </AppModal>
  )
}

function AutomationRunDetail({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold tracking-[0.08em] text-[#9a9991] uppercase">
        {label}
      </div>
      <div className="mt-1 truncate text-[13px] font-semibold text-[#242421]">
        {value}
      </div>
    </div>
  )
}

function AutomationRunDebugModal({
  run,
  onClose,
}: {
  run: AutomationRunApiRecord
  onClose: () => void
}) {
  const promptDebug = run.plan?.debug?.textModelPrompt
  const promptDebugText = promptDebug
    ? JSON.stringify(promptDebug, null, 2)
    : "No text model prompt was sent."

  return (
    <AppModal onClose={onClose}>
      <AppModalPanel className="max-w-[720px] rounded-[8px] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-bold text-[#242421]">
              Generation debug
            </h2>
            <div className="text-[12px] font-medium text-[#77766f]">
              Model: {run.plan?.textModel || "not run"} · Source hook #
              {(run.plan?.debug?.selectedHookIndex ?? 0) + 1}
            </div>
          </div>
          <button
            className="grid size-8 place-items-center rounded-[5px] text-[#77766f] hover:bg-[#f1f0eb]"
            onClick={onClose}
            aria-label="Close generation debug"
          >
            <IconX className="size-5" />
          </button>
        </div>
        {run.plan?.hookCandidates?.length ? (
          <div className="mb-3 rounded-[6px] bg-[#f7f7f3] p-3 text-[12px] font-medium text-[#555]">
            {run.plan.hookCandidates.join(" | ")}
          </div>
        ) : null}
        <pre className="max-h-[420px] overflow-auto rounded-[6px] bg-[#1f201d] p-3 text-[11px] leading-4 whitespace-pre-wrap text-white">
          {promptDebugText}
        </pre>
      </AppModalPanel>
    </AppModal>
  )
}


