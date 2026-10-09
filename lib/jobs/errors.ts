/**
 * Job error classes shared by the worker (lib/jobs/worker.ts) and the job
 * implementations. Kept separate from the handler registry so handler modules
 * can import them without a cycle.
 *
 * - `PermanentJobError`: stop retrying (the job becomes `dead`).
 * - `RetryJobError`: retry at a chosen time.
 * - anything else: retry with exponential backoff until `maxAttempts`.
 */
import type { JobType } from "@/lib/data"

export class PermanentJobError extends Error {
  readonly permanent = true
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

/** A placeholder ran: no handler is registered for this job type. */
export class JobHandlerNotRegisteredError extends RetryJobError {
  constructor(type: JobType) {
    super(`No handler is registered for "${type}" jobs yet.`, new Date(Date.now() + 15 * 60_000))
    this.name = "JobHandlerNotRegisteredError"
  }
}

export function isPermanentJobError(error: unknown): boolean {
  return error instanceof PermanentJobError || (error as { permanent?: unknown } | null)?.permanent === true
}
