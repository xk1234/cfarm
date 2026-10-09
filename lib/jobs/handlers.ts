/**
 * Job handler registry for the Railway worker (`scripts/worker.mts`), which
 * claims rows from the Appwrite `jobs` table (docs/refactor/03 §4) and calls
 * `jobHandlers[job.type]`.
 *
 * Contract for handlers:
 * - Idempotent: a job may run more than once (lease expiry, retries).
 * - Return a JSON-serialisable result on success.
 * - Throw to retry with backoff; throw `PermanentJobError` to fail without retry.
 *
 * `render-slideshow` is registered by the render builder.
 */
import type { Job, JobType, Repositories } from "@/lib/data"
import { deliverNotification } from "@/lib/notifications"
import type { Publisher } from "@/lib/publishing/publisher"
import { runPublishPostJob } from "@/lib/publishing/service"

export type JobContext = {
  workerId: string
  repos?: Repositories
  publisher?: Publisher
  now?: () => Date
}

export type JobHandler<T extends JobType = JobType> = (job: Job<T>, context: JobContext) => Promise<unknown>

export type JobHandlers = { [K in JobType]?: JobHandler<K> }

/** A failure that retrying cannot fix (bad payload, missing row, …). */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PermanentJobError"
  }
}

export const publishPostHandler: JobHandler<"publish-post"> = (job, context) =>
  runPublishPostJob(job, { repos: context.repos, publisher: context.publisher, now: context.now })

export const notifyHandler: JobHandler<"notify"> = async (job, context) => {
  if (!job.workspaceId) throw new PermanentJobError("notify jobs need a workspace")
  return deliverNotification(job.workspaceId, job.payload.notificationId, {
    repos: context.repos,
    now: context.now,
  })
}

export const jobHandlers: JobHandlers = {
  "publish-post": publishPostHandler,
  notify: notifyHandler,
}

export function getJobHandler<T extends JobType>(type: T): JobHandler<T> | undefined {
  return jobHandlers[type] as JobHandler<T> | undefined
}
