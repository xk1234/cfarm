"use client"

import { useState } from "react"
import type { ReactNode } from "react"
import {
  IconArrowUpRight,
  IconBraces,
  IconCheck,
  IconChevronDown,
  IconClipboard,
  IconPhoto,
  IconRoute,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { WorkflowArtifactPreview } from "@/components/realfarm/workflow-artifacts/artifact-preview"
import type { WorkflowArtifactContext } from "@/components/realfarm/workflow-artifacts/artifact-utils"
import type {
  SlideshowWorkflowTrace,
  SlideshowWorkflowTraceStage,
} from "@/lib/slideshow-workflow-trace"
import { cn } from "@/lib/utils"

export function PublicWorkflowTrace({
  trace,
  slideshowUrl,
}: {
  trace: SlideshowWorkflowTrace
  slideshowUrl: string
}) {
  const [mode, setMode] = useState<"visual" | "json">("visual")
  const completed = trace.stages.filter(
    (stage) => stage.status === "succeeded"
  ).length

  async function copyTrace() {
    await navigator.clipboard.writeText(JSON.stringify(trace, null, 2))
    toast.success("Workflow JSON copied")
  }

  return (
    <main className="bg-app-page-bg min-h-screen px-4 py-6 text-app-text sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-app-panel-border bg-background p-5 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-app-action text-white shadow-sm">
                <IconRoute className="size-5" />
              </span>
              <h1 className="min-w-0 truncate text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                {trace.title}
              </h1>
            </div>
            <Button asChild variant="outline">
              <a href={slideshowUrl}>
                <IconPhoto className="size-4" />
                View slideshow
                <IconArrowUpRight className="size-4" />
              </a>
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <TraceChip>{trace.stages.length} stages</TraceChip>
            <TraceChip>{completed} completed</TraceChip>
            <TraceChip>{trace.status}</TraceChip>
            <TraceChip>Run {trace.runId}</TraceChip>
          </div>
        </header>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-lg border border-app-panel-border bg-background p-1 shadow-sm">
            <button
              type="button"
              className={modeButtonClass(mode === "visual")}
              onClick={() => setMode("visual")}
            >
              <IconRoute className="size-4" />
              Visual
            </button>
            <button
              type="button"
              className={modeButtonClass(mode === "json")}
              onClick={() => setMode("json")}
            >
              <IconBraces className="size-4" />
              Raw JSON
            </button>
          </div>
          <Button variant="outline" onClick={() => void copyTrace()}>
            <IconClipboard className="size-4" />
            Copy JSON
          </Button>
        </div>

        {mode === "json" ? (
          <pre className="mt-4 max-h-[75vh] overflow-auto rounded-2xl border border-[#252833] bg-[#111319] p-4 text-xs leading-6 text-[#e7e9ee] shadow-xl sm:p-6">
            {JSON.stringify(trace, null, 2)}
          </pre>
        ) : (
          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0 space-y-3">
              {trace.stages.map((stage, index) => (
                <WorkflowStageCard
                  key={stage.id}
                  stage={stage}
                  defaultOpen={index === 0 || index === trace.stages.length - 1}
                />
              ))}
            </section>
            <aside className="min-w-0 space-y-4 lg:sticky lg:top-5 lg:self-start">
              <TracePanel
                title="Workflow input"
                value={trace.input}
                artifactContext={{ direction: "input" }}
              />
              <TracePanel
                title="Final output"
                value={trace.output}
                artifactContext={{ direction: "output" }}
              />
            </aside>
          </div>
        )}
      </div>
    </main>
  )
}

function WorkflowStageCard({
  stage,
  defaultOpen,
}: {
  stage: SlideshowWorkflowTraceStage
  defaultOpen: boolean
}) {
  return (
    <details
      className="group overflow-hidden rounded-xl border border-app-panel-border bg-background shadow-sm open:shadow-md"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 marker:hidden sm:px-5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold",
            stage.status === "skipped"
              ? "bg-app-control-bg text-app-text-faint"
              : "bg-emerald-100 text-emerald-700"
          )}
        >
          {stage.status === "skipped" ? (
            stage.order
          ) : (
            <IconCheck className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{stage.title}</h2>
            <StageBadge>{stage.kind}</StageBadge>
            {stage.status === "skipped" ? (
              <StageBadge>skipped</StageBadge>
            ) : null}
            {stage.dataSource === "reconstructed" ? (
              <StageBadge>reconstructed</StageBadge>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-5 text-app-muted-text">
            {stage.description}
          </p>
        </div>
        <IconChevronDown className="size-5 shrink-0 text-app-text-faint transition group-open:rotate-180" />
      </summary>
      <div className="grid gap-3 border-t border-app-panel-border bg-app-surface-subtle p-3 sm:grid-cols-2 sm:p-4">
        <TracePanel
          title="Input"
          value={stage.input}
          compact
          artifactContext={{ stageId: stage.id, direction: "input" }}
        />
        <TracePanel
          title="Output"
          value={stage.output}
          compact
          artifactContext={{ stageId: stage.id, direction: "output" }}
        />
      </div>
    </details>
  )
}

function TracePanel({
  title,
  value,
  compact = false,
  artifactContext,
}: {
  title: string
  value: unknown
  compact?: boolean
  artifactContext?: WorkflowArtifactContext
}) {
  return (
    <section className="min-w-0 rounded-xl border border-app-panel-border bg-background p-4 shadow-sm">
      <h3 className="text-xs font-semibold tracking-[0.12em] text-app-text-faint uppercase">
        {title}
      </h3>
      <div
        className={cn("mt-3", compact && "max-h-[420px] overflow-auto pr-1")}
      >
        <WorkflowArtifactPreview value={value} context={artifactContext} />
      </div>
    </section>
  )
}

function TraceChip({ children }: { children: ReactNode }) {
  return (
    <span className="max-w-full truncate rounded-full border border-app-panel-border bg-app-surface-subtle px-3 py-1.5 text-xs font-semibold text-app-muted-text">
      {children}
    </span>
  )
}

function StageBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-app-control-bg px-2 py-0.5 text-[10px] font-semibold tracking-wide text-app-muted-text uppercase">
      {children}
    </span>
  )
}

function modeButtonClass(active: boolean) {
  return cn(
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
    active
      ? "bg-app-strong text-white shadow-sm"
      : "text-app-muted-text hover:bg-app-control-hover"
  )
}
