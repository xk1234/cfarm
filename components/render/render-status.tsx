import type { RenderStatus } from "@/lib/data/types"
import { cn } from "@/lib/utils"

const LABELS: Record<RenderStatus, string> = {
  queued: "Queued",
  rendering: "Rendering",
  succeeded: "Ready",
  failed: "Failed",
}

export function RenderStatusBadge({ status, className }: { status: RenderStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold",
        status === "succeeded" && "bg-app-success-surface text-app-success",
        status === "failed" && "bg-app-danger-surface text-app-danger-muted",
        (status === "queued" || status === "rendering") && "bg-app-warning-surface text-app-warning",
        className
      )}
    >
      {LABELS[status] ?? status}
    </span>
  )
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
