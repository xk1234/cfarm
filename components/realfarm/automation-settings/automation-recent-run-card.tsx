import { GeneratedVideoThumbnail } from "@/components/realfarm/generated-video-thumbnail"
import { GenerationFailurePlaceholder } from "@/components/realfarm/shared-media"
import { SocialAccountIconList } from "@/components/realfarm/social-account-status"
import { cn } from "@/lib/utils"

import { RunPublicationStatusBadge } from "./run-publication-status-badge"
import {
  automationRunSlides,
  formatRunDate,
  formatRunDuration,
  isGeneratingSlideshowRun,
  runDurationSeconds,
  runPublishedAt,
  runScheduledAt,
  slideshowTitle,
} from "./run-helpers"
import type { AutomationRunApiRecord } from "./types"

export function AutomationRecentRunCard({
  run,
  mediaKind,
  shared = false,
  onOpen,
}: {
  run: AutomationRunApiRecord
  mediaKind: "slideshow" | "video"
  shared?: boolean
  onOpen: () => void
}) {
  const slides = automationRunSlides(run)
  const firstSlide = slides[0]
  const title = slideshowTitle(run)
  const thumbnailUrl = run.thumbnailUrl?.trim() || firstSlide?.imageUrl
  const inFlight = isGeneratingSlideshowRun(run)
  const failed = run.status === "failed"
  const publishedAt = runPublishedAt(run)
  const scheduledAt = runScheduledAt(run)

  return (
    <article
      className={cn(
        "min-w-0 rounded-[8px]",
        shared && "ring-2 ring-[#6d28d9]/45 ring-offset-2"
      )}
    >
      <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[6px] bg-app-strong shadow-sm">
        <button
          type="button"
          className="absolute inset-0 text-left"
          disabled={failed}
          onClick={onOpen}
          aria-label={
            failed
              ? `${title} generation failed`
              : `Open generated ${mediaKind} ${title}`
          }
        >
          {failed ? (
            <GenerationFailurePlaceholder
              compact
              message={run.error || "This slideshow could not be generated."}
            />
          ) : inFlight ? (
            <span className="absolute inset-0 grid animate-pulse place-items-center bg-[#202020] px-3 text-center text-[11px] font-semibold text-white/80">
              <span>
                {run.progress?.stage ?? "Generating…"}
                {run.progress?.detail ? (
                  <span className="mt-1 block text-[10px] font-medium text-white/55">
                    {run.progress.detail}
                  </span>
                ) : null}
              </span>
            </span>
          ) : mediaKind === "video" && run.videoUrl ? (
            <GeneratedVideoThumbnail
              videoUrl={run.videoUrl}
              className="bg-black object-contain"
            />
          ) : thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Automation previews render generated/local asset URLs directly.
            <img
              src={thumbnailUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center bg-[#202020] px-3 text-center text-[11px] font-semibold text-white/65">
              No rendered image
            </span>
          )}
          {run.videoUrl ? (
            <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-white shadow-sm">
              Video
            </span>
          ) : null}
        </button>
        {shared ? (
          <span className="absolute top-2 left-2 z-20 rounded-full bg-app-action px-2 py-1 text-[10px] font-semibold text-white">
            Shared
          </span>
        ) : null}
        <RunPublicationStatusBadge
          run={run}
          className="absolute top-2 right-2 z-20 max-w-[calc(100%-1rem)]"
        />
        <SocialAccountIconList
          items={run.socialStatuses ?? []}
          className="absolute right-2 bottom-2 z-20"
          onClick={onOpen}
        />
      </div>
      <div className="mt-2 space-y-0.5 text-[10px] font-semibold text-app-muted-text">
        <div className="truncate">Created {formatRunDate(run.createdAt)}</div>
        <div className="truncate">
          Published {publishedAt ? formatRunDate(publishedAt) : "None"}
        </div>
        {scheduledAt ? (
          <div className="truncate">Scheduled {formatRunDate(scheduledAt)}</div>
        ) : null}
        {run.plan?.publishType === "video" || run.videoUrl ? (
          <div className="truncate">
            Duration {formatRunDuration(runDurationSeconds(run))}
          </div>
        ) : null}
      </div>
    </article>
  )
}
