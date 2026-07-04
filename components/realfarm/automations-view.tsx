"use client"

import { useState } from "react"
import {
  IconPlus,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"
import { Pause, Pencil } from "lucide-react"

import { AvatarDot } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import type { Automation } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

type AutomationRunPreview = {
  id: string
  automationId: string
  createdAt: string
  plan?: {
    slides?: {
      imageUrl?: string
    }[]
  }
}

export function AutomationsView({
  automations,
  recentRunsByAutomationId,
  onCreateNew,
  onRename,
  onToggleFavorite,
  onToggleStatus,
  onEdit,
}: {
  automations: Automation[]
  recentRunsByAutomationId: Record<string, AutomationRunPreview[]>
  onCreateNew: () => void
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onToggleStatus: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  return (
    <div className="mx-auto max-w-[1160px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[24px] font-semibold">Slideshow Automations</h1>
        <div className="flex gap-3">
          <Button variant="action" size="appDefault" onClick={onCreateNew}>
            <IconPlus className="size-4" />
            New automation
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {automations.map((automation, index) => (
          <AutomationGridCard
            key={automation.id}
            automation={automation}
            index={index}
            recentRun={recentRunsByAutomationId[automation.id]?.[0]}
            onRename={onRename}
            onToggleFavorite={onToggleFavorite}
            onToggleStatus={onToggleStatus}
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
  index,
  recentRun,
  onRename,
  onToggleFavorite,
  onToggleStatus,
  onEdit,
}: {
  automation: Automation
  index: number
  recentRun?: AutomationRunPreview
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onToggleStatus: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  const status = automation.status.toLowerCase() === "paused" ? "paused" : "live"
  const previewImages = recentRun?.plan?.slides
    ?.map((slide) => slide.imageUrl)
    .filter((value): value is string => Boolean(value))
    .slice(0, 3) ?? []
  const hasTikTokAccount = automation.account.trim() !== "" && automation.account !== "No TikTok account"

  return (
    <article className="relative overflow-hidden rounded-[8px] border border-[#eeeeee] bg-white shadow-sm">
      <button
        className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-[6px] bg-white px-2 py-1 text-[12px] font-medium text-[#333] shadow-sm transition hover:opacity-70"
        onClick={() => onToggleStatus(automation)}
        aria-label={status === "live" ? `Pause ${automation.name}` : `Resume ${automation.name}`}
      >
        <span className={cn("size-2 rounded-full", status === "live" ? "bg-[#34d079]" : "bg-[#aaa9a2]")} />
        {status === "live" ? "Live" : "Paused"}
      </button>
      <button
        className="absolute right-2 top-2 z-10 grid size-7 place-items-center rounded-[6px] bg-white text-[#777] shadow-sm transition hover:bg-[#f5f5f2]"
        onClick={() => onToggleFavorite(automation)}
        aria-label={automation.favorite ? `Unfavorite ${automation.name}` : `Favorite ${automation.name}`}
      >
        {automation.favorite ? <IconStarFilled className="size-4 text-[#f7c846]" /> : <IconStar className="size-4" />}
      </button>

      <div className="border-x border-t border-[#eeeeee] bg-white px-9 py-3 text-center">
        <AutomationCardTitle automation={automation} onRename={onRename} />
      </div>

      <div className="grid grid-cols-3">
        {previewImages.length > 0 ? (
          previewImages.map((imageUrl, imageIndex) => (
            <div
              key={`${imageUrl}-${imageIndex}`}
              className={cn("aspect-[4/5] bg-cover bg-center", imageIndex < 2 && "border-r border-white")}
              style={{ backgroundImage: `url(${imageUrl})` }}
            />
          ))
        ) : (
          [0, 1, 2].map((slot) => (
            <div
              key={slot}
              className={cn("relative grid aspect-[4/5] place-items-center bg-[#b8b8b8] px-2 text-center text-[12px] font-semibold text-white", slot < 2 && "border-r border-white")}
            >
              <span className="leading-tight">No recent generations</span>
              <div className="absolute inset-x-0 bottom-0 h-1/6 bg-gradient-to-b from-transparent to-black/10" />
            </div>
          ))
        )}
      </div>

      <div className="p-2 pb-1">
        <button className="flex w-fit items-center gap-3 rounded-[8px] bg-white px-3 py-2 text-left transition hover:opacity-65">
          {hasTikTokAccount ? (
            <AvatarDot name={automation.account} index={index + 12} className="size-10" />
          ) : (
            <span className="grid size-10 place-items-center rounded-full bg-[#ecebe4] text-[12px] font-bold text-[#77766f]">TT</span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium text-[#191919]">
              {hasTikTokAccount ? automation.account : "No TikTok account"}
            </span>
            <span className="block text-[12px] text-gray-400">
              {hasTikTokAccount ? automation.handle : "Click to add account"}
            </span>
          </span>
        </button>
      </div>

      <div className="mt-1 border-t border-[#eeeeee] px-4 py-2">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
          {automation.times.length > 0 ? (
            automation.times.map((time, timeIndex) => (
              <span
                key={time}
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-1 text-[12px] font-medium text-[#191919]",
                  timeIndex === 0 ? "border border-[#eeeeee] shadow-sm" : "opacity-35 line-through"
                )}
              >
                {time}
              </span>
            ))
          ) : (
            <span className="inline-flex items-center rounded-full border border-[#eeeeee] px-2 py-1 text-[12px] font-medium text-[#191919] shadow-sm">
              11:00 AM
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 pb-4 pt-2">
        <Button variant="softControl" size="xs" onClick={() => onToggleStatus(automation)}>
          <Pause className="size-3.5" />
          {status === "live" ? "Pause" : "Resume"}
        </Button>
        <Button variant="softControl" size="xs" onClick={() => onEdit(automation)}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>
    </article>
  )
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
        className="h-7 min-w-0 flex-1 rounded-[5px] border border-[#d8d7cf] bg-white px-2 text-[12px] font-semibold outline-none ring-2 ring-app-action/20"
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
      <span className="truncate text-[12px] font-medium text-[#333]">{automation.name}</span>
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
