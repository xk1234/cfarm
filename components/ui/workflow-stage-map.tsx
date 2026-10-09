"use client"

import { useMemo } from "react"
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react"
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconLoader2,
} from "@tabler/icons-react"

import { cn } from "@/lib/utils"

export type WorkflowMapStatus = "pending" | "running" | "complete" | "failed"

export type WorkflowMapStep = {
  id: string
  label: string
  status: WorkflowMapStatus
}

type StageNodeData = {
  label: string
  status: WorkflowMapStatus
  selected: boolean
  position: number
  onSelect: () => void
}

type StageNode = Node<StageNodeData, "stage">

const nodeTypes = { stage: StageNodeView }

export function WorkflowStageMap({
  steps,
  selectedId,
  onSelect,
  className,
}: {
  steps: WorkflowMapStep[]
  selectedId: string
  onSelect: (id: string) => void
  className?: string
}) {
  const nodes = useMemo<StageNode[]>(
    () =>
      steps.map((step, index) => ({
        id: step.id,
        type: "stage",
        position: { x: index * 224, y: 18 },
        data: {
          label: step.label,
          status: step.status,
          selected: step.id === selectedId,
          position: index + 1,
          onSelect: () => onSelect(step.id),
        },
        draggable: false,
        selectable: false,
      })),
    [onSelect, selectedId, steps]
  )
  const edges = useMemo<Edge[]>(
    () =>
      steps.slice(0, -1).map((step, index) => ({
        id: `${step.id}-${steps[index + 1].id}`,
        source: step.id,
        target: steps[index + 1].id,
        type: "smoothstep",
        animated: step.status === "running",
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: {
          stroke:
            step.status === "complete"
              ? "var(--app-success)"
              : "var(--app-panel-border-strong)",
          strokeWidth: 1.5,
        },
      })),
    [steps]
  )

  return (
    <div
      className={cn(
        "mt-6 h-[176px] overflow-hidden rounded-[14px] border border-app-panel-border bg-app-surface-subtle",
        className
      )}
      aria-label="Workflow steps"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.65, maxZoom: 1 }}
        minZoom={0.45}
        maxZoom={1.35}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--app-panel-border)" gap={20} size={1} />
        <Controls
          position="bottom-right"
          showInteractive={false}
          className="!overflow-hidden !rounded-[8px] !border-app-panel-border !bg-app-surface !shadow-sm"
        />
      </ReactFlow>
    </div>
  )
}

function StageNodeView({ data }: NodeProps<StageNode>) {
  const Icon =
    data.status === "failed"
      ? IconAlertCircle
      : data.status === "running"
        ? IconLoader2
        : data.status === "complete"
          ? IconCheck
          : IconClock
  return (
    <button
      type="button"
      onClick={data.onSelect}
      aria-current={data.selected ? "step" : undefined}
      className={cn(
        "lc-focus-ring relative flex h-[82px] w-[184px] items-start gap-3 rounded-[12px] border bg-app-surface px-4 py-3 text-left shadow-sm transition",
        data.selected
          ? "border-app-action ring-3 ring-app-action/15"
          : "border-app-panel-border hover:border-app-panel-border-strong hover:shadow-md"
      )}
    >
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <span
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
          statusSurface(data.status)
        )}
      >
        <Icon
          className={cn("size-4", data.status === "running" && "animate-spin")}
          aria-hidden
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold text-app-text-faint tabular-nums">
          Stage {data.position}
        </span>
        <span className="mt-1 line-clamp-2 block text-[12px] leading-4 font-semibold text-app-text">
          {data.label}
        </span>
      </span>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </button>
  )
}

function statusSurface(status: WorkflowMapStatus) {
  if (status === "failed") return "bg-app-danger-surface text-app-danger"
  if (status === "running") return "bg-app-warning/10 text-app-warning"
  if (status === "complete") return "bg-app-success/10 text-app-success"
  return "bg-app-control-bg text-app-text-faint"
}
