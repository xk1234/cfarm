"use client"

import {
  IconBolt,
  IconCalendar,
  IconHome,
  IconMovie,
  IconPhoto,
  IconPlus,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import type { RealFarmData } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

export type ViewKey =
  | "home"
  | "swipes"
  | "avatars"
  | "ugcads"
  | "greenscreen"
  | "schedule"
  | "analytics"
  | "editor"
  | "collections"
  | "automations"

type NavItem = {
  key: ViewKey
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const topNav: NavItem[] = [
  { key: "home", label: "Home", icon: IconHome },
  { key: "swipes", label: "Swipes", icon: IconPhoto },
  { key: "avatars", label: "AI UGC avatars", icon: IconPhoto },
  { key: "ugcads", label: "AI UGC ads", icon: IconMovie },
  { key: "greenscreen", label: "Greenscreen Memes", icon: IconSparkles },
  { key: "schedule", label: "Schedule", icon: IconCalendar },
  { key: "analytics", label: "Analytics", icon: IconBolt },
]

const slideshowNav: NavItem[] = [
  { key: "automations", label: "Automations", icon: IconBolt },
  { key: "editor", label: "Slideshow Editor", icon: IconWand },
  { key: "collections", label: "Image Collections", icon: IconPhoto },
]

export function Sidebar({
  data,
  view,
  onViewChange,
  onNewAutomation,
}: {
  data: RealFarmData
  view: ViewKey
  onViewChange: (view: ViewKey) => void
  onNewAutomation: () => void
}) {
  return (
    <aside className="hidden h-svh w-[214px] shrink-0 overflow-y-auto border-r border-[#e5e4dc] bg-[#fbfbf7] px-2 py-4 md:flex md:flex-col">
      <button className="mb-5 flex items-center gap-2 px-2 text-left text-[15px] font-semibold">
        <span className="flex size-6 items-center justify-center rounded-[5px] bg-[#111] text-white">
          <IconSparkles className="size-4" />
        </span>
        {data.brand.name}
      </button>
      <Button
        variant="action"
        size="appDefault"
        className="mb-4 justify-start"
        onClick={onNewAutomation}
      >
        <IconPlus className="size-4" />
        New Automation
      </Button>
      <nav className="space-y-1">
        {topNav.map((item, index) => (
          <SidebarButton
            key={`${item.label}-${index}`}
            item={item}
            active={
              (view === "home" && item.label === "Home") ||
              (view === "swipes" && item.label === "Swipes") ||
              (view === "avatars" && item.label === "AI UGC avatars") ||
              (view === "ugcads" && item.label === "AI UGC ads") ||
              (view === "greenscreen" && item.label === "Greenscreen Memes") ||
              (view === "schedule" && item.label === "Schedule") ||
              (view === "analytics" && item.label === "Analytics")
            }
            onClick={() => onViewChange(item.key)}
          />
        ))}
      </nav>
      <div className="mt-4 text-[11px] font-medium text-[#a09f98]">Slideshows</div>
      <nav className="mt-1 space-y-1">
        {slideshowNav.map((item) => (
          <SidebarButton
            key={item.label}
            item={item}
            active={item.key === view}
            onClick={() => onViewChange(item.key)}
          />
        ))}
      </nav>
      <div className="mt-auto" />
    </aside>
  )
}

function SidebarButton({
  item,
  active,
  onClick,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-[6px] px-3 text-left text-[12px] font-medium text-[#4d4c47] transition",
        active ? "bg-app-action text-white shadow-sm" : "hover:bg-[#efeee8]"
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
      <span className="truncate">{item.label}</span>
    </button>
  )
}
