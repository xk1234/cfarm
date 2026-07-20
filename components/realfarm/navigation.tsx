"use client"

import Image from "next/image"
import Link from "next/link"
import useSWR from "swr"

import {
  IconBolt,
  IconBook,
  IconCalendar,
  IconHome,
  IconLogout,
  IconPhoto,
  IconPlus,
  IconSettings,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import type { RealFarmData } from "@/lib/realfarm-data"
import { clientSWRFetcher } from "@/lib/client-swr"
import { cn } from "@/lib/utils"

export type ViewKey =
  "home" | "schedule" | "analytics" | "collections" | "automations"

type NavItem = {
  key: ViewKey
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const topNav: NavItem[] = [
  { key: "home", label: "Home", icon: IconHome },
  { key: "schedule", label: "Schedule", icon: IconCalendar },
  { key: "analytics", label: "Analytics", icon: IconBolt },
]

const slideshowNav: NavItem[] = [
  { key: "automations", label: "Automations", icon: IconBolt },
  { key: "collections", label: "Collections", icon: IconPhoto },
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
  const { data: calendarStatus } = useSWR<{
    summary: { needsAction: number; failed: number }
  }>("/api/calendar/summary", clientSWRFetcher, {
    refreshInterval: 10 * 60_000,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
  })
  const scheduleBadge = calendarStatus
    ? calendarStatus.summary.needsAction + calendarStatus.summary.failed
    : 0
  return (
    <aside className="hidden h-svh w-56 shrink-0 overflow-y-auto border-r border-app-panel-border bg-[#fbfbfd] px-3 py-5 md:flex md:flex-col">
      <button className="lc-focus-ring mb-6 flex items-center gap-2.5 rounded-lg px-2 text-left text-[15px] font-semibold tracking-[-0.025em] text-app-text">
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
              (view === "schedule" && item.label === "Schedule") ||
              (view === "analytics" && item.label === "Analytics")
            }
            onClick={() => onViewChange(item.key)}
            badge={item.key === "schedule" ? scheduleBadge : 0}
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
      <div className="mt-auto border-t border-app-panel-border pt-3">
        <Link
          href="/docs"
          className="lc-focus-ring flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-xs font-medium text-app-muted-text hover:bg-app-control-hover hover:text-app-text"
        >
          <IconBook className="size-4" />
          Documentation
        </Link>
        <button
          onClick={onSettings}
          className="lc-focus-ring flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-xs font-medium text-app-muted-text hover:bg-app-control-hover hover:text-app-text"
        >
          <IconSettings className="size-4" />
          <span className="truncate">{data.brand.owner}</span>
        </button>
        <button
          className="lc-focus-ring mt-1 flex h-9 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-xs font-medium text-app-muted-text hover:bg-app-control-hover hover:text-app-text"
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

export function MobileNavigation({
  view,
  onViewChange,
}: {
  view: ViewKey
  onViewChange: (view: ViewKey) => void
}) {
  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-app-panel-border bg-white/95 px-1 pt-1 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(25,18,45,0.08)] backdrop-blur md:hidden"
    >
      {[...topNav, ...slideshowNav].map((item) => {
        const Icon = item.icon
        const active = view === item.key
        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? "page" : undefined}
            className={cn(
              "lc-focus-ring flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[8px] px-1 text-[10px] font-semibold",
              active
                ? "bg-app-strong text-white"
                : "text-app-muted-text active:bg-app-control-hover"
            )}
            onClick={() => onViewChange(item.key)}
          >
            <Icon className="size-4" />
            <span className="w-full truncate">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function SidebarButton({
  item,
  active,
  onClick,
  badge = 0,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
  badge?: number
}) {
  const Icon = item.icon
  return (
    <button
      className={cn(
        "lc-focus-ring relative flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-[10px] px-3 text-left text-[12px] font-medium text-[#454551] transition duration-200 active:translate-y-px",
        active
          ? "bg-app-strong text-white shadow-[0_8px_24px_rgba(25,18,45,0.16)] before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-[linear-gradient(180deg,#6d28d9,#e92a9a,#ff9f1c)]"
          : "hover:bg-app-control-hover hover:text-app-text"
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
      <span className="truncate">{item.label}</span>
      {badge > 0 ? (
        <span
          className={cn(
            "ml-auto grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
            active ? "bg-white/15 text-white" : "bg-[#fde9e5] text-[#9b342a]"
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </button>
  )
}
