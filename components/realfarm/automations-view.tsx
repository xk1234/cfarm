"use client"

import { useState } from "react"
import {
  IconBrandX,
  IconPlayerPlay,
  IconPlus,
  IconSlideshow,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"
import { Pause, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CardGridSkeleton } from "@/components/ui/loading-skeleton"
import { GeneratedSlideshowViewerModal } from "@/components/realfarm/automation-settings/generated-slideshow-viewer"
import { GeneratedAutomationVideoViewer } from "@/components/realfarm/automation-settings/generated-video-viewer"
import { GeneratedVideoThumbnail } from "@/components/realfarm/generated-video-thumbnail"
import type { AutomationRunApiRecord } from "@/components/realfarm/automation-settings/types"
import {
  SocialAccountStatusRow,
  type SocialAccountStatusItem,
} from "@/components/realfarm/social-account-status"
import { upcomingAutomationPosts } from "@/lib/automation-upcoming-posts"
import type { Automation } from "@/lib/realfarm-data"
import type { XAutomationRun } from "@/lib/x-automation"
import { cn } from "@/lib/utils"

type AutomationRunPreview = {
  id: string
  automationId: string
  createdAt: string
  status?: string
  slideshowId?: string
  videoUrl?: string
  thumbnailUrl?: string
  socialStatuses?: SocialAccountStatusItem[]
  renderedSlides?: AutomationRunPreviewSlide[]
  plan?: {
    slides?: AutomationRunPreviewSlide[]
  }
}

type AutomationRunPreviewSlide = {
  imageUrl?: string
  image_url?: string
  sourceImageUrl?: string
  source_image_url?: string
}

export function AutomationsView({
  automations,
  automationsLoading = false,
  recentRunsByAutomationId,
  recentRunsLoading,
  xRunsByAutomationId,
  onCreateNew,
  onRename,
  onToggleFavorite,
  onToggleStatus,
  onEditSocialAccounts,
  onGenerationRunRemove,
  onGenerationRunUpdate,
  onEdit,
}: {
  automations: Automation[]
  automationsLoading?: boolean
  recentRunsByAutomationId: Record<string, AutomationRunPreview[]>
  recentRunsLoading?: boolean
  xRunsByAutomationId?: Record<string, XAutomationRun[]>
  onCreateNew: () => void
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onToggleStatus: (automation: Automation) => void
  onEditSocialAccounts: (automation: Automation) => void
  onGenerationRunRemove: (runId: string) => void
  onGenerationRunUpdate?: (run: AutomationRunApiRecord) => void
  onEdit: (automation: Automation) => void
}) {
  return (
    <div className="mx-auto max-w-[1160px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[24px] font-semibold">Automations</h1>
        <div className="flex gap-3">
          <Button variant="action" size="appDefault" onClick={onCreateNew}>
            <IconPlus className="size-4" />
            New automation
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {automationsLoading ? (
          <CardGridSkeleton
            count={6}
            className="col-span-full md:grid-cols-2 lg:grid-cols-3"
          />
        ) : null}
        {!automationsLoading &&
          automations.map((automation) =>
            automation.automationKind === "x_threads" ? (
              <XThreadsAutomationCard
                key={automation.id}
                automation={automation}
                recentRuns={xRunsByAutomationId?.[automation.id]}
                onEdit={onEdit}
                onToggleStatus={onToggleStatus}
              />
            ) : (
              <AutomationGridCard
                key={automation.id}
                automation={automation}
                recentRuns={recentRunsByAutomationId[automation.id]}
                onRename={onRename}
                onToggleFavorite={onToggleFavorite}
                onToggleStatus={onToggleStatus}
                onEditSocialAccounts={onEditSocialAccounts}
                onGenerationRunRemove={onGenerationRunRemove}
                onGenerationRunUpdate={onGenerationRunUpdate}
                recentRunsLoading={recentRunsLoading}
                onEdit={onEdit}
              />
            )
          )}
        {!automationsLoading && automations.length === 0 && (
          <div className="col-span-full rounded-[8px] border border-dashed border-[#d8d7cf] bg-white px-5 py-10 text-center text-[14px] font-semibold text-[#77766f]">
            No automations yet.
          </div>
        )}
      </div>
    </div>
  )
}

function XThreadsAutomationCard({
  automation,
  recentRuns,
  onEdit,
  onToggleStatus,
}: {
  automation: Automation
  recentRuns?: XAutomationRun[]
  onEdit: (automation: Automation) => void
  onToggleStatus: (automation: Automation) => void
}) {
  const live = automation.status !== "paused"
  const previews = (recentRuns ?? []).slice(0, 3)

  return (
    <article className="relative overflow-hidden rounded-[8px] border border-[#eeeeee] bg-white shadow-sm">
      <button
        className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-[6px] bg-white px-2 py-1 text-[12px] font-medium text-[#333] shadow-sm"
        onClick={() => onToggleStatus(automation)}
      >
        <span
          className={cn(
            "size-2 rounded-full",
            live ? "bg-[#34d079]" : "bg-[#aaa9a2]"
          )}
        />
        {live ? "Live" : "Paused"}
      </button>
      <div className="border-b border-[#eeeeee] px-9 py-3 text-center text-[13px] font-semibold">
        {automation.name}
      </div>
      <div className="grid grid-cols-3 bg-[#111117]">
        {[0, 1, 2].map((slot) => {
          const run = previews[slot]
          return (
            <div
              key={run?.id ?? slot}
              className={cn(
                "flex aspect-[4/5] flex-col justify-between overflow-hidden p-3 text-white",
                slot < 2 && "border-r border-white/15"
              )}
            >
              <IconBrandX className="size-4 opacity-65" />
              <p className="line-clamp-6 text-[11px] leading-[1.35] font-medium">
                {run?.posts[0]?.text || run?.hook || "No recent generation"}
              </p>
              <span className="text-[9px] font-semibold text-white/50">
                {run
                  ? `${run.contentType} · ${run.benchmark.total}/100`
                  : "X / Threads"}
              </span>
            </div>
          )
        })}
      </div>
      <div className="p-4">
        <div className="mb-3 flex items-center justify-between text-[12px]">
          <span className="font-bold tracking-[0.08em] text-[#8a8982] uppercase">
            Content automation
          </span>
          <span className="font-semibold text-[#77766f]">
            {recentRuns?.length ?? 0} drafts
          </span>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#eeeeee] pt-3">
          <Button
            variant="softControl"
            size="xs"
            onClick={() => onToggleStatus(automation)}
          >
            {live ? (
              <Pause className="size-3.5" />
            ) : (
              <IconPlayerPlay className="size-3.5" />
            )}
            {live ? "Pause" : "Resume"}
          </Button>
          <Button
            variant="softControl"
            size="xs"
            onClick={() => onEdit(automation)}
          >
            <Pencil className="size-3.5" />
            Edit
          </Button>
        </div>
      </div>
    </article>
  )
}

function AutomationGridCard({
  automation,
  recentRuns,
  recentRunsLoading,
  onRename,
  onToggleFavorite,
  onToggleStatus,
  onEditSocialAccounts,
  onGenerationRunRemove,
  onGenerationRunUpdate,
  onEdit,
}: {
  automation: Automation
  recentRuns?: AutomationRunPreview[]
  recentRunsLoading?: boolean
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onToggleStatus: (automation: Automation) => void
  onEditSocialAccounts: (automation: Automation) => void
  onGenerationRunRemove: (runId: string) => void
  onGenerationRunUpdate?: (run: AutomationRunApiRecord) => void
  onEdit: (automation: Automation) => void
}) {
  const status = automation.status === "paused" ? "paused" : "live"
  const previewRuns = automationRunPreviewRuns(recentRuns, 3)
  const [viewerRun, setViewerRun] = useState<AutomationRunPreview | null>(null)
  const generating = recentRuns?.some(
    (run) => run.status === "generating" || run.status === "running"
  )
  const socialIntegrations = automation.socialIntegrations ?? []
  const activeSocialIntegrations = socialIntegrations.filter(
    (integration) => !integration.disabled
  )
  const accountStatusItems = automationAccountStatusItems(automation)
  const upcomingPosts = upcomingAutomationPosts(automation)

  return (
    <article className="relative overflow-hidden rounded-[8px] border border-[#eeeeee] bg-white shadow-sm">
      <button
        className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-[6px] bg-white px-2 py-1 text-[12px] font-medium text-[#333] shadow-sm transition hover:opacity-70"
        onClick={() => onToggleStatus(automation)}
        aria-label={
          status === "live"
            ? `Pause ${automation.name}`
            : `Resume ${automation.name}`
        }
      >
        <span
          className={cn(
            "size-2 rounded-full",
            status === "live" ? "bg-[#34d079]" : "bg-[#aaa9a2]"
          )}
        />
        {status === "live" ? "Live" : "Paused"}
      </button>
      <button
        className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-[6px] bg-white text-[#777] shadow-sm transition hover:bg-[#f5f5f2]"
        onClick={() => onToggleFavorite(automation)}
        aria-label={
          automation.favorite
            ? `Unfavorite ${automation.name}`
            : `Favorite ${automation.name}`
        }
      >
        {automation.favorite ? (
          <IconStarFilled className="size-4 text-[#f7c846]" />
        ) : (
          <IconStar className="size-4" />
        )}
      </button>

      <div className="border-x border-t border-[#eeeeee] bg-white px-9 py-3 text-center">
        <AutomationCardTitle automation={automation} onRename={onRename} />
      </div>

      <div className="grid grid-cols-3">
        {[0, 1, 2].map((slot) => {
          const slotRun = previewRuns[slot]
          const imageUrl = slotRun ? firstRunPreviewImage(slotRun) : null
          const openable = Boolean(
            slotRun &&
            (imageUrl ||
              (automation.automationKind === "video" && slotRun.videoUrl))
          )

          return (
            <div
              key={slotRun?.id ?? `placeholder-${slot}`}
              className={cn(
                "relative aspect-[4/5] overflow-hidden bg-[#b8b8b8]",
                slot < 2 && "border-r border-white"
              )}
            >
              {automation.automationKind === "video" && slotRun?.videoUrl ? (
                <button
                  type="button"
                  className="block h-full w-full cursor-pointer transition hover:brightness-110 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-action"
                  onClick={() => setViewerRun(slotRun)}
                  aria-label={`Open ${automation.name} video ${slot + 1}`}
                >
                  <GeneratedVideoThumbnail videoUrl={slotRun.videoUrl} />
                </button>
              ) : imageUrl ? (
                openable ? (
                  <button
                    type="button"
                    className="block h-full w-full cursor-pointer bg-cover bg-center transition hover:brightness-110 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-action"
                    style={{ backgroundImage: `url(${imageUrl})` }}
                    onClick={() => setViewerRun(slotRun)}
                    aria-label={`Open ${automation.name} ${automation.automationKind === "video" ? "video" : "slideshow"} ${slot + 1}`}
                  />
                ) : (
                  <div
                    className="h-full w-full bg-cover bg-center"
                    style={{ backgroundImage: `url(${imageUrl})` }}
                  />
                )
              ) : openable ? (
                <button
                  type="button"
                  className="grid h-full w-full place-items-center bg-[#202020] text-white transition hover:bg-[#2b2b2b] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-action"
                  onClick={() => setViewerRun(slotRun)}
                  aria-label={`Open ${automation.name} video ${slot + 1}`}
                >
                  <span className="grid size-9 place-items-center rounded-full bg-white/15">
                    <IconPlayerPlay className="size-4" />
                  </span>
                </button>
              ) : recentRunsLoading && !generating ? (
                <div
                  className="h-full w-full animate-pulse bg-[#d9d8d2]"
                  aria-hidden="true"
                />
              ) : (
                <div className="grid h-full place-items-center px-2 text-center text-[12px] font-semibold text-white">
                  <span className="leading-tight">
                    {generating && slot === 0
                      ? "Generating..."
                      : "No recent generation"}
                  </span>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/6 bg-gradient-to-b from-transparent to-black/10" />
            </div>
          )
        })}
      </div>
      {viewerRun ? (
        automation.automationKind === "video" ? (
          <GeneratedAutomationVideoViewer
            run={viewerRun as unknown as AutomationRunApiRecord}
            onDelete={
              viewerRun.slideshowId
                ? async () => {
                    const response = await fetch(
                      `/api/slideshows/${encodeURIComponent(viewerRun.slideshowId!)}`,
                      { method: "DELETE" }
                    )
                    const payload = (await response
                      .json()
                      .catch(() => ({}))) as {
                      error?: string
                      deletedRunIds?: string[]
                    }
                    if (!response.ok) {
                      throw new Error(
                        payload.error || "The video could not be deleted."
                      )
                    }
                    const deletedRunIds = payload.deletedRunIds ?? [
                      viewerRun.id,
                    ]
                    deletedRunIds.forEach(onGenerationRunRemove)
                  }
                : undefined
            }
            onClose={() => setViewerRun(null)}
          />
        ) : (
          <GeneratedSlideshowViewerModal
            run={viewerRun as unknown as AutomationRunApiRecord}
            runs={(recentRuns ?? []) as unknown as AutomationRunApiRecord[]}
            onDeleted={(runId) => {
              setViewerRun(null)
              onGenerationRunRemove(runId)
            }}
            onRunChanged={(run) =>
              onGenerationRunUpdate?.(run as unknown as never)
            }
            onClose={() => setViewerRun(null)}
          />
        )
      ) : null}

      <div className="p-2 pb-1">
        <button
          className="flex w-full flex-col items-start gap-2 rounded-[8px] bg-white px-3 py-2 text-left transition hover:opacity-65"
          onClick={() => onEditSocialAccounts(automation)}
        >
          <span className="flex w-full items-center justify-between gap-3">
            <span className="text-[12px] font-bold tracking-[0.08em] text-[#8a8982] uppercase">
              Accounts
            </span>
            <span className="text-[12px] font-semibold text-[#77766f]">
              {activeSocialIntegrations.length} selected
            </span>
          </span>
          <SocialAccountStatusRow
            items={accountStatusItems}
            size="compact"
            showLabels
            emptyLabel="Add account"
          />
        </button>
      </div>

      <div className="mt-1 border-t border-[#eeeeee] px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
          {upcomingPosts.length > 0 ? (
            upcomingPosts.map((post) => (
              <span
                key={post.key}
                className={cn(
                  "inline-flex items-center rounded-full border border-[#eeeeee] px-2 py-1 text-[12px] font-medium text-[#191919] shadow-sm",
                  status === "paused" && "line-through opacity-35"
                )}
                title={
                  status === "paused"
                    ? "Cancelled while automation is paused"
                    : post.scheduledAt
                }
              >
                {post.label}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center rounded-full border border-[#eeeeee] px-2 py-1 text-[12px] font-medium text-[#191919] shadow-sm">
              No upcoming posts
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 pt-2 pb-4">
        <Button
          variant="softControl"
          size="xs"
          onClick={() => onToggleStatus(automation)}
        >
          {status === "live" ? (
            <Pause className="size-3.5" />
          ) : (
            <IconPlayerPlay className="size-3.5" />
          )}
          {status === "live" ? "Pause" : "Resume"}
        </Button>
        <Button
          variant="softControl"
          size="xs"
          onClick={() => onEdit(automation)}
        >
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>
    </article>
  )
}

export function automationAccountStatusItems(
  automation: Automation
): SocialAccountStatusItem[] {
  return (automation.socialIntegrations ?? []).map((integration) => ({
    provider: integration.provider,
    integrationId: integration.integration_id,
    name: integration.name,
    profile: integration.profile,
    status: integration.disabled ? "disabled" : "connected",
  }))
}

export function automationRunPreviewImages(
  runs: AutomationRunPreview[] | undefined,
  count: number
) {
  return automationRunPreviewSlots(runs, count).filter(
    (value): value is string => Boolean(value)
  )
}

export function automationRunPreviewSlots(
  runs: AutomationRunPreview[] | undefined,
  count: number
) {
  const images = sortedRunsWithPreviewImage(runs)
    .map((run) => firstRunPreviewImage(run))
    .filter((value): value is string => Boolean(value))
    .slice(0, count)

  return Array.from({ length: count }, (_, index) => images[index] ?? null)
}

export function automationRunPreviewRuns(
  runs: AutomationRunPreview[] | undefined,
  count: number
) {
  const runsWithImages = sortedRunsWithPreviewImage(runs)
    .filter(
      (run) => firstRunPreviewImage(run) !== null || Boolean(run.videoUrl)
    )
    .slice(0, count)

  return Array.from(
    { length: count },
    (_, index) => runsWithImages[index] ?? null
  )
}

function sortedRunsWithPreviewImage(runs: AutomationRunPreview[] | undefined) {
  return (
    runs
      ?.slice()
      .sort((first, second) => runTimestamp(second) - runTimestamp(first)) ?? []
  )
}

function firstRunPreviewImage(run: AutomationRunPreview) {
  return (
    (run.thumbnailUrl?.trim() || firstSlideImage(run.renderedSlides)) ??
    firstSlideImage(run.plan?.slides) ??
    null
  )
}

function firstSlideImage(slides: AutomationRunPreviewSlide[] | undefined) {
  return slideImages(slides)[0] ?? null
}

function slideImages(slides: AutomationRunPreviewSlide[] | undefined) {
  return (
    slides
      ?.map(
        (slide) =>
          slide.imageUrl?.trim() ||
          slide.image_url?.trim() ||
          slide.sourceImageUrl?.trim() ||
          slide.source_image_url?.trim()
      )
      .filter((value): value is string => Boolean(value)) ?? []
  )
}

function runTimestamp(run: AutomationRunPreview) {
  const value = new Date(run.createdAt).getTime()
  return Number.isFinite(value) ? value : 0
}

export function automationAccountSummary(automation: Automation) {
  const account = automation.account?.trim()
  const handle = automation.handle?.trim()
  const hasAccount =
    Boolean(account) && account.toLowerCase() !== "no social account"

  return {
    account: hasAccount ? account : "No social accounts",
    handle: hasAccount ? handle || "Social account" : "Add social account",
    hasAccount,
  }
}

function AutomationCardTitle({
  automation,
  onRename,
}: {
  automation: Automation
  onRename: (automation: Automation, name: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(automation.name)

  function saveName() {
    const nextName = draftName.trim()
    if (nextName && nextName !== automation.name) {
      onRename(automation, nextName)
    } else {
      setDraftName(automation.name)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        className="h-7 min-w-0 flex-1 rounded-[5px] border border-[#d8d7cf] bg-white px-2 text-[12px] font-semibold ring-2 ring-app-action/20 outline-none"
        value={draftName}
        autoFocus
        onChange={(event) => setDraftName(event.target.value)}
        onBlur={saveName}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            saveName()
          }
          if (event.key === "Escape") {
            setDraftName(automation.name)
            setEditing(false)
          }
        }}
        aria-label="Automation name"
      />
    )
  }

  return (
    <div className="flex min-w-0 items-center justify-center gap-1">
      {automation.automationKind === "video" ? (
        <IconPlayerPlay className="size-3.5 shrink-0 text-[#77766f]" />
      ) : (
        <IconSlideshow className="size-3.5 shrink-0 text-[#77766f]" />
      )}
      <span className="truncate text-[12px] font-medium text-[#333]">
        {automation.name}
      </span>
      <button
        className="grid size-5 shrink-0 place-items-center rounded-full text-[#b8b8b8] hover:bg-[#f1f0eb] hover:text-[#388eff]"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${automation.name} name`}
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  )
}
