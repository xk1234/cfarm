"use client"

import { cn } from "@/lib/utils"

export type PublicationDisplayStatus =
  "not_published" | "scheduled" | "published" | "generating" | "failed"

export function PublicationStatusControl({
  status,
  className,
}: {
  status: PublicationDisplayStatus
  className?: string
}) {
  const label = publicationStatusLabel(status)
  const statusClass = publicationStatusClass(status)

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
