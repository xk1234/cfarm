/**
 * Job handler registry for the Railway worker (scripts/worker.mts).
 *
 * One handler per `JobType`. Feature owners replace the placeholder entries in
 * `DEFAULT_JOB_HANDLERS` with their implementation (import it here), or call
 * `registerJobHandler` at startup. Handlers must be idempotent: a job can run
 * again after a crash or an expired lease (renders overwrite `<renderId>-NN`).
 *
 * Errors:
 * - throw `PermanentJobError` to stop retrying (the job becomes `dead`),
 * - throw `RetryJobError` to choose the next attempt time,
 * - any other error retries with exponential backoff until `maxAttempts`.
 */
import type { Job, JobPayloads, JobType, Repositories } from "@/lib/data"

export type JobLogger = {
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

export type JobContext<T extends JobType = JobType> = {
  job: Job<T>
  repos: Repositories
  workerId: string
  /** Extends the lease; false means another worker now owns the job — stop. */
  renewLease(): Promise<boolean>
  log: JobLogger
  /** Aborted when the worker shuts down or loses the lease. */
  signal: AbortSignal
}

export type JobHandler<T extends JobType = JobType> = (
  payload: JobPayloads[T],
  context: JobContext<T>
) => Promise<unknown>

export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PermanentJobError"
  }
}

export class RetryJobError extends Error {
  readonly retryAt: Date
  constructor(message: string, retryAt: Date) {
    super(message)
    this.name = "RetryJobError"
    this.retryAt = retryAt
  }
}

/** A placeholder ran: the owning feature has not registered its handler yet. */
export class JobHandlerNotRegisteredError extends RetryJobError {
  constructor(type: JobType) {
    super(`No handler is registered for "${type}" jobs yet.`, new Date(Date.now() + 15 * 60_000))
    this.name = "JobHandlerNotRegisteredError"
  }
}

function placeholder<T extends JobType>(type: T): JobHandler<T> {
  return async () => {
    throw new JobHandlerNotRegisteredError(type)
  }
}

/** `notify`: in-app delivery flips a pending notification to delivered. */
export const deliverNotification: JobHandler<"notify"> = async ({ notificationId }, { job, repos }) => {
  if (!job.workspaceId) throw new PermanentJobError("notify jobs must belong to a workspace")
  const notification = await repos.notifications.get(job.workspaceId, notificationId)
  if (!notification) throw new PermanentJobError(`notification ${notificationId} not found`)
  if (notification.status !== "pending") return { status: notification.status, skipped: true }
  const delivered = await repos.notifications.markDelivered(job.workspaceId, notificationId)
  return { status: delivered.status }
}

export const DEFAULT_JOB_HANDLERS: { [K in JobType]: JobHandler<K> } = {
  // Owner: render engine builder (renders the frozen ResolvedSpec, writes
  // `<renderId>-NN` to the `renders` bucket, calls renders.markSucceeded).
  "render-slideshow": placeholder("render-slideshow"),
  // Owner: publishing builder (uploads the render to SocialBu, creates the post).
  "publish-post": placeholder("publish-post"),
  notify: deliverNotification,
}

const registry = new Map<JobType, JobHandler>(
  Object.entries(DEFAULT_JOB_HANDLERS) as [JobType, JobHandler][]
)

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
