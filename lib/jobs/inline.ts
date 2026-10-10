/**
 * Nudges background work after a request enqueued jobs.
 *
 * - Production: `wakeWorker()` shortens the Railway worker's idle sleep
 *   (no-op without WORKER_WAKE_URL).
 * - Local e2e/dev without a worker process: with `LUMENCLIP_INLINE_JOBS=1`
 *   (never honoured in production) the web process drains the job queue
 *   itself in the background, using the same worker loop and handlers.
 */
import type { Repositories } from "@/lib/data"

import { wakeWorker } from "./wake"

type Env = Record<string, string | undefined>

export function inlineJobsEnabled(env: Env = process.env): boolean {
  return env.LUMENCLIP_INLINE_JOBS === "1" && env.NODE_ENV !== "production"
}

const STATE_KEY = Symbol.for("lumenclip.inline-jobs")
type State = { running: boolean; again: boolean }
const holder = globalThis as { [STATE_KEY]?: State }

/** Drains claimable jobs in-process until the queue is idle (one drain at a time). */
export async function drainJobsInline(
  repos: Repositories,
  maxTicks = 500
): Promise<void> {
  const state = (holder[STATE_KEY] ??= { running: false, again: false })
  if (state.running) {
    state.again = true
    return
  }
  state.running = true
  try {
    // Imported lazily: the worker pulls in every job handler.
    const { createWorker } = await import("./worker")
    const worker = createWorker({
      repos,
      workerId: "inline-web",
      concurrency: 2,
    })
    do {
      state.again = false
      for (let tick = 0; tick < maxTicks; tick++) {
        const result = await worker.tick()
        if (result.claimed === 0) break
      }
    } while (state.again)
  } finally {
    state.running = false
  }
}

export function kickJobs(repos: Repositories, env: Env = process.env): void {
  void wakeWorker(env)
  if (inlineJobsEnabled(env)) {
    void drainJobsInline(repos).catch((error) =>
      console.error("[inline-jobs]", error)
    )
  }
}
