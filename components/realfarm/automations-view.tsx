"use client"

import { useState } from "react"
import {
  IconPlayerPlay,
  IconPlus,
  IconSlideshow,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"
import { Pause, Pencil } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  SocialAccountStatusRow,
  type SocialAccountStatusItem,
} from "@/components/realfarm/social-account-status"
import type { Automation } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

type AutomationRunPreview = {
  id: string
  automationId: string
  createdAt: string
  status?: string
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
  recentRunsByAutomationId,
  onCreateNew,
  onRename,
  onToggleFavorite,
  onToggleStatus,
  onEditSocialAccounts,
  onEdit,
}: {
  automations: Automation[]
  recentRunsByAutomationId: Record<string, AutomationRunPreview[]>
  onCreateNew: () => void
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onToggleStatus: (automation: Automation) => void
  onEditSocialAccounts: (automation: Automation) => void
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
        {automations.map((automation) => (
          <AutomationGridCard
            key={automation.id}
            automation={automation}
            recentRuns={recentRunsByAutomationId[automation.id]}
            onRename={onRename}
            onToggleFavorite={onToggleFavorite}
            onToggleStatus={onToggleStatus}
            onEditSocialAccounts={onEditSocialAccounts}
            onEdit={onEdit}
          />
        ))}
        {automations.length === 0 && (
          <div className="col-span-full rounded-[8px] border border-dashed border-[#d8d7cf] bg-white px-5 py-10 text-center text-[14px] font-semibold text-[#77766f]">
            No automations yet.
          </div>
        )}
      </div>
    </div>
  )
}

function AutomationGridCard({
  automation,
  recentRuns,
  onRename,
  onToggleFavorite,
  onToggleStatus,
  onEditSocialAccounts,
  onEdit,
}: {
  automation: Automation
  recentRuns?: AutomationRunPreview[]
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onToggleStatus: (automation: Automation) => void
  onEditSocialAccounts: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  const status =
    automation.status.toLowerCase() === "paused" ? "paused" : "live"
  const previewSlots = automationRunPreviewSlots(recentRuns, 3)
  const generating = recentRuns?.some((run) => run.status === "generating")
  const socialIntegrations = automation.socialIntegrations ?? []
  const activeSocialIntegrations = socialIntegrations.filter(
    (integration) => !integration.disabled
  )
  const accountStatusItems = automationAccountStatusItems(automation)

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
          const imageUrl = previewSlots[slot]

          return (
            <div
              key={imageUrl ?? `placeholder-${slot}`}
              className={cn(
                "relative aspect-[4/5] overflow-hidden bg-[#b8b8b8]",
                slot < 2 && "border-r border-white"
              )}
            >
              {imageUrl ? (
                <div
                  className="h-full w-full bg-cover bg-center"
                  style={{ backgroundImage: `url(${imageUrl})` }}
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
              {generating && slot === 0 ? (
                <div className="absolute inset-x-2 bottom-2 rounded-full bg-black/65 px-2 py-1 text-center text-[10px] font-bold text-white shadow-sm">
                  Generating
                </div>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 h-1/6 bg-gradient-to-b from-transparent to-black/10" />
            </div>
          )
        })}
      </div>

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
          {automation.times.length > 0 ? (
            automation.times.map((time, timeIndex) => {
              const pastToday = isAutomationTimePastToday(automation, time)
              return (
                <span
                  key={`${time}-${timeIndex}`}
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-1 text-[12px] font-medium text-[#191919]",
                    "border border-[#eeeeee] shadow-sm",
                    pastToday && "line-through opacity-35"
                  )}
                  title={
                    pastToday
                      ? `Passed today in ${automation.timezone || "local time"}`
                      : undefined
                  }
                >
                  {time}
                </span>
              )
            })
          ) : (
            <span className="inline-flex items-center rounded-full border border-[#eeeeee] px-2 py-1 text-[12px] font-medium text-[#191919] shadow-sm">
              11:00 AM
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
          <Pause className="size-3.5" />
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
  const sortedRuns =
    runs
      ?.slice()
      .sort((first, second) => runTimestamp(second) - runTimestamp(first)) ?? []
  const images = sortedRuns
    .map((run) => firstRunPreviewImage(run))
    .filter((value): value is string => Boolean(value))
    .slice(0, count)

  return Array.from({ length: count }, (_, index) => images[index] ?? null)
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

function isAutomationTimePastToday(automation: Automation, time: string) {
  const scheduledMinutes = minutesFromTimeLabel(time)
  if (scheduledMinutes === null) {
    return false
  }
  const currentMinutes = currentMinutesInTimezone(automation.timezone)
  return currentMinutes !== null && currentMinutes > scheduledMinutes
}

function currentMinutesInTimezone(timezone: string | undefined) {
  const timeZone =
    timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date())
    const hour = Number(parts.find((part) => part.type === "hour")?.value)
    const minute = Number(parts.find((part) => part.type === "minute")?.value)
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      return null
    }
    return (hour % 24) * 60 + minute
  } catch {
    return null
  }
}

function minutesFromTimeLabel(value: string) {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(value.trim())
  if (!match) {
    return null
  }
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const period = match[3]?.toUpperCase()
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) {
    return null
  }
  if (period === "PM" && hour < 12) {
    hour += 12
  }
  if (period === "AM" && hour === 12) {
    hour = 0
  }
  if (!period && hour === 24) {
    hour = 0
  }
  if (hour < 0 || hour > 23) {
    return null
  }
  return hour * 60 + minute
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
