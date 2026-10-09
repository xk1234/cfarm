"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { IconBell } from "@tabler/icons-react"
import { Popover } from "radix-ui"

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/components/realfarm/api-client"
import { Button } from "@/components/ui/button"
import type { Notification } from "@/lib/data/types"
import { cn } from "@/lib/utils"

function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return ""
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function isUnread(notification: Pick<Notification, "status">): boolean {
  return notification.status === "pending" || notification.status === "delivered"
}

/** In-app inbox: bell with unread count and a popover list. */
export function NotificationBell({
  onOpenRender,
  className,
}: {
  onOpenRender?: (renderId: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const inbox = useQuery({
    queryKey: ["notifications"],
    queryFn: listNotifications,
    refetchInterval: 60_000,
    retry: false,
  })
  const items = (inbox.data?.items ?? []).filter((n) => n.status !== "canceled")
  const unread = inbox.data?.unread ?? 0
  const label = unread > 0 ? `Notifications (${unread} unread)` : "Notifications"

  async function openItem(notification: Notification) {
    if (isUnread(notification)) {
      await markNotificationRead(notification.id).catch(() => undefined)
      void queryClient.invalidateQueries({ queryKey: ["notifications"] })
    }
    if (notification.renderId && onOpenRender) {
      setOpen(false)
      onOpenRender(notification.renderId)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            "lc-focus-ring relative grid size-9 shrink-0 place-items-center rounded-[10px] text-app-muted-text hover:bg-app-control-hover hover:text-app-text",
            className
          )}
        >
          <IconBell className="size-4" />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-app-action px-1 text-[9px] font-bold text-white tabular-nums">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="z-[60] w-[min(360px,calc(100vw-24px))] rounded-xl border border-app-panel-border bg-app-surface shadow-[var(--app-shadow-popover)]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-app-panel-border px-4 py-2">
            <h2 className="text-sm font-semibold text-app-text">Notifications</h2>
            <Button
              type="button"
              variant="ghost"
              size="compact"
              disabled={unread === 0}
              onClick={async () => {
                await markAllNotificationsRead().catch(() => undefined)
                void queryClient.invalidateQueries({ queryKey: ["notifications"] })
              }}
            >
              Mark all read
            </Button>
          </div>
          <div className="max-h-[min(420px,70vh)] overflow-y-auto">
            {inbox.isLoading ? (
              <div className="m-4 h-16 animate-pulse rounded-lg bg-app-surface-subtle" />
            ) : inbox.error ? (
              <p className="p-4 text-sm text-app-muted-text">Notifications could not be loaded.</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-sm text-app-muted-text">You are all caught up.</p>
            ) : (
              <ul className="divide-y divide-app-panel-border">
                {items.map((notification) => (
                  <li key={notification.id}>
                    <button
                      type="button"
                      onClick={() => void openItem(notification)}
                      className="lc-focus-ring flex w-full gap-3 px-4 py-3 text-left hover:bg-app-control-hover"
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          isUnread(notification) ? "bg-app-action" : "bg-transparent"
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-app-text">{notification.title}</span>
                        {notification.body ? (
                          <span className="block text-xs text-app-muted-text">{notification.body}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] text-app-text-faint">
                        {relativeTime(notification.deliverAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
