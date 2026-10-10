import { beforeEach, describe, expect, it } from "vitest"

import { createMemoryRepositories, type Repositories } from "@/lib/data"
import { createWorker } from "@/lib/jobs/worker"
import {
  NotConfiguredPublisher,
  type Publisher,
} from "@/lib/publishing/publisher"
import { SocialBuPublisher } from "@/lib/publishing/socialbu"
import {
  createSocialBuMock,
  MOCK_BASE_URL,
  type SocialBuMock,
} from "@/lib/publishing/testing"
import { RenderError } from "@/lib/render/engine"
import { storeMedia } from "@/lib/renders/media"
import { executeRender } from "@/lib/renders/service"
import { createFakeRenderSpec, TINY_PNG } from "@/lib/renders/test-fakes"

import {
  BATCH_NOT_CONNECTED_MESSAGE,
  BatchRequestError,
  cancelBatch,
  createBatch,
  deriveBatchState,
  getBatchDetail,
  planBatch,
  retryBatch,
  sweepActiveBatches,
  type BatchDeps,
} from "./service"

const WS = "user_batch"
const TEMPLATE = "starter-photo-pill"
const quiet = { info() {}, warn() {}, error() {} }

let clock: Date
let repos: Repositories
let mock: SocialBuMock
let publisher: Publisher
let deps: BatchDeps
let fake: ReturnType<typeof createFakeRenderSpec>
let mediaIds: string[]

const now = () => clock

function socialBu() {
  return new SocialBuPublisher({
    now,
    token: "test-token",
    baseUrl: MOCK_BASE_URL,
    fetch: mock.fetch,
    sleep: async () => undefined,
    uploadPollIntervalMs: 0,
  })
}

beforeEach(async () => {
  clock = new Date("2026-10-09T12:00:00.000Z")
  repos = createMemoryRepositories({ now })
  mock = createSocialBuMock()
  publisher = socialBu()
  deps = { repos, publisher, now }
  fake = createFakeRenderSpec()
  const collection = await repos.collections.create(WS, {
    name: "Sunsets",
    createdBy: WS,
  })
  mediaIds = []
  for (let i = 0; i < 4; i++) {
    const { media } = await storeMedia(repos, WS, {
      bytes: new Uint8Array([...TINY_PNG, i]),
      mime: "image/png",
      collectionId: collection.id,
      source: "upload",
      createdBy: WS,
    })
    mediaIds.push(media.id)
  }
})

function item(
  caption: string,
  slides = 1,
  image: unknown = { collection: "Sunsets", pick: "random" }
) {
  return {
    slotValues: {
      slides: Array.from({ length: slides }, (_, i) => ({
        image,
        caption: `${caption} ${i + 1}`,
      })),
    },
    caption: `${caption} #fyp`,
  }
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    templateId: TEMPLATE,
    items: [item("One"), item("Two"), item("Three"), item("Four")],
    schedule: {
      accountIds: ["101", "202"],
      timezone: "America/New_York",
      startDate: "2026-10-12",
      timesOfDay: ["09:00", "13:00"],
      jitterMinutes: 0,
    },
    ...overrides,
  }
}

/** Runs the worker until no job is claimable (jobs due later stay queued). */
async function drain(publisherOverride: Publisher = publisher) {
  const worker = createWorker({
    repos,
    workerId: "test-worker",
    now,
    log: quiet,
    publisher: publisherOverride,
    renderSpec: fake.renderSpec,
  })
  for (let i = 0; i < 50; i++) {
    const result = await worker.tick()
    if (result.claimed === 0) return
  }
  throw new Error("jobs did not drain")
}

