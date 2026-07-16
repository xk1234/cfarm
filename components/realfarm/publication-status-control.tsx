"use client"

import { cn } from "@/lib/utils"

export type PublicationDisplayStatus =
  "not_published" | "scheduled" | "published" | "generating" | "failed"

export function PublicationStatusControl({
  status,
  marking = false,
  className,
  onMarkPublished,
}: {
  status: PublicationDisplayStatus
  marking?: boolean
  className?: string
  onMarkPublished?: () => void | Promise<void>
}) {
  const label = publicationStatusLabel(status)
  const statusClass = publicationStatusClass(status)

  if (status !== "not_published" || !onMarkPublished) {
    return (
      <span
        className={cn(
          "inline-flex h-7 items-center rounded-full px-2.5 text-[10px] font-bold shadow-sm",
          statusClass,
          className
        )}
      >
        {label}
      </span>
    )
  }

  return (
    <select
      value=""
      disabled={marking}
      aria-label="Publication status"
      className={cn(
        "h-7 cursor-pointer appearance-auto rounded-full border-0 px-2.5 text-[10px] font-bold shadow-sm transition outline-none hover:bg-app-surface focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-wait",
        statusClass,
        className
      )}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        if (event.target.value === "mark_published") {
          void onMarkPublished()
        }
      }}
    >
      <option value="">{marking ? "Marking…" : label}</option>
      <option value="mark_published">Mark as published</option>
    </select>
  )
}

function publicationStatusLabel(status: PublicationDisplayStatus) {
  if (status === "published") return "Published"
  if (status === "scheduled") return "Scheduled"
  if (status === "generating") return "Generating"
  if (status === "failed") return "Failed"
  return "Not published"
}

function publicationStatusClass(status: PublicationDisplayStatus) {
  if (status === "published") return "bg-emerald-600 text-white"
  if (status === "scheduled") return "bg-blue-600 text-white"
  if (status === "generating") return "bg-[#ff4d2d] text-white"
  if (status === "failed") return "bg-[#d94444] text-white"
  return "bg-white/90 text-app-text"
}
