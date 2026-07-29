import {
  PublicationStatusControl,
  type PublicationDisplayStatus,
} from "@/components/realfarm/publication-status-control"

import { runStatusLabel } from "./run-helpers"
import type { AutomationRunApiRecord } from "./types"

export function RunPublicationStatusBadge({
  run,
  className,
}: {
  run: AutomationRunApiRecord
  className?: string
}) {
  const label = runStatusLabel(
    run.status,
    run.socialStatuses,
    run.manuallyPublishedAt
  )
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

  return <PublicationStatusControl status={status} className={className} />
}
