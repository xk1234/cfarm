/**
 * Lease-based job loop for the long-running Railway worker
 * (docs/refactor/03-appwrite-data-layer.md §4). scripts/worker.mts wires it to
 * the configured repositories, signals and the optional wake server.
 *
 * - Claims queued jobs (and running jobs whose lease expired) through
 *   `repos.jobs.claim`, which takes an atomic `<jobId>.<attempt>` lease row.
 * - Renews the lease while a handler runs; completes or fails the job.
 * - Runs periodic sweeps in-process (no scheduler service): due in-app
 *   notifications → `notify` jobs, due scheduled posts without a provider
 *   post → `publish-post` jobs, renders whose `render-slideshow` job died
 *   (e.g. lease exhausted after repeated crashes) → failed + notified, and
 *   old lease rows → purge. Sweep enqueues use
 *   deterministic job ids, so several worker replicas never double-enqueue.
 * - Polls adaptively: drains while there is work, then backs off to the idle
 *   interval. `wake()` cuts the current sleep short.
 */
import { hostname } from "node:os"
import { randomBytes } from "node:crypto"

import { JOB_LEASE_EXHAUSTED_ERROR, type Job, type JobType, type Repositories } from "@/lib/data"
import { notifyRenderFinished } from "@/lib/renders/service"

import { isPermanentJobError, PermanentJobError, RetryJobError } from "./errors"
import { sweepActiveBatches } from "@/lib/batches/service"
import type { Publisher } from "@/lib/publishing/publisher"

import { getJobHandler, type JobContext, type JobLogger } from "./handlers"

export type WorkerOptions = {
  repos: Repositories
  workerId?: string
  /** Jobs claimed per poll (default 2). */
  concurrency?: number
  /** Lease length (default 2 min); renewed every third of it. */
  leaseMs?: number
  /** Poll interval bounds (defaults 1 s → 20 s). */
  minPollMs?: number
  maxPollMs?: number
  /** Sweep cadence (defaults 60 s / 1 h). */
  sweepEveryMs?: number
  purgeEveryMs?: number
  /** Lease rows older than this are deleted (default 7 days). */
  leaseRetentionMs?: number
  /** Dead `render-slideshow` jobs that died within this window are reconciled (default 24 h). */
  deadRenderLookbackMs?: number
  types?: readonly JobType[]
  log?: JobLogger
  now?: () => Date
  /** Test seams passed to handlers (production handlers resolve their own defaults). */
  publisher?: Publisher
  renderSpec?: JobContext["renderSpec"]
  assetLoader?: JobContext["assetLoader"]
}

export type TickResult = { claimed: number; succeeded: number; failed: number; swept: SweepResult | null }
export type SweepResult = {
  notifications: number
  posts: number
  leasesPurged: number
  rendersFailed: number
  /** Active batches advanced/refreshed. */
  batches: number
}

/** Recorded on a render whose job died because its lease expired on the final attempt. */
export const RENDER_LEASE_EXHAUSTED_MESSAGE = "Render job exhausted its attempts (worker lease expired)."

const consoleLogger: JobLogger = {
  info: (message, fields) => console.log(JSON.stringify({ level: "info", message, ...fields })),
  warn: (message, fields) => console.warn(JSON.stringify({ level: "warn", message, ...fields })),
  error: (message, fields) => console.error(JSON.stringify({ level: "error", message, ...fields })),
}

export function defaultWorkerId(): string {
  return `${hostname().slice(0, 32)}-${process.pid}-${randomBytes(3).toString("hex")}`.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 64)
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, 4000)
}

