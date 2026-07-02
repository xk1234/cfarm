"use client"

import { useState } from "react"
import {
  IconChevronRight,
  IconFilter,
  IconPlus,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react"
import { Pause, Pencil } from "lucide-react"

import { AutomationThumb, AvatarDot } from "@/components/realfarm/shared-media"
import { Button } from "@/components/ui/button"
import type { Automation } from "@/lib/realfarm-data"

export function AutomationsView({
  automations,
  onCreateNew,
  onRename,
  onToggleFavorite,
  onEdit,
}: {
  automations: Automation[]
  onCreateNew: () => void
  onRename: (automation: Automation, name: string) => void
  onToggleFavorite: (automation: Automation) => void
  onEdit: (automation: Automation) => void
}) {
  return (
    <div className="mx-auto max-w-[1160px]">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-[24px] font-semibold">Slideshow Automations</h1>
        <div className="flex gap-3">
          <Button variant="ghost" className="h-8 text-[13px]"><IconFilter className="size-4" />Filter</Button>
          <Button variant="action" size="appDefault" className="px-5 text-[13px]" onClick={onCreateNew}>
            <IconPlus className="size-4" />
            New automation
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {automations.map((automation, index) => (
          <article key={automation.id} className="overflow-hidden rounded-[8px] border border-[#e3e2da] bg-white">
            <div className="flex items-center justify-between px-3 py-2 text-[12px]">
              <span className="flex items-center gap-2 font-semibold text-[#4d4c47]"><span className="size-2 rounded-full bg-[#34d079]" />{automation.status}</span>
              <AutomationCardTitle automation={automation} onRename={onRename} />
              <button
                className="grid size-7 place-items-center rounded-full hover:bg-[#f1f0eb]"
                onClick={() => onToggleFavorite(automation)}
                aria-label={automation.favorite ? `Unfavorite ${automation.name}` : `Favorite ${automation.name}`}
              >
                {automation.favorite ? <IconStarFilled className="size-4 text-[#f7c846]" /> : <IconStar className="size-4 text-[#aaa9a2]" />}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-0.5 bg-[#111] p-0.5">
              {[0, 1, 2].map((thumb) => (
                <AutomationThumb key={thumb} theme={automation.theme} index={index + thumb} />
              ))}
            </div>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <AvatarDot name={automation.account} index={index + 12} className="size-10" />
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold">{automation.account}</div>
                  <div className="text-[11px] text-[#85847d]">{automation.handle}</div>
                </div>
                <IconChevronRight className="ml-auto size-4 text-[#b3b2aa]" />
              </div>
              <div className="mt-5 flex gap-7 text-[12px] text-[#4d4c47]">
                {automation.times.map((time) => <span key={time}>{time}</span>)}
              </div>
              <div className="mt-4 flex items-center justify-between text-[12px]">
                <Button variant="ghost" size="xs" className="h-8 px-2 font-semibold text-[#2f7bdc]" onClick={onCreateNew}>
                  <IconPlus className="size-4" />
                  Create New
                </Button>
                <div className="flex gap-2">
                  <Button variant="softControl" size="xs">
                    <Pause className="size-3.5" />
                    Pause
                  </Button>
                  <Button variant="softControl" size="xs" onClick={() => onEdit(automation)}>
                    <Pencil className="size-3.5" />
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
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
        className="mx-2 h-7 min-w-0 flex-1 rounded-[5px] border border-[#d8d7cf] bg-white px-2 text-[12px] font-semibold outline-none ring-2 ring-[#3197f4]/20"
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
    <div className="mx-2 flex min-w-0 flex-1 items-center justify-center gap-1">
      <span className="truncate font-medium">{automation.name}</span>
      <button
        className="grid size-6 shrink-0 place-items-center rounded-full text-[#8b8a83] hover:bg-[#f1f0eb] hover:text-[#242421]"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${automation.name} name`}
      >
        <Pencil className="size-3.5" />
      </button>
    </div>
  )
}
