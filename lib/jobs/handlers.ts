/**
 * Job handler registry for the Railway worker (`scripts/worker.mts`).
 *
 * A handler receives a claimed job and returns its JSON `result`. Throwing a
 * `PermanentJobError` asks the worker to fail the job without retrying
 * (`jobs.fail(..., { permanent: true })`); any other error is retried with
 * backoff until `maxAttempts`.
 */
import type { Job, JobType, Repositories } from "@/lib/data"

import { PermanentJobError, runRenderSlideshowJob, type RenderJobDeps } from "./render-slideshow"

export { PermanentJobError }

export type JobHandlerContext = RenderJobDeps & {
  repos: Repositories
  workerId: string
}

export type JobHandler<T extends JobType = JobType> = (job: Job<T>, context: JobHandlerContext) => Promise<unknown>

export type JobHandlers = { [K in JobType]?: JobHandler<K> }

export const JOB_HANDLERS: JobHandlers = {
  "render-slideshow": (job, context) => runRenderSlideshowJob(job, context),
}

export function getJobHandler<T extends JobType>(type: T): JobHandler<T> | null {
  return (JOB_HANDLERS[type] as JobHandler<T> | undefined) ?? null
}

export function isPermanentJobError(error: unknown): boolean {
  return error instanceof PermanentJobError || (error as { permanent?: unknown } | null)?.permanent === true
}
