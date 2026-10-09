/**
 * `render-slideshow` job: renders a queued render row with the engine, stores
 * one file per slide in the `renders` bucket and updates the row. Idempotent:
 * a succeeded render is a no-op and retries overwrite `<renderId>-NN`.
 */
import { JobPayloadSchemas, type Job, type Repositories } from "@/lib/data"
import { AssetLoadError, renderSpec as engineRenderSpec } from "@/lib/render/engine"
import {
  executeRender,
  notifyRenderFinished,
  renderErrorMessage,
  type RenderEngine,
  type RenderServiceDeps,
} from "@/lib/renders/service"

import { PermanentJobError } from "./errors"

export { PermanentJobError }

export type RenderJobDeps = {
  repos: Repositories
  renderSpec?: RenderEngine
  assetLoader?: RenderServiceDeps["assetLoader"]
}

export async function runRenderSlideshowJob(job: Job<"render-slideshow">, deps: RenderJobDeps) {
  const payload = JobPayloadSchemas["render-slideshow"].parse(job.payload)
  if (!job.workspaceId) throw new PermanentJobError("render-slideshow jobs need a workspace")
  const existing = await deps.repos.renders.get(job.workspaceId, payload.renderId)
  if (!existing) throw new PermanentJobError(`Render ${payload.renderId} no longer exists`)
  if (existing.status === "succeeded") return { renderId: existing.id, status: existing.status, skipped: true }

  const { render, error } = await executeRender(
    { repos: deps.repos, renderSpec: deps.renderSpec ?? engineRenderSpec, assetLoader: deps.assetLoader },
    job.workspaceId,
    payload.renderId,
    { jobId: job.id }
  )
  if (error) {
    // A remote image may come back; everything else (bad spec, overflow,
    // unsupported asset) fails the same way on every attempt.
    const transient = error instanceof AssetLoadError && error.code === "asset.fetch_failed"
    const lastAttempt = job.attempt >= job.maxAttempts
    if (transient && !lastAttempt) throw new Error(renderErrorMessage(error))
    await notifyRenderFinished(deps.repos, render).catch(() => undefined)
    throw new PermanentJobError(renderErrorMessage(error))
  }
  await notifyRenderFinished(deps.repos, render).catch(() => undefined)
  return { renderId: render.id, status: render.status, slides: render.output?.slides.length ?? 0 }
}
