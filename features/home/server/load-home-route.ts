import "server-only"

import {
  automationRecordToSummary,
  listAutomationRecords,
} from "@/lib/automations"
import { loadPublishedPostDates } from "@/lib/published-post-dates"
import { xAutomationToAutomation } from "@/lib/x-automation"
import { listXAutomations } from "@/lib/x-automation-store"

import type { HomeRouteData } from "@/features/home/domain/home"

export async function loadHomeRouteData(): Promise<HomeRouteData> {
  const [records, xAutomations, publishedPostDates] = await Promise.all([
    listAutomationRecords(),
    listXAutomations(),
    loadPublishedPostDates(),
  ])
  const automations = [
    ...records.map(automationRecordToSummary),
    ...xAutomations.map(xAutomationToAutomation),
  ]

  return {
    automations: automations
      .map((automation, index) => ({ automation, index }))
      .sort(
        (left, right) =>
          Number(right.automation.favorite) -
            Number(left.automation.favorite) || left.index - right.index
      )
      .map(({ automation }) => automation),
    publishedPostDates,
  }
}
