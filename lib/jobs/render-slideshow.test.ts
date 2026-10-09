import { beforeEach, describe, expect, it } from "vitest"

import { createMemoryRepositories, type Repositories } from "@/lib/data"
import { getJobHandler, isPermanentJobError } from "@/lib/jobs/handlers"
import { AssetLoadError, RenderError } from "@/lib/render/engine"
import { createRender, enqueueRenderJob } from "@/lib/renders/service"
import { createFakeRenderSpec } from "@/lib/renders/test-fakes"

const WS = "user_jobs"
let repos: Repositories

const spec = {
  version: 1,
  canvas: { preset: "1:1" },
  slides: [
    { id: "a", layers: [{ id: "t", type: "text", frame: { inset: 10 }, text: "A" }] },
    { id: "b", layers: [{ id: "t", type: "text", frame: { inset: 10 }, text: "B" }] },
  ],
}

beforeEach(() => {
  repos = createMemoryRepositories()
})

async function claimRenderJob() {
  const { render } = await createRender(repos, WS, { spec, wait: false }, { source: "api", createdBy: WS })
  await enqueueRenderJob(repos, WS, render.id)
  const [job] = await repos.jobs.claim("worker-1", { limit: 1, leaseMs: 60_000 })
  return { render, job: job as Parameters<NonNullable<ReturnType<typeof getJobHandler<"render-slideshow">>>>[0] }
}

describe("render-slideshow job", () => {
  it("renders, stores slide files and marks the render succeeded", async () => {
    const fake = createFakeRenderSpec()
    const { render, job } = await claimRenderJob()
    const handler = getJobHandler("render-slideshow")!
    const result = await handler(job, { repos, workerId: "worker-1", renderSpec: fake.renderSpec })

    expect(result).toMatchObject({ renderId: render.id, status: "succeeded", slides: 2 })
    const stored = await repos.renders.get(WS, render.id)
    expect(stored?.status).toBe("succeeded")
    expect(stored?.jobId).toBe(job.id)
    expect(stored?.output?.slides.map((s) => s.fileId)).toEqual([`${render.id}-00`, `${render.id}-01`])
    expect(await repos.blobs.head(WS, "renders", `${render.id}-01`)).not.toBeNull()
    const inbox = await repos.notifications.listDue(new Date(Date.now() + 1000).toISOString(), 10)
    expect(inbox.map((n) => n.event)).toEqual(["render.succeeded"])

    // Idempotent: a second run is a no-op.
    expect(await handler(job, { repos, workerId: "worker-1", renderSpec: fake.renderSpec })).toMatchObject({
      skipped: true,
    })
    expect(fake.calls).toHaveLength(1)
  })

  it("fails permanently on render errors", async () => {
    const { render, job } = await claimRenderJob()
    const handler = getJobHandler("render-slideshow")!
    const error = await handler(job, {
      repos,
      workerId: "worker-1",
      renderSpec: async () => {
        throw new RenderError([{ code: "text.overflow", path: "/slides/0", message: "Text overflows" }])
      },
    }).catch((e: unknown) => e)
    expect(isPermanentJobError(error)).toBe(true)
    expect((await repos.renders.get(WS, render.id))?.status).toBe("failed")
  })

  it("retries transient image fetch failures", async () => {
    const { job } = await claimRenderJob()
    const handler = getJobHandler("render-slideshow")!
    const error = await handler(job, {
      repos,
      workerId: "worker-1",
      renderSpec: async () => {
        throw new AssetLoadError("asset.fetch_failed", "timeout")
      },
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(isPermanentJobError(error)).toBe(false)
  })
})
