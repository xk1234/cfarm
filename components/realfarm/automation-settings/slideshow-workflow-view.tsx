"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"

import { WorkflowRunViewer } from "@/components/realfarm/workflow-inspector/workflow-run-viewer"
import { Button } from "@/components/ui/button"
import { fetchJsonWithTimeout, getApiErrorMessage } from "@/lib/client-api"

import {
  buildSlideshowInspectorRun,
  slideshowWorkflowStorageKey,
  type SlideshowWorkflowRun,
} from "./slideshow-workflow"
import type { AutomationRunApiRecord } from "./types"
import { WorkflowForkPanel } from "./workflow-fork-panel"

export function SlideshowWorkflowPanel({ runId }: { runId: string }) {
  const [run, setRun] = useState<AutomationRunApiRecord | null>(null)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    const cached = readCachedRun(runId)
    if (cached) {
      setRun(cached)
      setError("")
    }

    try {
      const payload = await fetchJsonWithTimeout<{
        error?: string
        runs?: AutomationRunApiRecord[]
      }>("/api/automations/runs?limit=500", {
        cache: "no-store",
        toastOnError: false,
      })
      const requested = payload.runs?.find(
        (item) => item.id === runId || item.slideshowId === runId
      )
      if (requested) {
        setRun(requested)
        setError("")
        return
      }
      if (!cached) throw new Error("This slideshow workflow was not found.")
    } catch (cause) {
      if (!cached) throw cause
    }
  }, [runId])

  useEffect(() => {
    const initial = window.setTimeout(
      () => load().catch((cause) => setError(errorMessage(cause))),
      0
    )
    return () => window.clearTimeout(initial)
  }, [load])

  if (run) return <SlideshowWorkflowView run={run} />

  if (error) {
    return (
      <section className="mx-auto w-full max-w-3xl border-y border-app-danger/25 py-8 text-app-danger">
        <h1 className="text-xl font-semibold">Workflow unavailable</h1>
        <p className="mt-2 text-sm font-medium">{error}</p>
        <Button
          type="button"
          className="mt-5"
          variant="outline"
          onClick={() => {
            setError("")
            void load().catch((cause) => setError(errorMessage(cause)))
          }}
        >
          Try again
        </Button>
      </section>
    )
  }

  return (
    <section
      className="mx-auto w-full max-w-5xl animate-pulse"
      aria-label="Loading slideshow workflow"
      role="status"
    >
      <div className="h-8 w-28 rounded bg-app-control-hover" />
      <div className="mt-8 h-16 w-3/5 rounded bg-app-control-hover" />
      <div className="mt-8 h-16 w-full rounded bg-app-control-hover" />
      <div className="mt-8 h-[24rem] rounded bg-app-control-hover" />
    </section>
  )
}

export function SlideshowWorkflowView({ run }: { run: SlideshowWorkflowRun }) {
  const router = useRouter()
  const [forkOpen, setForkOpen] = useState(false)
  const [runningWorkflow, setRunningWorkflow] = useState(false)
  const [runError, setRunError] = useState("")
  const inspectorRun = buildSlideshowInspectorRun(run)

  async function runWorkflow() {
    setRunningWorkflow(true)
    setRunError("")
    try {
      const payload = await fetchJsonWithTimeout<{
        error?: string
        created?: AutomationRunApiRecord[]
      }>("/api/automations/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          automationId: run.automationId,
          force: true,
          requestId: `workflow-rerun-${crypto.randomUUID()}`,
        }),
        toastOnError: false,
      })
      const created = payload.created?.[0]
      if (!created) throw new Error("The workflow did not create a new run.")
      window.sessionStorage.setItem(
        slideshowWorkflowStorageKey(created.id),
        JSON.stringify(created)
      )
      router.push(`/app/workflows/slideshows/${encodeURIComponent(created.id)}`)
    } catch (cause) {
      setRunError(errorMessage(cause))
    } finally {
      setRunningWorkflow(false)
    }
  }

  return (
    <>
      {runError ? (
        <div
          role="alert"
          className="mx-auto mb-5 w-full max-w-5xl border-y border-app-danger/25 py-3 text-sm font-medium text-app-danger"
        >
          {runError}
        </div>
      ) : null}
      <WorkflowRunViewer
        run={inspectorRun}
        backHref={`/app?view=automations&automation=${encodeURIComponent(run.automationId)}`}
        runningWorkflow={runningWorkflow}
        onRunWorkflow={() => void runWorkflow()}
        onRunStage={(stageId) => {
          if (stageId === "generate-text") setForkOpen(true)
        }}
      />
      {forkOpen ? (
        <WorkflowForkPanel
          run={run as AutomationRunApiRecord}
          prompt={run.plan?.debug?.textModelPrompt}
          onClose={() => setForkOpen(false)}
        />
      ) : null}
    </>
  )
}

function errorMessage(cause: unknown) {
  return getApiErrorMessage(cause, "The workflow could not be loaded.")
}

function readCachedRun(runId: string): AutomationRunApiRecord | null {
  try {
    const raw = window.sessionStorage.getItem(
      slideshowWorkflowStorageKey(runId)
    )
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<AutomationRunApiRecord>
    if (parsed.id !== runId && parsed.slideshowId !== runId) return null
    const timestamp = parsed.createdAt || parsed.scheduledFor || ""
    return {
      ...parsed,
      id: parsed.id || runId,
      automationId: parsed.automationId || "",
      automationTitle:
        parsed.automationTitle || parsed.plan?.title || "Slideshow",
      scheduledFor: parsed.scheduledFor || timestamp,
      status:
        parsed.status === "running" || parsed.status === "failed"
          ? parsed.status
          : "succeeded",
      createdAt: parsed.createdAt || timestamp,
    }
  } catch {
    return null
  }
}
