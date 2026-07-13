"use client"

import Image from "next/image"

import {
  IconBolt,
  IconBook2,
  IconCalendar,
  IconHome,
  IconLogout,
  IconPhoto,
  IconPlus,
  IconSettings,
  IconSparkles,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import type { RealFarmData } from "@/lib/realfarm-data"
import { cn } from "@/lib/utils"

export type ViewKey =
  | "home"
  | "swipes"
  | "avatars"
  | "greenscreen"
  | "schedule"
  | "analytics"
  | "collections"
  | "knowledge"
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
  { key: "greenscreen", label: "Greenscreen Memes", icon: IconSparkles },
  { key: "schedule", label: "Schedule", icon: IconCalendar },
  { key: "analytics", label: "Analytics", icon: IconBolt },
]

const slideshowNav: NavItem[] = [
  { key: "automations", label: "Automations", icon: IconBolt },
  { key: "collections", label: "Collections", icon: IconPhoto },
  { key: "knowledge", label: "Knowledge Bases", icon: IconBook2 },
]

export function Sidebar({
  data,
  view,
  onViewChange,
  onNewAutomation,
  onSettings,
}: {
  data: RealFarmData
  view: ViewKey
  onViewChange: (view: ViewKey) => void
  onNewAutomation: () => void
  onSettings: () => void
}) {
  return (
    <aside className="hidden h-svh w-56 shrink-0 overflow-y-auto border-r border-[#e7e7ee] bg-[#fbfbfd] px-3 py-5 md:flex md:flex-col">
      <button className="lc-focus-ring mb-6 flex items-center gap-2.5 rounded-lg px-2 text-left text-[15px] font-semibold tracking-[-0.025em] text-[#111117]">
        <span className="flex size-7 items-center justify-center overflow-hidden rounded-lg">
          <Image
            src="/brand/lumenclip-mark.png"
            alt=""
            width={28}
            height={28}
            className="size-7 object-contain"
          />
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
              (view === "greenscreen" && item.label === "Greenscreen Memes") ||
              (view === "schedule" && item.label === "Schedule") ||
              (view === "analytics" && item.label === "Analytics")
            }
            onClick={() => onViewChange(item.key)}
          />
        ))}
      </nav>
      <div className="mt-5 px-3 text-[11px] font-medium text-[#91909d]">
        Create and ship
      </div>
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
      <div className="mt-auto border-t border-[#e7e7ee] pt-3">
        <button
          onClick={onSettings}
          className="lc-focus-ring flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-xs font-medium text-[#686875] hover:bg-[#f0eef8] hover:text-[#111117]"
        >
          <IconSettings className="size-4" />
          <span className="truncate">{data.brand.owner}</span>
        </button>
        <button
          className="lc-focus-ring mt-1 flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-xs font-medium text-[#686875] hover:bg-[#f0eef8] hover:text-[#111117]"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" })
            window.location.assign("/")
          }}
        >
          <IconLogout className="size-4" />
          Log out
        </button>
      </div>
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
        "lc-focus-ring relative flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-[10px] px-3 text-left text-[12px] font-medium text-[#454551] transition duration-200 active:translate-y-px",
        active
          ? "bg-[#111117] text-white shadow-[0_8px_24px_rgba(25,18,45,0.16)] before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-[linear-gradient(180deg,#6d28d9,#e92a9a,#ff9f1c)]"
          : "hover:bg-[#f0eef8] hover:text-[#111117]"
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
      <span className="truncate">{item.label}</span>
    </button>
  )
}
