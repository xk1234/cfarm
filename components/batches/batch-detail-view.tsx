"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  IconArrowLeft,
  IconPhoto,
  IconRefresh,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import {
  cancelBatchRemote,
  getBatch,
  retryBatchRemote,
  type BatchDetailView as BatchView,
} from "@/components/realfarm/api-client"
import { formatDateTime } from "@/components/render/render-status"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { IconButton } from "@/components/ui/icon-button"

import {
  BatchItemStatusBadge,
  BatchStatusBadge,
  countsSummary,
  isBatchActive,
} from "./batch-status"

type BatchItemView = BatchView["items"][number]

export function BatchDetailView({
  batchId,
  onBack,
  onOpenRender,
}: {
  batchId: string
  onBack: () => void
  onOpenRender: (renderId: string) => void
}) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ["batch", batchId],
    queryFn: () => getBatch(batchId),
    refetchInterval: (state) => {
      const batch = state.state.data
      if (!batch) return false
      const inFlight = batch.items.some((item) =>
        ["pending", "rendering", "rendered", "scheduling"].includes(item.status)
      )
      return isBatchActive(batch.status) || inFlight ? 2500 : false
    },
  })
  const [retrying, setRetrying] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const batch = query.data

  async function retry() {
    setRetrying(true)
    try {
      const result = await retryBatchRemote(batchId)
      queryClient.setQueryData(["batch", batchId], result.batch)
      await queryClient.invalidateQueries({ queryKey: ["batches"] })
      if (result.retried.length)
        toast.success(
          `Retrying ${result.retried.length} item${result.retried.length === 1 ? "" : "s"}`
        )
      else toast.error(result.skipped[0]?.reason ?? "Nothing to retry")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed")
    } finally {
      setRetrying(false)
    }
  }

  async function cancel() {
    const result = await cancelBatchRemote(batchId)
    queryClient.setQueryData(["batch", batchId], result.batch)
    await queryClient.invalidateQueries({ queryKey: ["batches"] })
    await queryClient.invalidateQueries({ queryKey: ["posts"] })
    if (result.failures.length) {
      toast.error(
        `${result.failures.length} SocialBu post${result.failures.length === 1 ? "" : "s"} could not be deleted`
      )
    } else {
      toast.success("Batch canceled")
    }
  }

  const failed =
    batch?.items.filter((item) => item.status === "failed").length ?? 0
  const stalled =
    batch?.items.filter(
      (item) => item.status === "pending" || item.status === "rendered"
    ).length ?? 0
  const cancelable =
    !!batch &&
    batch.status !== "canceled" &&
    batch.items.some(
      (item) => !["published", "failed", "canceled"].includes(item.status)
    )

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="Back to batches" onClick={onBack}>
            <IconArrowLeft />
          </IconButton>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em] text-app-text">
              {batch ? batch.name : "Batch"}
            </h1>
            {batch ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-app-muted-text">
                <BatchStatusBadge status={batch.status} />
                <span>{countsSummary(batch.counts)}</span>
                <span>{formatDateTime(batch.createdAt)}</span>
                {batch.mode === "draft" ? <span>TikTok drafts</span> : null}
              </p>
            ) : null}
          </div>
        </div>
        {batch ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="softControl"
              size="appDefault"
              className="min-w-[124px]"
              disabled={
                retrying ||
                batch.status === "canceled" ||
                failed + stalled === 0
              }
              title={failed + stalled === 0 ? "No failed items" : undefined}
              onClick={() => void retry()}
            >
              <IconRefresh />
              {retrying ? "Retrying…" : "Retry failed"}
            </Button>
            {cancelable ? (
              <Button
                type="button"
                variant="softControl"
                size="appDefault"
                onClick={() => setConfirmCancel(true)}
              >
                <IconX />
                Cancel batch
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {query.isLoading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl bg-app-surface-subtle"
            />
          ))}
        </div>
      ) : query.error || !batch ? (
        <p
          role="alert"
          className="rounded-xl bg-app-danger-surface p-4 text-sm text-app-danger-muted"
        >
          {query.error instanceof Error
            ? query.error.message
            : "Batch not found."}
        </p>
      ) : (
        <ol className="space-y-3" aria-label="Batch items">
          {batch.items.map((item) => (
            <li key={item.index}>
              <BatchItemRow
                item={item}
                timezone={batch.timezone}
                onOpenRender={onOpenRender}
              />
            </li>
          ))}
        </ol>
      )}

      {confirmCancel && batch ? (
        <ConfirmDialog
          title="Cancel this batch?"
          description="Queued renders stop and scheduled SocialBu posts that have not been published are deleted. Published posts stay."
          confirmLabel="Cancel batch"
          pendingLabel="Canceling…"
          onCancel={() => setConfirmCancel(false)}
          onConfirm={cancel}
        />
      ) : null}
    </div>
  )
}

function publishLabel(iso: string, timezone: string | null) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  try {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone ?? undefined,
      timeZoneName: "short",
    })
  } catch {
    return formatDateTime(iso)
  }
}

function BatchItemRow({
  item,
  timezone,
  onOpenRender,
}: {
  item: BatchItemView
  timezone: string | null
  onOpenRender: (renderId: string) => void
}) {
  const slides = item.render?.slides ?? []
  return (
    <article
      className="flex gap-3 rounded-xl border border-app-panel-border bg-app-surface p-3"
      aria-label={`Item ${item.index + 1}`}
    >
      <div className="flex shrink-0 gap-1">
        {slides.length ? (
          slides.slice(0, 3).map((slide) => (
            // eslint-disable-next-line @next/next/no-img-element -- owner-checked render file
            <img
              key={slide.index}
              src={slide.url}
              alt={`Item ${item.index + 1} slide ${slide.index + 1}`}
              loading="lazy"
              className="w-12 rounded-md bg-app-surface-subtle object-cover sm:w-14"
              style={{ aspectRatio: `${slide.width} / ${slide.height}` }}
            />
          ))
        ) : (
          <span className="grid aspect-[9/16] w-12 place-items-center rounded-md bg-app-surface-subtle sm:w-14">
            <IconPhoto className="size-4 text-app-muted-text" />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-app-text tabular-nums">
            #{item.index + 1}
          </span>
          <BatchItemStatusBadge status={item.status} />
          <span className="text-xs text-app-muted-text">
            {[
              `Account ${item.accountId}`,
              publishLabel(item.publishAt, timezone),
              item.rescheduled ? "moved to the next free slot" : null,
              `${item.slideCount} slide${item.slideCount === 1 ? "" : "s"}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        {item.caption ? (
          <p className="line-clamp-2 text-sm break-words text-app-text">
            {item.caption}
          </p>
        ) : null}
        {item.error ? (
          <p role="alert" className="text-sm text-app-danger-muted">
            {item.error}
          </p>
        ) : null}
        {item.render ? (
          <button
            type="button"
            className="lc-focus-ring rounded text-xs font-semibold text-app-action hover:underline"
            onClick={() => onOpenRender(item.render!.id)}
          >
            Open render
          </button>
        ) : null}
      </div>
    </article>
  )
}
