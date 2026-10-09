"use client"

import { useCallback, useEffect, useState } from "react"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"

import { WorkflowRunViewer } from "@/components/realfarm/workflow-inspector/workflow-run-viewer"
import { Button } from "@/components/ui/button"
import type { UgcCostBreakdown } from "@/lib/ugc-cost"
import type { UgcRunStatus } from "@/lib/ugc-run-status"

import {
  buildUgcInspectorRun,
  type UgcWorkflowContext,
} from "./workflow-step-details"

export type UgcRunResponse = {
  run: UgcRunStatus
  estimate: UgcCostBreakdown
  actual: UgcCostBreakdown
  workflow: UgcWorkflowContext
}

export function UgcRunStatusPanel({ runId }: { runId: string }) {
  const [data, setData] = useState<UgcRunResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    const body = await fetchJsonWithTimeout<UgcRunResponse>(
      `/api/ugc-runs/${encodeURIComponent(runId)}`,
      {
        cache: "no-store",
        toastOnError: false,
        signal,
      }
    )
    setData(body)
    setError(null)
  }, [runId])

  useEffect(() => {
    const controller = new AbortController()
    const initial = window.setTimeout(
      () => load(controller.signal).catch((cause) => {
        if (!controller.signal.aborted) setError(errorMessage(cause))
      }),
      0
    )
    const timer = window.setInterval(() => {
      void load(controller.signal).catch(() => undefined)
    }, 5000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
      controller.abort()
    }
  }, [load])

  if (!data) {
    return error ? (
      <LoadFailure message={error} onRetry={load} />
    ) : (
      <WorkflowSkeleton />
    )
  }

  return <UgcWorkflowDisplay data={data} error={error} />
}

export function UgcWorkflowDisplay({
  data,
  error,
}: {
  data: UgcRunResponse
  error?: string | null
  retrying?: boolean
  onRetry?: () => void
}) {
  const inspectorRun = buildUgcInspectorRun(data)

  return (
    <>
      {error ? (
        <p
          role="alert"
          className="mx-auto mb-5 w-full max-w-5xl border-y border-app-danger/25 py-3 text-sm font-medium text-app-danger"
        >
          {error}
        </p>
      ) : null}
      <WorkflowRunViewer
        run={inspectorRun}
        backHref="/app?view=automations"
        canRunWorkflow={false}
        runWorkflowDisabledReason="Creating a new UGC run from this historical run is not available yet."
        onRunWorkflow={() => undefined}
        onRunStage={() => undefined}
      />
    </>
  )
}

function WorkflowSkeleton() {
  return (
    <section
      role="status"
      aria-label="Loading workflow"
      className="mx-auto w-full max-w-5xl animate-pulse"
    >
      <div className="h-8 w-28 rounded bg-app-media-empty" />
      <div className="mt-9 h-16 w-2/3 rounded bg-app-media-empty" />
      <div className="mt-10 h-16 rounded bg-app-media-empty" />
      <div className="mt-8 h-[28rem] rounded bg-app-media-empty" />
    </section>
  )
}

function LoadFailure({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => Promise<void>
}) {
  return (
    <section className="mx-auto w-full max-w-3xl border-y border-app-danger/25 py-8 text-app-danger">
      <h1 className="text-xl font-semibold">Workflow unavailable</h1>
      <p className="mt-4 text-sm leading-6 font-medium">{message}</p>
      <Button
        variant="softControl"
        size="appDefault"
        className="mt-5"
        onClick={() => void onRetry()}
      >
        Try again
      </Button>
    </section>
  )
}

function errorMessage(cause: unknown) {
  return getApiErrorMessage(cause, "Could not load this UGC run.")
}
