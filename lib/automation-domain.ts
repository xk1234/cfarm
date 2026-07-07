import type { AutomationRunRecord } from "@/lib/automation-runner"
import type { ResultRecord, ResultWorkflowType } from "@/lib/results"

export type AutomationType = "slideshow" | "video"

export type WorkflowType = AutomationType

export type RunStatus = "queued" | "running" | "succeeded" | "failed"

export type AutomationInputObject =
  | { type: "collection"; id: string }
  | { type: "swipe"; id: string }
  | { type: "asset"; id: string }

export type AutomationOutputTarget =
  | { type: "account"; id: string }
  | { type: "download" }

export type Workflow = {
  id: string
  type: WorkflowType
  templateId?: string
}

export type Automation = {
  id: string
  type: AutomationType
  workflow: Workflow
  schedule: {
    timezone: string
    times: string[]
  }
  inputs: AutomationInputObject[]
  outputs: AutomationOutputTarget[]
}

export type Template = {
  id: string
  type: AutomationType
  title: string
}

export type Collection = {
  id: string
  title: string
}

export type Account = {
  id: string
  provider: string
  handle?: string
}

export type Swipe = {
  id: string
  sourceUrl?: string
  createdAt: string
}

export type Publication = {
  id: string
  resultId: string
  accountId: string
  status: "queued" | "scheduled" | "published" | "failed"
}

export type Result = ResultRecord

type RunLike = Pick<
  AutomationRunRecord,
  | "id"
  | "automationId"
  | "automationTitle"
  | "scheduledFor"
  | "status"
  | "slideshowId"
  | "videoUrl"
  | "thumbnailUrl"
  | "outputImages"
  | "outputDir"
  | "plan"
  | "createdAt"
  | "updatedAt"
>

export function normalizeDomainRunStatus(status: unknown): RunStatus {
  if (status === "failed") {
    return "failed"
  }
  if (status === "queued" || status === "running" || status === "succeeded") {
    return status
  }
  return "succeeded"
}

export function automationRunToResult(run: RunLike): Result | null {
  if (normalizeDomainRunStatus(run.status) !== "succeeded") {
    return null
  }
  if (!run.slideshowId && !run.videoUrl && !run.outputImages?.length) {
    return null
  }

  return {
    id: `result-${run.id}`,
    automationId: run.automationId,
    runId: run.id,
    workflowType: automationRunWorkflowType(run),
    title: run.plan.title || run.automationTitle,
    status: "succeeded",
    createdAt: run.updatedAt || run.createdAt,
    updatedAt: run.updatedAt || run.createdAt,
    artifacts: {
      slideshowId: run.slideshowId,
      videoUrl: run.videoUrl,
      thumbnailUrl: run.thumbnailUrl,
      outputImages: run.outputImages ?? [],
      outputDir: run.outputDir,
    },
    destinationAccountIds: [],
  }
}

function automationRunWorkflowType(run: RunLike): ResultWorkflowType {
  return run.plan.publishType === "video" ? "video" : "slideshow"
}