describe("planBatch", () => {
  it("validates every item, deals slots round-robin and never reuses a collection image while unused ones remain", async () => {
    const plan = await planBatch(
      WS,
      request({ items: [item("A", 2), item("B", 2), item("C", 1)] }),
      deps
    )
    expect(plan.ok).toBe(true)
    expect(plan.errors).toEqual([])
    expect(
      plan.items.map((i) => [i.accountId, i.localTime, i.slideCount])
    ).toEqual([
      ["101", "2026-10-12 09:00", 2],
      ["202", "2026-10-12 09:00", 2],
      ["101", "2026-10-12 13:00", 1],
    ])
    expect(plan.items[0]!.publishAt).toBe("2026-10-12T13:00:00.000Z")
    const picks = plan.items.flatMap((i) =>
      (i.boundSlotValues.slides as { image: { media: string } }[]).map(
        (s) => s.image.media
      )
    )
    // 5 picks from 4 images: the first 4 are all different, then it starts over.
    expect(new Set(picks.slice(0, 4)).size).toBe(4)
    expect(mediaIds).toEqual(expect.arrayContaining(picks))
    // Same request, same plan (preview == create).
    const again = await planBatch(
      WS,
      request({ items: [item("A", 2), item("B", 2), item("C", 1)] }),
      deps
    )
    expect(again.items.map((i) => i.boundSlotValues)).toEqual(
      plan.items.map((i) => i.boundSlotValues)
    )
  })

  it("is all-or-nothing with per-item errors and JSON pointers", async () => {
    const plan = await planBatch(
      WS,
      request({
        items: [
          item("ok"),
          {
            slotValues: { slides: [{ image: { media: "missing-media" } }] },
            caption: "x",
          },
          { slotValues: {}, caption: "y".repeat(2300) },
          { bogus: true },
        ],
        schedule: {
          accountIds: ["101", "999"],
          timezone: "America/New_York",
          startDate: "2026-10-12",
        },
      }),
      deps
    )
    expect(plan.ok).toBe(false)
    expect(plan.errors.map((e) => e.path)).toEqual(["/schedule/accountIds/1"])
    expect(plan.items[0]!.errors).toEqual([])
    expect(plan.items[1]!.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining(["/items/1/slotValues/slides/0/caption"])
    )
    expect(plan.items[2]!.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["slot.list_bounds"])
    )
    expect(plan.items[3]!.errors[0]?.path).toBe("/items/3")
    await expect(
      createBatch(
        WS,
        request({ items: [item("ok"), { bogus: true }] }),
        { source: "api", createdBy: WS },
        deps
      )
    ).rejects.toBeInstanceOf(BatchRequestError)
    expect((await repos.batches.list(WS)).items).toEqual([])
  })

  it("reports unknown media, caption limits and template problems", async () => {
    const plan = await planBatch(
      WS,
      request({
        items: [
          item("m", 1, { media: "nope" }),
          { ...item("long"), caption: "x".repeat(2300) },
        ],
      }),
      deps
    )
    expect(plan.items[0]!.errors.map((e) => [e.code, e.path])).toEqual([
      ["asset.not_found", "/items/0/slotValues/slides/0/image"],
    ])
    // Item 1 goes to the Instagram account (2200 characters).
    expect(plan.items[1]!.errors.map((e) => e.code)).toEqual([
      "batch.caption_length",
    ])
    const noTemplate = await planBatch(
      WS,
      request({ templateId: "starter-nope" }),
      deps
    )
    expect(noTemplate.errors[0]?.code).toBe("batch.template_not_found")
  })

  it("accepts CSV items", async () => {
    const csv = [
      "slides.0.image,slides.0.caption,caption",
      "collection:Sunsets,Hello,First post",
      "collection:Sunsets,World,Second post",
    ].join("\n")
    const plan = await planBatch(WS, request({ items: undefined, csv }), deps)
    expect(plan.ok).toBe(true)
    expect(plan.items.map((i) => i.caption)).toEqual([
      "First post",
      "Second post",
    ])
  })

  it("warns but still plans when SocialBu is not connected", async () => {
    const plan = await planBatch(WS, request(), {
      ...deps,
      publisher: new NotConfiguredPublisher(),
    })
    expect(plan.ok).toBe(true)
    expect(plan.publisher.connected).toBe(false)
    expect(plan.warnings[0]?.code).toBe("publisher.not_connected")
  })

  it("skips slots already taken by the account's scheduled posts", async () => {
    const { value: render } = await repos.renders.create(WS, {
      spec: {
        version: 1,
        canvas: { width: 10, height: 10, background: "#000" },
        fonts: [],
        slides: [],
      },
      source: "ui",
      createdBy: WS,
    })
    await repos.posts.upsertIntent(WS, {
      renderId: render.id,
      provider: "tiktok",
      accountId: "101",
      status: "scheduled",
      publishAt: "2026-10-12T13:05:00.000Z",
      caption: "",
      intentKey: "existing",
      createdBy: WS,
    })
    const plan = await planBatch(WS, request({ items: [item("A")] }), deps)
    expect(plan.items[0]!.localTime).toBe("2026-10-12 13:00")
  })
})

