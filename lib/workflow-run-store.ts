import "server-only"

import type { PipelineWorkflowId } from "@/lib/pipeline-stages"
import { getRailwayDatabase } from "@/lib/railway/database"
import {
  getWindmillWorkflowJob,
  type WindmillWorkflowRun,
} from "@/lib/windmill-workflows"

type JsonValue =
  | null
  | string
  | number
  | boolean
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined }

export type PersistedWorkflowRun = Omit<WindmillWorkflowRun, "status"> & {
  ownerId: string
  templateId?: string
  status: "queued" | "running" | "succeeded" | "failed"
  result?: Record<string, unknown>
  error?: string
  createdAt: string
  updatedAt: string
}

export async function persistQueuedWorkflowRun(input: {
  run: WindmillWorkflowRun
  ownerId: string
  templateId?: string
}) {
  const sql = getRailwayDatabase()
  await sql`
    INSERT INTO windmill_workflow_runs (
      job_id, owner_id, workflow_id, request_id, flow_path, template_id, status
    ) VALUES (
      ${input.run.jobId}, ${input.ownerId}, ${input.run.workflowId},
      ${input.run.requestId}, ${input.run.flowPath}, ${input.templateId ?? null},
      'queued'
    )
    ON CONFLICT (job_id) DO NOTHING
  `
  const configuredRetention = Number(
    process.env.WORKFLOW_RUN_RETENTION_DAYS ?? 30
  )
  const retentionDays = Number.isFinite(configuredRetention)
    ? Math.max(1, configuredRetention)
    : 30
  await sql`
    DELETE FROM windmill_workflow_runs
    WHERE job_id IN (
      SELECT job_id
      FROM windmill_workflow_runs
      WHERE updated_at < now() - (${retentionDays} * interval '1 day')
      ORDER BY updated_at ASC
      LIMIT 500
    )
  `
  return input.run
}

export async function getOwnedWorkflowRun(jobId: string, ownerId: string) {
  const sql = getRailwayDatabase()
  const [row] = await sql<
    Array<{
      job_id: string
      owner_id: string
      workflow_id: PipelineWorkflowId
      request_id: string
      flow_path: string
      template_id: string | null
      status: PersistedWorkflowRun["status"]
      result: Record<string, unknown> | null
      error: string | null
      created_at: Date | string
      updated_at: Date | string
    }>
  >`
    SELECT job_id, owner_id, workflow_id, request_id, flow_path, template_id,
      status, result, error, created_at, updated_at
    FROM windmill_workflow_runs
    WHERE job_id = ${jobId} AND owner_id = ${ownerId}
  `
  if (!row) return null
  return {
    workflowId: row.workflow_id,
    requestId: row.request_id,
    jobId: row.job_id,
    flowPath: row.flow_path,
    ownerId: row.owner_id,
    templateId: row.template_id ?? undefined,
    status: row.status,
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  } satisfies PersistedWorkflowRun
}

export async function refreshOwnedWorkflowRun(jobId: string, ownerId: string) {
  const current = await getOwnedWorkflowRun(jobId, ownerId)
  if (
    !current ||
    current.status === "succeeded" ||
    current.status === "failed"
  ) {
    return current
  }
  const job = await getWindmillWorkflowJob({ jobId })
  const status = job.status
  const result = isRecord(job.result)
    ? isRecord(job.result.output)
      ? job.result.output
      : job.result
    : job.result === undefined
      ? undefined
      : { value: job.result }
  const sql = getRailwayDatabase()
  await sql`
    UPDATE windmill_workflow_runs
    SET status = ${status},
        result = ${result === undefined ? null : sql.json(serializable(result))},
        error = ${job.error ?? null},
        updated_at = now(),
        completed_at = CASE WHEN ${status} IN ('succeeded', 'failed') THEN now() ELSE completed_at END
    WHERE job_id = ${jobId} AND owner_id = ${ownerId}
  `
  return getOwnedWorkflowRun(jobId, ownerId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function serializable(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue
}

function iso(value: Date | string) {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}
