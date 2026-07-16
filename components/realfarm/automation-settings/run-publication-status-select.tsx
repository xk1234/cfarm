"use client"

import { useState } from "react"
import { toast } from "sonner"

import {
  PublicationStatusControl,
  type PublicationDisplayStatus,
} from "@/components/realfarm/publication-status-control"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"

import { runStatusLabel } from "./run-helpers"
import type { AutomationRunApiRecord } from "./types"

export function RunPublicationStatusSelect({
  run,
  onRunChanged,
  className,
}: {
  run: AutomationRunApiRecord
  onRunChanged?: (run: AutomationRunApiRecord) => void
  className?: string
}) {
  const [marking, setMarking] = useState(false)
  const label = runStatusLabel(
    run.status,
    run.socialStatuses,
    run.manuallyPublishedAt
  )
  const canMarkPublished = label === "Not published" && Boolean(run.slideshowId)
  const status: PublicationDisplayStatus =
    label === "Published"
      ? "published"
      : label === "Scheduled"
        ? "scheduled"
        : label === "Generating"
          ? "generating"
          : label === "Failed"
            ? "failed"
            : "not_published"

  async function markPublished() {
    if (!run.slideshowId || marking) return
    setMarking(true)
    try {
      const payload = await fetchJsonWithTimeout<{
        run?: AutomationRunApiRecord
      }>(`/api/slideshows/${encodeURIComponent(run.slideshowId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "markPublished" }),
        toastOnError: false,
      })
      if (!payload.run) {
        throw new Error("The generated post was not updated.")
      }
      onRunChanged?.(payload.run)
      toast.success("Marked as published")
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "The post could not be marked as published.")
      )
    } finally {
      setMarking(false)
    }
  }

  return (
    <PublicationStatusControl
      status={status}
      marking={marking}
      className={className}
      onMarkPublished={canMarkPublished ? markPublished : undefined}
    />
  )
}
