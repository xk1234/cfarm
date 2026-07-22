"use client"

import { useState } from "react"
import useSWR from "swr"

import type { AnalyticsPayload } from "@/components/realfarm/analytics/analytics-view"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import { clientSWRFetcher } from "@/lib/client-swr"

export function useAnalyticsData(previewData?: AnalyticsPayload) {
  const [days, setDays] = useState(previewData?.days ?? 30)
  const [refreshing, setRefreshing] = useState(false)
  const requestKey = `/api/analytics/report?days=${days}`
  const report = useSWR<AnalyticsPayload>(
    previewData ? null : requestKey,
    clientSWRFetcher,
    { keepPreviousData: true, fallbackData: previewData }
  )

  async function refresh(integrationIds: string[]) {
    if (previewData) return
    setRefreshing(true)
    try {
      await fetchJsonWithTimeout("/api/analytics/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days, integrationIds }),
        timeoutMs: 120_000,
      })
      await report.mutate()
    } finally {
      setRefreshing(false)
    }
  }

  return {
    ...report,
    days,
    setDays,
    refreshing,
    refresh,
  }
}
