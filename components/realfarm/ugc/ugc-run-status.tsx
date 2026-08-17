"use client"

import { useCallback, useEffect, useState } from "react"

import { WorkflowArtifactPreview } from "@/components/realfarm/workflow-artifacts/artifact-preview"
import { Button } from "@/components/ui/button"
import { ResponsivePageHeader } from "@/components/ui/responsive-layout"
import type { UgcCostBreakdown } from "@/lib/ugc-cost"
import type { UgcRunStatus } from "@/lib/ugc-run-status"

type RunResponse = {
  run: UgcRunStatus
  estimate: UgcCostBreakdown
  actual: UgcCostBreakdown
}

export function UgcRunStatusPanel({ runId }: { runId: string }) {
  const [data, setData] = useState<RunResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const load = useCallback(async () => {
    const response = await fetch(`/api/ugc-runs/${encodeURIComponent(runId)}`, {
      cache: "no-store",
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok)
      throw new Error(body.error || "Could not load this UGC run.")
    setData(body)
    setError(null)
  }, [runId])

  useEffect(() => {
    const initial = window.setTimeout(
      () =>
        load().catch((cause) =>
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load this UGC run."
          )
        ),
      0
    )
    const timer = window.setInterval(() => load().catch(() => undefined), 5000)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(timer)
    }
  }, [load])

  async function retry() {
    setRetrying(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/ugc-runs/${encodeURIComponent(runId)}/retry`,
        { method: "POST" }
      )
      const body = await response.json().catch(() => ({}))
      if (!response.ok)
        throw new Error(body.error || "Could not retry this run.")
      await load()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not retry this run."
      )
    } finally {
      setRetrying(false)
    }
  }

  if (!data)
    return (
      <section className="w-full rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-6">
        {error || "Loading UGC run…"}
      </section>
    )

  const failed =
    data.run.stages.some((stage) => stage.status === "failed") ||
    data.run.status === "failed"
  return (
    <section className="w-full space-y-6 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
      <div>
        <ResponsivePageHeader
          className="mb-2"
          title="UGC generation"
          actions={
            <Button
              type="button"
              onClick={retry}
              disabled={retrying || !failed}
              variant="softControl"
            >
              {retrying ? "Re-enqueuing…" : "Retry from cache"}
            </Button>
          }
        />
        <p className="font-mono text-xs break-all text-muted-foreground">
          {data.run.id}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <ol className="grid gap-2 sm:grid-cols-2">
        {data.run.stages.map((stage, index) => (
          <li key={stage.name} className="rounded-xl border border-border p-3">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${stage.status === "done" ? "bg-emerald-500/15 text-emerald-600" : stage.status === "failed" ? "bg-destructive/15 text-destructive" : stage.status === "active" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                {stage.status === "done" ? "✓" : index + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium capitalize">{stage.name}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {stage.status}
                </p>
                {stage.assetPaths.length ? (
                  <p
                    className="mt-1 truncate font-mono text-[11px] text-muted-foreground"
                    title={stage.assetPaths.join("\n")}
                  >
                    {stage.assetPaths.length} cached asset
                    {stage.assetPaths.length === 1 ? "" : "s"}
                  </p>
                ) : null}
              </div>
            </div>
            {data.run.checkpoints[stage.name] ? (
              <details className="mt-3 border-t border-border pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                  View result
                </summary>
                <div className="mt-3 max-h-96 overflow-auto rounded-xl bg-muted/40 p-3">
                  <WorkflowArtifactPreview
                    value={data.run.checkpoints[stage.name]}
                    context={{
                      stageId: `ugc-video-generation.${stage.name}`,
                      direction: "output",
                    }}
                  />
                </div>
              </details>
            ) : null}
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-2">
        <CostCard
          title={`${data.estimate.tier === "premium" ? "Premium" : "Low-cost"} estimate`}
          cost={data.estimate}
        />
        <CostCard title="Actual so far" cost={data.actual} />
      </div>
      <p className="text-xs text-muted-foreground">
        Actual items marked “derived” use the current estimate table because the
        provider ledger did not return a billed dollar amount.
      </p>
    </section>
  )
}

function CostCard({ title, cost }: { title: string; cost: UgcCostBreakdown }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-medium">{title}</h2>
        <strong className="font-mono text-lg">{money(cost.totalUsd)}</strong>
      </div>
      <ul className="space-y-2">
        {cost.items.length ? (
          cost.items.map((entry) => (
            <li
              key={`${entry.stage}-${entry.model}`}
              className="flex justify-between gap-3 text-sm"
            >
              <span
                className="min-w-0 truncate text-muted-foreground capitalize"
                title={`${entry.provider} · ${entry.model}`}
              >
                {entry.stage}
                {entry.quantity > 1 ? ` × ${entry.quantity}` : ""}
                {entry.source === "derived" ? " (derived)" : ""}
              </span>
              <span className="font-mono">{money(entry.costUsd)}</span>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted-foreground">
            No provider charges recorded yet.
          </li>
        )}
      </ul>
    </div>
  )
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
}
