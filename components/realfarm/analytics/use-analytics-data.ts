"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"

import type { AnalyticsPayload } from "@/components/realfarm/analytics/analytics-view"
import {
  analyticsNeedsRefresh,
  analyticsRefreshKey,
} from "@/lib/analytics-auto-refresh"
import { fetchJsonWithTimeout } from "@/lib/client-api"
import { clientSWRFetcher } from "@/lib/client-swr"

export function useAnalyticsData(previewData?: AnalyticsPayload) {
  const [days, setDays] = useState(previewData?.days ?? 30)
  const [refreshing, setRefreshing] = useState(false)
  const attemptedRefresh = useRef("")
  const requestKey = `/api/analytics/report?days=${days}`
  const report = useSWR<AnalyticsPayload>(
    previewData ? null : requestKey,
    clientSWRFetcher,
    { keepPreviousData: true, fallbackData: previewData }
  )
  const mutateReport = report.mutate

  const refresh = useCallback(
    async (integrationIds: string[]) => {
      if (previewData) return
      setRefreshing(true)
      try {
        await fetchJsonWithTimeout("/api/analytics/report", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ days, integrationIds }),
          timeoutMs: 120_000,
          toastOnError: false,
        })
        await mutateReport()
      } finally {
        setRefreshing(false)
      }
    },
    [days, mutateReport, previewData]
  )

  useEffect(() => {
    const data = report.data
    if (
      previewData ||
      !data ||
      report.isLoading ||
      refreshing ||
      data.integrations.length === 0 ||
      !analyticsNeedsRefresh({
        integrationIds: data.integrations.map(
          (integration) => integration.integration_id
        ),
        snapshots: data.snapshots,
        followerSnapshots: data.followerSnapshots,
      })
    ) {
      return
    }
    const integrationIds = data.integrations.map(
      (integration) => integration.integration_id
    )
    const key = analyticsRefreshKey({
      integrationIds,
      days,
      snapshots: data.snapshots,
      followerSnapshots: data.followerSnapshots,
    })
    if (attemptedRefresh.current === key) return
    attemptedRefresh.current = key
    void refresh(integrationIds).catch(() => undefined)
  }, [days, previewData, refresh, refreshing, report.data, report.isLoading])

  return {
    ...report,
    days,
    setDays,
    refreshing,
    refresh,
  }
}
