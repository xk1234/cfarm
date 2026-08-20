"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"

import { HomeView } from "@/components/realfarm/home-view"
import type { GeneratedShowcaseRun } from "@/components/realfarm/template-showcase-preview"
import type { AutomationRunSummary } from "@/components/realfarm/workspace-types"
import type { HomeRouteData } from "@/features/home/domain/home"
import { clientSWRFetcher } from "@/lib/client-swr"

export function HomeScreen({
  currentUserId,
  initialData,
}: {
  currentUserId: string
  initialData: HomeRouteData
}) {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR<{
    runs?: AutomationRunSummary[]
  }>("/api/templates/runs?view=summary&limit=100", clientSWRFetcher)
  const runsByAutomationId = useMemo(
    () =>
      (data?.runs ?? []).reduce<Record<string, GeneratedShowcaseRun[]>>(
        (groups, run) => {
          groups[run.automationId] = [...(groups[run.automationId] ?? []), run]
          return groups
        },
        {}
      ),
    [data?.runs]
  )

  return (
    <HomeView
      currentUserId={currentUserId}
      automations={initialData.automations}
      publishedPostDates={initialData.publishedPostDates}
      generatedRunsByAutomationId={runsByAutomationId}
      generatedRunsLoading={isLoading}
      generatedRunsError={error instanceof Error ? error.message : ""}
      onRetryGeneratedRuns={() => void mutate()}
      onAutomations={() => router.push("/app/templates")}
      onGenerationRunRemove={(runId) => {
        void mutate(
          (current) => ({
            ...current,
            runs: (current?.runs ?? []).filter((run) => run.id !== runId),
          }),
          { revalidate: false }
        )
      }}
    />
  )
}
