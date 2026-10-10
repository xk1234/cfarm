"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  cancelPost,
  getPublisherStatus,
  listPosts,
  type PostView,
} from "@/components/realfarm/api-client"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { IconButton } from "@/components/ui/icon-button"
import type { PostStatus } from "@/lib/data/types"
import { cn } from "@/lib/utils"

import {
  POST_STATUS_LABELS,
  dayKey,
  gridRange,
  groupPostsByDay,
  monthGrid,
  postCalendarTime,
  shiftMonth,
} from "./calendar-model"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function statusTone(status: PostStatus) {
  switch (status) {
    case "published":
      return "bg-app-success-surface text-app-success"
    case "failed":
      return "bg-app-danger-surface text-app-danger-muted"
    case "scheduled":
    case "publishing":
      return "bg-app-action/10 text-app-action"
    default:
      return "bg-app-surface-subtle text-app-muted-text"
  }
}

function timeLabel(post: PostView) {
  return postCalendarTime(post).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

export function ContentCalendarView({
  onOpenRender,
}: {
  onOpenRender?: (renderId: string) => void
}) {
  const [anchor, setAnchor] = useState(() => shiftMonth(new Date(), 0))
  const [canceling, setCanceling] = useState<PostView | null>(null)
  const range = useMemo(() => gridRange(anchor), [anchor])
  const queryClient = useQueryClient()
  const posts = useQuery({
    queryKey: ["posts", range.from, range.to],
    queryFn: () => listPosts(range),
  })
  const status = useQuery({ queryKey: ["publisher-status"], queryFn: getPublisherStatus, retry: false })
  const byDay = useMemo(() => groupPostsByDay(posts.data ?? []), [posts.data])
  const days = useMemo(() => monthGrid(anchor), [anchor])
  const today = dayKey(new Date())
  const monthLabel = anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
  const agendaDays = days.filter(
    (day) => day.getMonth() === anchor.getMonth() && byDay.has(dayKey(day))
  )

  const entry = (post: PostView, compact: boolean) => (
    <div
      key={post.id}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-md text-left",
        compact ? "px-1.5 py-1 text-[11px]" : "px-3 py-2 text-sm",
        statusTone(post.status)
      )}
    >
      <button
        type="button"
        className="lc-focus-ring min-w-0 flex-1 truncate text-left"
        title={`${POST_STATUS_LABELS[post.status]} · ${post.provider} · ${post.renderTitle ?? "Render"}`}
        onClick={() => onOpenRender?.(post.renderId)}
      >
        <span className="font-semibold tabular-nums">{timeLabel(post)}</span>{" "}
        <span className="capitalize">{post.accountName ?? post.provider}</span>
        {compact ? null : (
          <span className="text-app-muted-text">
            {" "}
            · {post.renderTitle ?? "Render"}
            {post.batchId ? " · Batch" : ""} · {POST_STATUS_LABELS[post.status]}
          </span>
        )}
      </button>
      {!compact && post.status === "scheduled" ? (
        <IconButton label="Cancel scheduled post" className="size-8" onClick={() => setCanceling(post)}>
          <IconX />
        </IconButton>
      ) : null}
    </div>
  )

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-app-text">Schedule</h1>
        <div className="flex items-center gap-2">
          <IconButton label="Previous month" onClick={() => setAnchor((value) => shiftMonth(value, -1))}>
            <IconChevronLeft />
          </IconButton>
          <span className="min-w-[132px] text-center text-sm font-semibold text-app-text">{monthLabel}</span>
          <IconButton label="Next month" onClick={() => setAnchor((value) => shiftMonth(value, 1))}>
            <IconChevronRight />
          </IconButton>
          <Button type="button" variant="softControl" size="appDefault" onClick={() => setAnchor(shiftMonth(new Date(), 0))}>
            Today
          </Button>
        </div>
      </header>

      {status.data && !status.data.configured ? (
        <p role="status" className="rounded-xl bg-app-warning-surface px-4 py-3 text-sm text-app-warning">
          {status.data.message}. Scheduled posts will not publish until it is connected.
        </p>
      ) : null}
      {posts.error ? (
        <p role="alert" className="rounded-xl bg-app-danger-surface p-4 text-sm text-app-danger-muted">
          Posts could not be loaded.
        </p>
      ) : null}

      <div className="hidden overflow-hidden rounded-xl border border-app-panel-border bg-app-surface md:block" aria-busy={posts.isLoading}>
        <div className="grid grid-cols-7 border-b border-app-panel-border bg-app-surface-subtle">
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-2 text-xs font-semibold text-app-muted-text">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dayKey(day)
            const items = byDay.get(key) ?? []
            const inMonth = day.getMonth() === anchor.getMonth()
            return (
              <div
                key={key}
                className={cn(
                  "min-h-28 space-y-1 border-r border-b border-app-panel-border p-1.5 [&:nth-child(7n)]:border-r-0",
                  !inMonth && "bg-app-surface-subtle/60"
                )}
              >
                <div
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs font-semibold",
                    key === today ? "bg-app-action text-white" : inMonth ? "text-app-text" : "text-app-text-faint"
                  )}
                >
                  {day.getDate()}
                </div>
                {items.slice(0, 3).map((post) => entry(post, true))}
                {items.length > 3 ? (
                  <p className="px-1.5 text-[11px] font-semibold text-app-muted-text">+{items.length - 3} more</p>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>

      <section className="space-y-4 md:hidden" aria-busy={posts.isLoading}>
        {agendaDays.length === 0 && !posts.isLoading ? (
          <p className="rounded-xl border border-dashed border-app-panel-border p-6 text-center text-sm text-app-muted-text">
            Nothing scheduled this month.
          </p>
        ) : null}
        {agendaDays.map((day) => (
          <div key={dayKey(day)} className="space-y-2">
            <h2 className="text-sm font-semibold text-app-text">
              {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </h2>
            <div className="space-y-1.5">{(byDay.get(dayKey(day)) ?? []).map((post) => entry(post, false))}</div>
          </div>
        ))}
      </section>

      <section className="hidden space-y-2 md:block">
        <h2 className="text-sm font-semibold text-app-text">This month</h2>
        {agendaDays.length === 0 && !posts.isLoading ? (
          <p className="text-sm text-app-muted-text">Nothing scheduled this month.</p>
        ) : (
          <div className="space-y-1.5">
            {agendaDays.flatMap((day) => byDay.get(dayKey(day)) ?? []).map((post) => entry(post, false))}
          </div>
        )}
      </section>

      {canceling ? (
        <ConfirmDialog
          title="Cancel scheduled post?"
          description="The post is removed from SocialBu and will not publish. The render stays available."
          confirmLabel="Cancel post"
          pendingLabel="Canceling…"
          onCancel={() => setCanceling(null)}
          onConfirm={async () => {
            await cancelPost(canceling.id)
            await queryClient.invalidateQueries({ queryKey: ["posts"] })
            toast.success("Scheduled post canceled")
          }}
        />
      ) : null}
    </div>
  )
}
