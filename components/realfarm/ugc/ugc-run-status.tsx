"use client"

import { useCallback, useEffect, useState } from "react"

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
      <section className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 text-card-foreground">
        {error || "Loading UGC run…"}
      </section>
    )

  const failed =
    data.run.stages.some((stage) => stage.status === "failed") ||
    data.run.status === "failed"
  return (
    <section className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            UGC generation
          </p>
          <h1 className="mt-1 text-xl font-semibold">Honest progress & cost</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {data.run.id}
          </p>
        </div>
        <button
          type="button"
          onClick={retry}
          disabled={retrying || !failed}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {retrying ? "Re-enqueuing…" : "Retry from cache"}
        </button>
      </header>

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
          <li
            key={stage.name}
            className="flex items-start gap-3 rounded-xl border border-border p-3"
          >
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
