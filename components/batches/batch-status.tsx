import type {
  BatchCounts,
  BatchItemStatus,
  BatchStatus,
} from "@/lib/data/types"
import { cn } from "@/lib/utils"

const BATCH_LABELS: Record<BatchStatus, string> = {
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  completed_with_errors: "Completed with errors",
  failed: "Failed",
  canceled: "Canceled",
}

const ITEM_LABELS: Record<BatchItemStatus, string> = {
  pending: "Pending",
  rendering: "Rendering",
  rendered: "Rendered",
  scheduling: "Scheduling",
  scheduled: "Scheduled",
  published: "Published",
  failed: "Failed",
  canceled: "Canceled",
}

type Tone = "success" | "danger" | "warning" | "neutral" | "action"

function toneClass(tone: Tone) {
  return cn(
    tone === "success" && "bg-app-success-surface text-app-success",
    tone === "danger" && "bg-app-danger-surface text-app-danger-muted",
    tone === "warning" && "bg-app-warning-surface text-app-warning",
    tone === "action" && "bg-app-action/10 text-app-action",
    tone === "neutral" && "bg-app-surface-subtle text-app-muted-text"
  )
}

function batchTone(status: BatchStatus): Tone {
  if (status === "completed") return "success"
  if (status === "failed") return "danger"
  if (status === "completed_with_errors") return "warning"
  if (status === "canceled") return "neutral"
  return "action"
}

function itemTone(status: BatchItemStatus): Tone {
  if (status === "scheduled" || status === "published") return "success"
  if (status === "failed") return "danger"
  if (status === "canceled") return "neutral"
  return "warning"
}

export function isBatchActive(status: BatchStatus) {
  return status === "queued" || status === "running"
}

export function BatchStatusBadge({
  status,
  className,
}: {
  status: BatchStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold",
        toneClass(batchTone(status)),
        className
      )}
    >
      {BATCH_LABELS[status] ?? status}
    </span>
  )
}

export function BatchItemStatusBadge({
  status,
  className,
}: {
  status: BatchItemStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold",
        toneClass(itemTone(status)),
        className
      )}
    >
      {ITEM_LABELS[status] ?? status}
    </span>
  )
}

/** "3 scheduled · 1 failed · 2 queued of 6" */
export function countsSummary(counts: BatchCounts) {
  const parts = [
    counts.queued ? `${counts.queued} queued` : null,
    counts.scheduled ? `${counts.scheduled} scheduled` : null,
    counts.published ? `${counts.published} published` : null,
    counts.failed ? `${counts.failed} failed` : null,
    counts.canceled ? `${counts.canceled} canceled` : null,
  ].filter(Boolean)
  return `${parts.length ? `${parts.join(" · ")} of ` : ""}${counts.total} item${counts.total === 1 ? "" : "s"}`
}
