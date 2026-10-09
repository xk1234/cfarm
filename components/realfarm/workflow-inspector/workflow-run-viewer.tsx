"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  IconArrowLeft,
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPlay,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import type { WorkflowInspectorRun } from "./types"
import { RawStageData, WorkflowArtifactView } from "./workflow-artifact-view"

export function WorkflowRunViewer({
  run,
  backHref,
  runningWorkflow = false,
  runningStage = false,
  canRunWorkflow = true,
  runWorkflowDisabledReason,
  onRunWorkflow,
  onRunStage,
}: {
  run: WorkflowInspectorRun
  backHref: string
  runningWorkflow?: boolean
  runningStage?: boolean
  canRunWorkflow?: boolean
  runWorkflowDisabledReason?: string
  onRunWorkflow: () => void
  onRunStage: (stageId: string) => void
}) {
  const activeIndex = run.stages.findIndex(
    (stage) => stage.status === "running" || stage.status === "failed"
  )
  const suggestedIndex =
    activeIndex >= 0
      ? activeIndex
      : Math.max(
          0,
          run.stages.findLastIndex((stage) => stage.status === "succeeded")
        )
  const [selectedId, setSelectedId] = useState(
    run.stages[suggestedIndex]?.id ?? ""
  )
  const [tab, setTab] = useState<"input" | "result">("result")
  const resolvedId =
    run.stages.some((s) => s.id === selectedId)
      ? selectedId
      : (run.stages[suggestedIndex]?.id ?? run.stages[0]?.id ?? "")
  const selectedIndex = Math.max(
    0,
    run.stages.findIndex((stage) => stage.id === resolvedId)
  )
  const stage = run.stages[selectedIndex]
  const activeTab = stage.result ? tab : "input"
  const rawValue =
    activeTab === "input"
      ? (stage.rawInput ?? stage.input.value)
      : (stage.rawResult ?? stage.result?.value)

  const elapsed = useMemo(
    () => formatElapsed(run.startedAt, run.completedAt),
    [run.completedAt, run.startedAt]
  )

  function selectStage(id: string) {
    const next = run.stages.find((item) => item.id === id)
    setSelectedId(id)
    setTab(next?.result ? "result" : "input")
  }

  return (
    <section className="mx-auto w-full max-w-5xl text-app-text">
      <header className="border-b border-app-panel-border pb-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={backHref}>
            <IconArrowLeft data-icon="inline-start" aria-hidden />
            Back to runs
          </Link>
        </Button>
        <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-[-0.025em] break-words sm:text-3xl">
              {run.workflowName} · Run {shortId(run.id)}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-app-muted-text">
              <StatusDot status={run.status} />
              <span>{statusLabel(run.status)}</span>
              <span aria-hidden>·</span>
              <time dateTime={run.completedAt || run.startedAt}>
                {formatTimestamp(run.completedAt || run.startedAt)}
              </time>
              {elapsed ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{elapsed}</span>
                </>
              ) : null}
            </div>
          </div>
          <Button
            variant={
              run.status === "succeeded" || run.status === "failed"
                ? "softControl"
                : "action"
            }
            size="appDefault"
            disabled={runningWorkflow || !canRunWorkflow}
            title={!canRunWorkflow ? runWorkflowDisabledReason : undefined}
            onClick={onRunWorkflow}
            className="sm:self-end"
          >
            <IconPlayerPlay data-icon="inline-start" aria-hidden />
            {runningWorkflow ? "Running workflow…" : "Run workflow"}
          </Button>
        </div>
      </header>

      <StageNavigation
        stages={run.stages}
        selectedId={stage.id}
        onSelect={selectStage}
      />

      <header className="flex flex-col gap-4 border-b border-app-panel-border py-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-[-0.02em] sm:text-2xl">
            {stage.title}
          </h2>
          <p className="mt-2 text-xs font-semibold text-app-muted-text">
            Stage {selectedIndex + 1} of {run.stages.length} · {stage.kind} ·{" "}
            {statusLabel(stage.status)}
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-app-muted-text">
            {stage.description}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="softControl"
            size="appDefault"
            disabled={!stage.canRun || runningStage}
            title={!stage.canRun ? stage.runDisabledReason : undefined}
            onClick={() => onRunStage(stage.id)}
          >
            <IconPlayerPlay data-icon="inline-start" aria-hidden />
            {runningStage ? "Running step…" : "Run step"}
          </Button>
          <div
            className="flex items-center"
            aria-label="Stage navigation controls"
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous stage"
              title="Previous stage"
              disabled={selectedIndex === 0}
              onClick={() => selectStage(run.stages[selectedIndex - 1].id)}
              className="rounded-r-none"
            >
              <IconChevronLeft aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next stage"
              title="Next stage"
              disabled={selectedIndex === run.stages.length - 1}
              onClick={() => selectStage(run.stages[selectedIndex + 1].id)}
              className="rounded-l-none"
            >
              <IconChevronRight aria-hidden />
            </Button>
          </div>
        </div>
        {!stage.canRun && stage.runDisabledReason ? (
          <p className="text-xs text-app-muted-text sm:hidden">
            {stage.runDisabledReason}
          </p>
        ) : null}
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setTab(value as "input" | "result")}
      >
        <TabsList aria-label="Stage inspector views">
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="result" disabled={!stage.result}>
            Result
          </TabsTrigger>
        </TabsList>
        <TabsContent value="input" className="py-7">
          <WorkflowArtifactView
            artifact={stage.input}
            stageId={stage.id}
            direction="input"
          />
          <RawStageData value={rawValue} label={`${stage.title} input`} />
        </TabsContent>
        <TabsContent value="result" className="py-7">
          {stage.result ? (
            <WorkflowArtifactView
              artifact={stage.result}
              stageId={stage.id}
              direction="output"
            />
          ) : null}
          <RawStageData value={rawValue} label={`${stage.title} result`} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function StageNavigation({
  stages,
  selectedId,
  onSelect,
}: {
  stages: WorkflowInspectorRun["stages"]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <nav
      className="overflow-x-auto border-b border-app-panel-border py-5"
      aria-label="Workflow stages"
    >
      <ol className="flex w-full min-w-[35rem] items-start px-1">
        {stages.map((stage, index) => (
          <li
            key={stage.id}
            className="relative flex min-w-28 flex-1 flex-col items-center px-2 first:pl-0 last:pr-0"
          >
            {index > 0 ? (
              <span
                className="absolute top-[9px] right-1/2 left-0 h-px bg-app-panel-border"
                aria-hidden
              />
            ) : null}
            {index < stages.length - 1 ? (
              <span
                className="absolute top-[9px] right-0 left-1/2 h-px bg-app-panel-border"
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              onClick={() => onSelect(stage.id)}
              aria-current={stage.id === selectedId ? "step" : undefined}
              aria-label={`Stage ${index + 1}: ${stage.shortLabel}, ${statusLabel(stage.status)}`}
              title={stage.title}
              className="lc-focus-ring relative z-10 flex flex-col items-center rounded-md text-center"
            >
              <span
                className={cn(
                  "block size-[19px] rounded-full border-2 bg-app-surface transition",
                  stageDotClass(stage.status, stage.id === selectedId)
                )}
                aria-hidden
              />
              <span
                className={cn(
                  "mt-2 max-w-24 text-xs font-semibold",
                  stage.id === selectedId
                    ? "text-app-text"
                    : "text-app-muted-text"
                )}
              >
                {stage.shortLabel}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

function StatusDot({ status }: { status: WorkflowInspectorRun["status"] }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full",
        status === "failed"
          ? "bg-app-danger"
          : status === "running" || status === "queued"
            ? "bg-app-warning"
            : "bg-app-success"
      )}
      aria-hidden
    />
  )
}
function stageDotClass(
  status: WorkflowInspectorRun["stages"][number]["status"],
  selected: boolean
) {
  if (status === "failed") return "border-app-danger bg-app-danger"
  if (status === "running") return "border-app-warning bg-app-warning"
  if (status === "succeeded")
    return selected
      ? "border-app-action bg-app-action ring-4 ring-app-action/15"
      : "border-app-success bg-app-success"
  return selected
    ? "border-app-action ring-4 ring-app-action/15"
    : "border-app-panel-border-strong"
}
function statusLabel(status: string) {
  return status === "succeeded"
    ? "Complete"
    : status.charAt(0).toUpperCase() + status.slice(1)
}
function shortId(id: string) {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id
}
function formatTimestamp(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
}
function formatElapsed(start: string, end?: string) {
  if (!end) return ""
  const duration = Date.parse(end) - Date.parse(start)
  if (!Number.isFinite(duration) || duration < 0) return ""
  if (duration < 60_000) return `${Math.max(1, Math.round(duration / 1000))}s`
  return `${Math.round(duration / 60_000)}m`
}
