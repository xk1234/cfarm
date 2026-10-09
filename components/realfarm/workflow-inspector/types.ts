export type WorkflowRunStatus =
  "queued" | "running" | "failed" | "succeeded" | "paused"

export type WorkflowStageStatus = "pending" | "running" | "failed" | "succeeded"

export type WorkflowArtifactKind =
  | "metadata"
  | "prompt"
  | "copy"
  | "storyboard"
  | "media-gallery"
  | "manifest"
  | "qa"
  | "final"

export type WorkflowArtifact = {
  kind: WorkflowArtifactKind
  value: unknown
}

export type WorkflowInspectorStage = {
  id: string
  shortLabel: string
  title: string
  description: string
  kind: string
  status: WorkflowStageStatus
  input: WorkflowArtifact
  result?: WorkflowArtifact
  rawInput?: unknown
  rawResult?: unknown
  canRun: boolean
  runDisabledReason?: string
}

export type WorkflowInspectorRun = {
  id: string
  workflowName: string
  status: WorkflowRunStatus
  startedAt: string
  completedAt?: string
  stages: WorkflowInspectorStage[]
}
