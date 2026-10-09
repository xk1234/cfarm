/**
 * Job handler registry for the Railway worker (scripts/worker.mts →
 * lib/jobs/worker.ts), which claims rows from the Appwrite `jobs` table with
 * lease rows (docs/refactor/03 §4) and calls the handler for `job.type`.
 *
 * Handlers must be idempotent: a job can run again after a crash or an expired
 * lease. Return a JSON-serialisable result. Errors are classified by
 * lib/jobs/errors.ts (`PermanentJobError`, `RetryJobError`, anything else
 * retries with backoff).
 *
 * Registered: `render-slideshow` (lib/jobs/render-slideshow.ts),
 * `publish-post` (lib/publishing/service.ts), `notify` (lib/notifications.ts).
 */
import type { Job, JobType, Repositories } from "@/lib/data"
import { deliverNotification } from "@/lib/notifications"
import type { Publisher } from "@/lib/publishing/publisher"
import { runPublishPostJob } from "@/lib/publishing/service"
import type { RenderEngine, RenderServiceDeps } from "@/lib/renders/service"

import { JobHandlerNotRegisteredError, PermanentJobError } from "./errors"
import { runRenderSlideshowJob } from "./render-slideshow"

export {
  isPermanentJobError,
  JobHandlerNotRegisteredError,
  PermanentJobError,
  RetryJobError,
} from "./errors"

export type JobLogger = {
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

export type JobContext = {
  repos: Repositories
  workerId: string
  /** Extends the lease; false means another worker now owns the job — stop. */
  renewLease?: () => Promise<boolean>
  log?: JobLogger
  /** Aborted when the worker shuts down or loses the lease. */
  signal?: AbortSignal
  /** Test seams; production handlers resolve their own defaults. */
  publisher?: Publisher
  now?: () => Date
  renderSpec?: RenderEngine
  assetLoader?: RenderServiceDeps["assetLoader"]
}

export type JobHandler<T extends JobType = JobType> = (job: Job<T>, context: JobContext) => Promise<unknown>

export type JobHandlers = { [K in JobType]?: JobHandler<K> }

/** A handler that keeps the job queued (retry in 15 minutes) instead of losing it. */
export function placeholderJobHandler<T extends JobType>(type: T): JobHandler<T> {
  return async () => {
    throw new JobHandlerNotRegisteredError(type)
  }
}

export const renderSlideshowHandler: JobHandler<"render-slideshow"> = (job, context) =>
  runRenderSlideshowJob(job, {
    repos: context.repos,
    renderSpec: context.renderSpec,
    assetLoader: context.assetLoader,
  })

export const publishPostHandler: JobHandler<"publish-post"> = (job, context) =>
  runPublishPostJob(job, { repos: context.repos, publisher: context.publisher, now: context.now })

export const notifyHandler: JobHandler<"notify"> = async (job, context) => {
  if (!job.workspaceId) throw new PermanentJobError("notify jobs need a workspace")
  return deliverNotification(job.workspaceId, job.payload.notificationId, {
    repos: context.repos,
    now: context.now,
  })
}

export const DEFAULT_JOB_HANDLERS: JobHandlers = {
  "render-slideshow": renderSlideshowHandler,
  "publish-post": publishPostHandler,
  notify: notifyHandler,
}

const registry = new Map<JobType, JobHandler>(Object.entries(DEFAULT_JOB_HANDLERS) as [JobType, JobHandler][])

export function registerJobHandler<T extends JobType>(type: T, handler: JobHandler<T>): void {
  registry.set(type, handler as unknown as JobHandler)
}

export function getJobHandler<T extends JobType>(type: T): JobHandler<T> | null {
  return (registry.get(type) as JobHandler<T> | undefined) ?? null
}

/** Tests: restore the default handlers. */
export function resetJobHandlers(): void {
  registry.clear()
  for (const [type, handler] of Object.entries(DEFAULT_JOB_HANDLERS)) {
    registry.set(type as JobType, handler as JobHandler)
  }
}

export function registeredJobTypes(): JobType[] {
  return [...registry.keys()]
}
