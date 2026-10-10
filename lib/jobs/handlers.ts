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
 * `publish-post` (lib/publishing/service.ts), `notify` (lib/notifications.ts),
 * `batch-start` (lib/batches/service.ts). Render and publish jobs of batch
 * items also advance their batch (post creation, refresh, notification).
 */
import { onBatchRenderSettled, refreshBatch, startBatch } from "@/lib/batches/service"
import type { Job, JobType, Repositories } from "@/lib/data"
import { deliverNotification } from "@/lib/notifications"
import type { Publisher } from "@/lib/publishing/publisher"
import { runPublishPostJob } from "@/lib/publishing/service"
import type { RenderEngine, RenderServiceDeps } from "@/lib/renders/service"

import { isPermanentJobError, JobHandlerNotRegisteredError, PermanentJobError } from "./errors"
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

function batchDeps(context: JobContext) {
  return { repos: context.repos, publisher: context.publisher, now: context.now }
}

async function advanceBatch(context: JobContext, task: () => Promise<unknown>, fields: Record<string, unknown>) {
  try {
    await task()
  } catch (error) {
    // The job's own outcome is already recorded; the worker sweep retries batch progress.
    context.log?.warn("batch advance failed", { ...fields, error: error instanceof Error ? error.message : String(error) })
  }
}

export const renderSlideshowHandler: JobHandler<"render-slideshow"> = async (job, context) => {
  const workspaceId = job.workspaceId
  const settle = () =>
    workspaceId
      ? advanceBatch(context, () => onBatchRenderSettled(workspaceId, job.payload.renderId, batchDeps(context)), {
          renderId: job.payload.renderId,
        })
      : Promise.resolve()
  try {
    const result = await runRenderSlideshowJob(job, {
      repos: context.repos,
      renderSpec: context.renderSpec,
      assetLoader: context.assetLoader,
    })
    await settle()
    return result
  } catch (error) {
    // Only a final failure settles the item; a transient one is retried.
    if (isPermanentJobError(error)) await settle()
    throw error
  }
}

export const publishPostHandler: JobHandler<"publish-post"> = async (job, context) => {
  const workspaceId = job.workspaceId
  try {
    return await runPublishPostJob(job, { repos: context.repos, publisher: context.publisher, now: context.now })
  } finally {
    if (workspaceId) {
      await advanceBatch(
        context,
        async () => {
          const post = await context.repos.posts.get(workspaceId, job.payload.postId)
          if (post?.batchId) await refreshBatch(workspaceId, post.batchId, batchDeps(context))
        },
        { postId: job.payload.postId }
      )
    }
  }
}

export const batchStartHandler: JobHandler<"batch-start"> = async (job, context) => {
  if (!job.workspaceId) throw new PermanentJobError("batch-start jobs need a workspace")
  return startBatch(job.workspaceId, job.payload.batchId, batchDeps(context))
}

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
  "batch-start": batchStartHandler,
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