describe("batch pipeline", () => {
  it("renders every item and schedules each on SocialBu at its slot, then reports once", async () => {
    const { batch, created } = await createBatch(
      WS,
      request(),
      { source: "api", createdBy: WS },
      deps
    )
    expect(created).toBe(true)
    expect(batch.status).toBe("queued")
    await drain()

    const detail = await getBatchDetail(WS, batch.id, deps)
    expect(detail.state.status).toBe("completed")
    expect(detail.state.counts).toMatchObject({
      total: 4,
      rendered: 4,
      scheduled: 4,
      failed: 0,
      queued: 0,
    })
    expect(detail.state.items.every((i) => i.status === "scheduled")).toBe(true)

    const created_ = mock
      .callsTo("POST", "/posts")
      .map((c) => c.body as Record<string, unknown>)
    expect(created_).toHaveLength(4)
    expect(created_.map((b) => [b.accounts, b.publish_at])).toEqual(
      expect.arrayContaining([
        [[101], "2026-10-12 13:00:00"],
        [[202], "2026-10-12 13:00:00"],
        [[101], "2026-10-12 17:00:00"],
        [[202], "2026-10-12 17:00:00"],
      ])
    )
    const tiktok = created_.find((b) => (b.accounts as number[])[0] === 101)!
    expect(tiktok.options).toEqual({ privacy_status: "PUBLIC_TO_EVERYONE" })
    expect(tiktok.draft).toBeUndefined()
    expect(
      created_.find((b) => (b.accounts as number[])[0] === 202)!.options
    ).toBeUndefined()
    // Batch renders do not notify one by one; the batch reports once.
    const inbox = await repos.notifications.list(WS)
    expect(inbox.items.map((n) => n.event)).toEqual(["batch.finished"])
    expect(inbox.items[0]!.body).toContain("4 scheduled of 4")
    // Calendar rows carry the batch.
    const posts = await repos.posts.listByBatch(WS, batch.id)
    expect(posts.map((p) => p.batchIndex).sort()).toEqual([0, 1, 2, 3])
  })

  it("is idempotent on idempotencyKey", async () => {
    const body = request({ idempotencyKey: "agent-run-7" })
    const first = await createBatch(
      WS,
      body,
      { source: "api", createdBy: WS },
      deps
    )
    const second = await createBatch(
      WS,
      body,
      { source: "api", createdBy: WS },
      deps
    )
    expect(second.created).toBe(false)
    expect(second.batch.id).toBe(first.batch.id)
    await drain()
    expect(mock.callsTo("POST", "/posts")).toHaveLength(4)
  })

  it("uploads TikTok drafts in draft mode with a privacy override", async () => {
    const { batch } = await createBatch(
      WS,
      request({
        items: [item("A"), item("B")],
        schedule: {
          accountIds: ["101"],
          timezone: "UTC",
          startDate: "2026-10-12",
          mode: "draft",
          privacyStatus: "SELF_ONLY",
          jitterMinutes: 0,
        },
      }),
      { source: "api", createdBy: WS },
      deps
    )
    await drain()
    const bodies = mock
      .callsTo("POST", "/posts")
      .map((c) => c.body as Record<string, unknown>)
    expect(bodies).toHaveLength(2)
    for (const body of bodies) {
      expect(body.options).toEqual({
        privacy_status: "SELF_ONLY",
        upload_as_draft_to_tiktok: true,
      })
      expect(body.draft).toBeUndefined()
    }
    expect((await getBatchDetail(WS, batch.id, deps)).state.status).toBe(
      "completed"
    )
    const invalid = await planBatch(
      WS,
      request({
        schedule: {
          accountIds: ["202"],
          timezone: "UTC",
          startDate: "2026-10-12",
          mode: "draft",
        },
      }),
      deps
    )
    expect(invalid.errors[0]?.code).toBe("batch.draft_provider")
  })

  it("fails the scheduling step clearly without SocialBu, then retry schedules", async () => {
    const offline = new NotConfiguredPublisher()
    const { batch } = await createBatch(
      WS,
      request({ items: [item("A"), item("B")] }),
      { source: "ui", createdBy: WS },
      { ...deps, publisher: offline }
    )
    await drain(offline)

    let detail = await getBatchDetail(WS, batch.id, {
      ...deps,
      publisher: offline,
    })
    expect(detail.state.status).toBe("failed")
    expect(detail.state.counts).toMatchObject({
      rendered: 2,
      failed: 2,
      scheduled: 0,
    })
    expect(detail.state.items.map((i) => i.error)).toEqual([
      BATCH_NOT_CONNECTED_MESSAGE,
      BATCH_NOT_CONNECTED_MESSAGE,
    ])
    expect(mock.calls).toHaveLength(0)
    expect(
      (await repos.notifications.list(WS)).items.map((n) => n.title)
    ).toEqual([`Batch "${batch.name}" failed`])

    // Retrying while still offline changes nothing.
    const stillOffline = await retryBatch(WS, batch.id, {
      ...deps,
      publisher: offline,
    })
    expect(stillOffline.retried).toEqual([])
    expect(stillOffline.skipped.map((s) => s.index)).toEqual([0, 1])

    const retried = await retryBatch(WS, batch.id, deps)
    expect(retried.retried).toEqual([0, 1])
    await drain()
    detail = await getBatchDetail(WS, batch.id, deps)
    expect(detail.state.status).toBe("completed")
    expect(detail.state.items.map((i) => i.post?.provider)).toEqual([
      "tiktok",
      "instagram",
    ])
    expect(mock.callsTo("POST", "/posts")).toHaveLength(2)
    // A new "finished" notification for the retry round.
    expect((await repos.notifications.list(WS)).items).toHaveLength(2)
  })

  it("marks a SocialBu rejection on the item and finishes with errors", async () => {
    mock.fail({
      method: "POST",
      path: "/posts",
      status: 422,
      body: { message: "Caption not allowed" },
    })
    const { batch } = await createBatch(
      WS,
      request({ items: [item("A"), item("B")] }),
      { source: "api", createdBy: WS },
      deps
    )
    await drain()
    const detail = await getBatchDetail(WS, batch.id, deps)
    expect(detail.state.status).toBe("completed_with_errors")
    expect(
      detail.state.items.filter((i) => i.status === "failed")
    ).toHaveLength(1)
    expect(
      detail.state.items.find((i) => i.status === "failed")!.error
    ).toContain("Caption not allowed")
  })

  it("retries a failed render with a new render attempt", async () => {
    const render = fake.renderSpec
    let calls = 0
    fake.renderSpec = async (spec, options) => {
      calls++
      if (calls === 1)
        throw new RenderError([
          { code: "text.overflow", path: "/slides/0", message: "Too long" },
        ])
      return render(spec, options)
    }
    const { batch } = await createBatch(
      WS,
      request({ items: [item("A"), item("B")] }),
      { source: "api", createdBy: WS },
      deps
    )
    await drain()
    let detail = await getBatchDetail(WS, batch.id, deps)
    expect(detail.state.status).toBe("completed_with_errors")
    const failed = detail.state.items.find((i) => i.status === "failed")!
    expect(failed.render?.status).toBe("failed")

    const result = await retryBatch(WS, batch.id, deps)
    expect(result.retried).toEqual([failed.index])
    await drain()
    detail = await getBatchDetail(WS, batch.id, deps)
    expect(detail.state.status).toBe("completed")
    expect(detail.state.items[failed.index]!.renderId).not.toBe(failed.renderId)
    expect(await repos.renders.listByBatch(WS, batch.id)).toHaveLength(3)
  })

  it("moves an item whose slot passed before its render finished to the next free slot", async () => {
    const { batch } = await createBatch(
      WS,
      request({ items: [item("A")] }),
      { source: "api", createdBy: WS },
      deps
    )
    clock = new Date("2026-10-12T14:00:00.000Z") // 10:00 in New York: the 09:00 slot passed
    await drain()
    const detail = await getBatchDetail(WS, batch.id, deps)
    expect(detail.state.items[0]).toMatchObject({
      status: "scheduled",
      publishAt: "2026-10-12T17:00:00.000Z",
    })
  })

  it("the worker sweep recovers items whose render finished without a post", async () => {
    const { batch } = await createBatch(
      WS,
      request({ items: [item("A"), item("B")] }),
      { source: "api", createdBy: WS },
      deps
    )
    const startOnly = createWorker({
      repos,
      workerId: "w",
      now,
      log: quiet,
      publisher,
      renderSpec: fake.renderSpec,
      types: ["batch-start"],
    })
    await startOnly.tick()
    // Render outside the job handler (as if the process died before the batch hook ran).
    for (const render of await repos.renders.listByBatch(WS, batch.id)) {
      await executeRender({ repos, renderSpec: fake.renderSpec }, WS, render.id)
    }
    expect(
      (await getBatchDetail(WS, batch.id, deps)).state.items.map(
        (i) => i.status
      )
    ).toEqual(["rendered", "rendered"])
    expect(await sweepActiveBatches(deps)).toBe(1)
    await drain()
    expect((await getBatchDetail(WS, batch.id, deps)).state.status).toBe(
      "completed"
    )
  })

  it("cancels queued renders before they run", async () => {
    const { batch } = await createBatch(
      WS,
      request(),
      { source: "api", createdBy: WS },
      deps
    )
    // Run only the batch-start job: renders are queued, none rendered.
    const worker = createWorker({
      repos,
      workerId: "w",
      now,
      log: quiet,
      publisher,
      renderSpec: fake.renderSpec,
      types: ["batch-start"],
    })
    await worker.tick()
    const result = await cancelBatch(WS, batch.id, deps)
    expect(result.canceled).toEqual([0, 1, 2, 3])
    expect(result.state.status).toBe("canceled")
    await drain()
    expect(fake.calls).toHaveLength(0)
    expect(mock.calls.filter((c) => c.method !== "GET")).toHaveLength(0)
    expect(
      (await getBatchDetail(WS, batch.id, deps)).state.items.every(
        (i) => i.status === "canceled"
      )
    ).toBe(true)
    await expect(retryBatch(WS, batch.id, deps)).rejects.toMatchObject({
      status: 409,
    })
  })

  it("deletes scheduled SocialBu posts on cancel and keeps published ones", async () => {
    const { batch } = await createBatch(
      WS,
      request(),
      { source: "api", createdBy: WS },
      deps
    )
    await drain()
    const posts = await repos.posts.listByBatch(WS, batch.id)
    const published = posts.find((p) => p.batchIndex === 0)!
    await repos.posts.update(WS, published.id, {
      status: "published",
      publishedAt: clock.toISOString(),
    })

    const result = await cancelBatch(WS, batch.id, deps)
    expect(result.canceled.sort()).toEqual([1, 2, 3])
    expect(result.kept).toEqual([{ index: 0, reason: "Already published." }])
    expect(result.failures).toEqual([])
    expect(mock.calls.filter((c) => c.method === "DELETE")).toHaveLength(3)
    expect(result.state.counts).toMatchObject({ published: 1, canceled: 3 })
  })

  it("reports SocialBu delete failures on cancel", async () => {
    const { batch } = await createBatch(
      WS,
      request({ items: [item("A")] }),
      { source: "api", createdBy: WS },
      deps
    )
    await drain()
    mock.fail({ method: "DELETE", path: "/posts/", status: 500, times: 10 })
    const result = await cancelBatch(WS, batch.id, {
      ...deps,
      publisher: new SocialBuPublisher({
        now,
        token: "test-token",
        baseUrl: MOCK_BASE_URL,
        fetch: mock.fetch,
        sleep: async () => undefined,
        maxRetries: 0,
      }),
    })
    expect(result.failures).toHaveLength(1)
    expect(result.canceled).toEqual([])
  })
})

describe("deriveBatchState", () => {
  it("is queued before anything starts and running while items are in flight", () => {
    const batch = {
      items: [{}, {}] as never[],
      itemErrors: {},
      canceledAt: null,
    }
    expect(deriveBatchState(batch, [], []).status).toBe("queued")
    const rendering = deriveBatchState(
      batch,
      [
        {
          id: "r1",
          batchIndex: 0,
          status: "rendering",
          idempotencyKey: "batch:b:0:0",
        } as never,
      ],
      []
    )
    expect(rendering.status).toBe("running")
    expect(rendering.counts).toMatchObject({ queued: 2, rendered: 0 })
    const failedStart = deriveBatchState(
      { ...batch, itemErrors: { 0: "gone", 1: "gone" } },
      [],
      []
    )
    expect(failedStart.status).toBe("failed")
  })
})