export function createWorker(options: WorkerOptions) {
  const repos = options.repos
  const workerId = options.workerId ?? defaultWorkerId()
  const concurrency = Math.max(1, options.concurrency ?? 2)
  const leaseMs = options.leaseMs ?? 120_000
  const minPollMs = options.minPollMs ?? 1_000
  const maxPollMs = options.maxPollMs ?? 20_000
  const sweepEveryMs = options.sweepEveryMs ?? 60_000
  const purgeEveryMs = options.purgeEveryMs ?? 3_600_000
  const leaseRetentionMs = options.leaseRetentionMs ?? 7 * 24 * 3_600_000
  const deadRenderLookbackMs = options.deadRenderLookbackMs ?? 24 * 3_600_000
  const log = options.log ?? consoleLogger
  const now = options.now ?? (() => new Date())

  let lastSweep = 0
  let lastPurge = 0
  let stopping = false
  const shutdown = new AbortController()
  let wakeSleep: (() => void) | null = null

  async function runJob(job: Job): Promise<"succeeded" | "failed"> {
    const handler = getJobHandler(job.type)
    const lost = new AbortController()
    const signal = AbortSignal.any([shutdown.signal, lost.signal])
    const renewLease = async () => {
      const ok = await repos.jobs.renew(job.id, workerId, leaseMs, now().toISOString())
      if (!ok) lost.abort(new Error("lease lost"))
      return ok
    }
    const renewal = setInterval(() => {
      renewLease().catch((error) => log.warn("lease renewal failed", { jobId: job.id, error: errorMessage(error) }))
    }, Math.max(1_000, Math.floor(leaseMs / 3)))
    renewal.unref?.()
    const started = Date.now()
    try {
      if (!handler) throw new PermanentJobError(`No handler for job type "${job.type}".`)
      const result = await handler(job as never, {
        repos,
        workerId,
        renewLease,
        log,
        signal,
        publisher: options.publisher,
        now: options.now,
        renderSpec: options.renderSpec,
        assetLoader: options.assetLoader,
      })
      if (lost.signal.aborted) {
        log.warn("job finished after its lease was lost; result discarded", { jobId: job.id, type: job.type })
        return "failed"
      }
      await repos.jobs.complete(job.id, workerId, result ?? null)
      log.info("job succeeded", { jobId: job.id, type: job.type, attempt: job.attempt, ms: Date.now() - started })
      return "succeeded"
    } catch (error) {
      const message = errorMessage(error)
      try {
        const failed = await repos.jobs.fail(job.id, workerId, message, {
          permanent: isPermanentJobError(error),
          retryAt: error instanceof RetryJobError ? error.retryAt.toISOString() : undefined,
        })
        log.warn("job failed", { jobId: job.id, type: job.type, attempt: job.attempt, status: failed.status, error: message })
      } catch (failError) {
        log.error("could not record job failure", { jobId: job.id, error: errorMessage(failError) })
      }
      return "failed"
    } finally {
      clearInterval(renewal)
    }
  }

  /**
   * A `render-slideshow` job can die without its handler running to the end:
   * `claim()` marks it dead when the lease expired on the final attempt (the
   * worker crashed mid-render), and a handler whose lease was lost never
   * records anything. Its render would then stay queued/rendering forever, so
   * fail it here and notify. Idempotent: settled renders are skipped.
   */
  async function failRendersOfDeadJobs(t: number): Promise<number> {
    let failed = 0
    const dead = await repos.jobs.listDead({
      type: "render-slideshow",
      since: new Date(t - deadRenderLookbackMs).toISOString(),
      limit: 100,
    })
    for (const job of dead as Job<"render-slideshow">[]) {
      if (!job.workspaceId) continue
      try {
        const render = await repos.renders.get(job.workspaceId, job.payload.renderId)
        if (!render || render.deletedAt) continue
        if (render.status !== "queued" && render.status !== "rendering") continue
        // Another job owns this render now (it was re-enqueued); leave it alone.
        if (render.jobId && render.jobId !== job.id) continue
        const message =
          job.error === JOB_LEASE_EXHAUSTED_ERROR || !job.error
            ? RENDER_LEASE_EXHAUSTED_MESSAGE
            : `Render job failed: ${job.error}`.slice(0, 4000)
        const updated = await repos.renders.markFailed(job.workspaceId, render.id, message)
        failed++
        log.warn("render failed after its job died", { jobId: job.id, renderId: render.id })
        try {
          await notifyRenderFinished(repos, updated)
        } catch (error) {
          log.warn("render-failed notification failed", { renderId: render.id, error: errorMessage(error) })
        }
      } catch (error) {
        log.error("could not reconcile dead render job", { jobId: job.id, error: errorMessage(error) })
      }
    }
    return failed
  }

  /** Enqueues due work; safe to run on every replica (deterministic job ids). */
  async function sweep(force = false): Promise<SweepResult | null> {
    const t = now().getTime()
    const runSweep = force || t - lastSweep >= sweepEveryMs
    const runPurge = force || t - lastPurge >= purgeEveryMs
    if (!runSweep && !runPurge) return null
    const result: SweepResult = { notifications: 0, posts: 0, leasesPurged: 0, rendersFailed: 0, batches: 0 }
    const at = new Date(t).toISOString()
    if (runSweep) {
      lastSweep = t
      for (const n of await repos.notifications.listDue(at, 100)) {
        const { created } = await repos.jobs.enqueue({
          workspaceId: n.workspaceId,
          type: "notify",
          payload: { notificationId: n.id },
          dedupeKey: `notify:${n.id}`,
        })
        if (created) result.notifications++
      }
      for (const post of await repos.posts.listDue(at, 100)) {
        if (post.providerPostId) continue
        const { created } = await repos.jobs.enqueue({
          workspaceId: post.workspaceId,
          type: "publish-post",
          payload: { postId: post.id },
          dedupeKey: `publish:${post.id}:${post.publishAt ?? ""}`,
        })
        if (created) result.posts++
      }
      result.batches = await sweepActiveBatches({ repos, publisher: options.publisher, now }).catch((error) => {
        log.error("batch sweep failed", { error: errorMessage(error) })
        return 0
      })
      result.rendersFailed = await failRendersOfDeadJobs(t).catch((error) => {
        // Never let reconciliation block the notification/post sweeps above.
        log.error("dead render sweep failed", { error: errorMessage(error) })
        return 0
      })
    }
    if (runPurge) {
      lastPurge = t
      result.leasesPurged = await repos.leases.purgeOlderThan(new Date(t - leaseRetentionMs).toISOString())
    }
    return result
  }

  /** One poll: sweep if due, claim a batch, run it. */
  async function tick(): Promise<TickResult> {
    let swept: SweepResult | null = null
    try {
      swept = await sweep()
    } catch (error) {
      log.error("sweep failed", { error: errorMessage(error) })
    }
    const jobs = await repos.jobs.claim(workerId, {
      limit: concurrency,
      leaseMs,
      now: now().toISOString(),
      types: options.types,
    })
    const outcomes = await Promise.all(jobs.map(runJob))
    return {
      claimed: jobs.length,
      succeeded: outcomes.filter((o) => o === "succeeded").length,
      failed: outcomes.filter((o) => o === "failed").length,
      swept,
    }
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms)
      function done() {
        clearTimeout(timer)
        wakeSleep = null
        resolve()
      }
      wakeSleep = done
    })
  }

  /** Runs until `stop()`; resolves after the in-flight batch finishes. */
  async function run(): Promise<void> {
    let idle = minPollMs
    log.info("worker started", { workerId, concurrency, leaseMs })
    while (!stopping) {
      try {
        const result = await tick()
        if (result.claimed > 0) {
          idle = minPollMs
          continue
        }
      } catch (error) {
        log.error("worker tick failed", { error: errorMessage(error) })
      }
      if (stopping) break
      await sleep(idle)
      idle = Math.min(maxPollMs, Math.round(idle * 1.6))
    }
    log.info("worker stopped", { workerId })
  }

  return {
    workerId,
    tick,
    sweep,
    run,
    /** Cut the current idle sleep short (new work was enqueued). */
    wake() {
      wakeSleep?.()
    },
    stop() {
      stopping = true
      shutdown.abort(new Error("worker shutting down"))
      wakeSleep?.()
    },
  }
}
