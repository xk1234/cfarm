"use client"

import { useEffect, useState } from "react"

import Image from "next/image"
import Link from "next/link"
import useSWR from "swr"

import {
  IconBolt,
  IconBook,
  IconChartHistogram,
  IconCalendar,
  IconHome,
  IconLogout,
  IconMenu2,
  IconPhoto,
  IconPlus,
  IconPencilPlus,
  IconSettings,
  IconTestPipe,
  IconX,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import type { RealFarmData } from "@/lib/realfarm-data"
import { clientSWRFetcher } from "@/lib/client-swr"
import { cn } from "@/lib/utils"
import {
  workspaceViewHref,
  type ViewKey,
} from "@/components/realfarm/workspace-navigation"

export type { ViewKey } from "@/components/realfarm/workspace-navigation"

type NavItem = {
  key: ViewKey
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const topNav: NavItem[] = [
  { key: "home", label: "Home", icon: IconHome },
  { key: "compose", label: "Compose", icon: IconPencilPlus },
  { key: "schedule", label: "Schedule", icon: IconCalendar },
  { key: "analytics", label: "Analytics", icon: IconChartHistogram },
]

const slideshowNav: NavItem[] = [
  { key: "automations", label: "Automations", icon: IconBolt },
  { key: "testing", label: "Testing facility", icon: IconTestPipe },
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
        {topNav.map((item) => (
          <SidebarButton
            key={item.key}
            item={item}
            active={
              (view === "home" && item.label === "Home") ||
              (view === "compose" && item.label === "Compose") ||
              (view === "schedule" && item.label === "Schedule") ||
              (view === "analytics" && item.label === "Analytics")
            }
            onClick={() => onViewChange(item.key)}
            href={workspaceViewHref(item.key)}
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
            href={workspaceViewHref(item.key)}
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

/**
 * Standard mobile pattern: a top bar with a hamburger that opens a full-height
 * drawer.
 *
 * This replaced a fixed bottom tab bar. The bar had to squeeze seven
 * destinations into one row, so every label truncated to ~10px and adding an
 * eighth would have broken the layout. A drawer scales with the nav instead of
 * fighting it, and matches what people expect on a mobile site.
 */
export function MobileNavigation({
  view,
  onViewChange,
  onNewAutomation,
  onSettings,
}: {
  view: ViewKey
  /**
   * Omit on pages outside the workspace shell: each item then behaves as a
   * plain link, which is what those pages need -- they have no view state.
   */
  onViewChange?: (view: ViewKey) => void
  onNewAutomation?: () => void
  onSettings?: () => void
}) {
  const [open, setOpen] = useState(false)
  const items = [...topNav, ...slideshowNav]
  const active = items.find((item) => item.key === view)

  // Close on route change and lock the page behind the drawer.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-app-panel-border bg-white/95 px-4 backdrop-blur md:hidden">
        <span className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center overflow-hidden rounded-lg">
            <Image
              src="/brand/lumenclip-mark.png"
              alt=""
              width={28}
              height={28}
              className="size-7"
            />
          </span>
          <span className="text-[14px] font-semibold tracking-[-0.02em] text-app-text">
            {active?.label ?? "LumenClip"}
          </span>
        </span>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
          onClick={() => setOpen(true)}
          className="lc-focus-ring flex size-10 items-center justify-center rounded-[10px] text-app-text active:bg-app-control-hover"
        >
          <IconMenu2 className="size-5" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/35"
          />
          <nav
            id="mobile-nav-drawer"
            aria-label="Primary navigation"
            className="absolute inset-y-0 right-0 flex w-[82%] max-w-[320px] flex-col overflow-y-auto bg-white shadow-[-12px_0_32px_rgba(25,18,45,0.14)]"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-app-panel-border px-4">
              <span className="text-[14px] font-semibold text-app-text">
                Menu
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="lc-focus-ring flex size-10 items-center justify-center rounded-[10px] text-app-text active:bg-app-control-hover"
              >
                <IconX className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-1 p-3">
              {items.map((item) => {
                const Icon = item.icon
                const current = view === item.key
                return (
                  <Link
                    key={item.key}
                    href={workspaceViewHref(item.key)}
                    prefetch={false}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "lc-focus-ring flex min-h-12 items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium",
                      current
                        ? "bg-app-strong text-white"
                        : "text-app-text active:bg-app-control-hover"
                    )}
                    onClick={(event) => {
                      setOpen(false)
                      if (!onViewChange) return
                      if (!isPlainNavigationClick(event)) return
                      event.preventDefault()
                      onViewChange(item.key)
                    }}
                  >
                    <Icon className="size-5" />
                    {item.label}
                  </Link>
                )
              })}
            </div>

            {onNewAutomation || onSettings ? (
              <div className="mt-auto flex flex-col gap-2 border-t border-app-panel-border p-3">
                {onNewAutomation ? (
                  <Button
                    variant="action"
                    size="appDefault"
                    onClick={() => {
                      setOpen(false)
                      onNewAutomation()
                    }}
                  >
                    <IconPlus className="size-5" />
                    New automation
                  </Button>
                ) : null}
                {onSettings ? (
                  <Button
                    variant="softControl"
                    size="appDefault"
                    onClick={() => {
                      setOpen(false)
                      onSettings()
                    }}
                  >
                    <IconSettings className="size-5" />
                    Settings
                  </Button>
                ) : null}
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}
    </>
  )
}

function SidebarButton({
  item,
  active,
  onClick,
  href,
  badge = 0,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
  href?: string
  badge?: number
}) {
  const Icon = item.icon
  const className = cn(
    "lc-focus-ring relative flex h-9 w-full items-center gap-2.5 overflow-hidden rounded-[10px] px-3 text-left text-[12px] font-medium text-[#454551] transition duration-200 active:translate-y-px",
    active
      ? "bg-app-strong text-white shadow-[0_8px_24px_rgba(25,18,45,0.16)] before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-[linear-gradient(180deg,#6d28d9,#e92a9a,#ff9f1c)]"
      : "hover:bg-app-control-hover hover:text-app-text"
  )
  const content = (
    <>
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
    </>
  )
  return href ? (
    <Link
      href={href}
      prefetch={false}
      className={className}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (!isPlainNavigationClick(event)) return
        event.preventDefault()
        onClick()
      }}
    >
      {content}
    </Link>
  ) : (
    <button className={className} onClick={onClick}>
      {content}
    </button>
  )
}

function isPlainNavigationClick(event: React.MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  )
}
