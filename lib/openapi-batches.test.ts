import { beforeEach, describe, expect, it } from "vitest"

import { TokenBucketRateLimiter } from "@/lib/api-keys"
import {
  createMemoryRepositories,
  type ApiKeyScope,
  type Repositories,
} from "@/lib/data"
import { createWorker } from "@/lib/jobs/worker"
import { createOpenApiApp, requiredScope } from "@/lib/openapi-app"
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
import { storeMedia } from "@/lib/renders/media"
import { createFakeRenderSpec, TINY_PNG } from "@/lib/renders/test-fakes"

const WS = "user_api_batch"
const quiet = { info() {}, warn() {}, error() {} }

let repos: Repositories
let fake: ReturnType<typeof createFakeRenderSpec>
let mock: SocialBuMock
let publisher: Publisher
let clock: Date
let kicked: number
const now = () => clock

function makeApp() {
  return createOpenApiApp({
    repositories: () => repos,
    renderSpec: fake.renderSpec,
    publisher: () => publisher,
    sessionWorkspaceId: async () => null,
    rateLimiter: new TokenBucketRateLimiter(1000, 1000),
    now,
    kickJobs: () => {
      kicked++
    },
  })
}

async function key(scopes: ApiKeyScope[] = ["batches:read", "batches:write"]) {
  return (
    await repos.apiKeys.create(WS, { name: "agent", scopes, createdBy: WS })
  ).plaintext
}

function call(
  app: ReturnType<typeof makeApp>,
  path: string,
  init: RequestInit & { key: string; json?: unknown }
) {
  const headers = new Headers(init.headers)
  headers.set("authorization", `Bearer ${init.key}`)
  let body = init.body
  if (init.json !== undefined) {
    headers.set("content-type", "application/json")
    body = JSON.stringify(init.json)
  }
  return app.request(`/api/v1${path}`, { ...init, headers, body })
}

async function drain() {
  const worker = createWorker({
    repos,
    workerId: "t",
    now,
    log: quiet,
    publisher,
    renderSpec: fake.renderSpec,
  })
  for (let i = 0; i < 50; i++) if ((await worker.tick()).claimed === 0) return
}

const body = (overrides: Record<string, unknown> = {}) => ({
  templateId: "starter-photo-pill",
  items: [
    {
      slotValues: {
        slides: [
          {
            image: { collection: "Sunsets", pick: "random" },
            caption: "Hook one",
          },
        ],
      },
      caption: "One #fyp",
    },
    {
      slotValues: {
        slides: [
          {
            image: { collection: "Sunsets", pick: "random" },
            caption: "Hook two",
          },
        ],
      },
      caption: "Two #fyp",
    },
  ],
  schedule: {
    accountIds: ["101"],
    timezone: "UTC",
    startDate: "2026-10-12",
    timesOfDay: ["09:00", "18:00"],
    jitterMinutes: 0,
  },
  ...overrides,
})

beforeEach(async () => {
  clock = new Date("2026-10-09T12:00:00.000Z")
  repos = createMemoryRepositories({ now })
  fake = createFakeRenderSpec()
  mock = createSocialBuMock()
  kicked = 0
  publisher = new SocialBuPublisher({
    now,
    token: "test-token",
    baseUrl: MOCK_BASE_URL,
    fetch: mock.fetch,
    sleep: async () => undefined,
    uploadPollIntervalMs: 0,
  })
  const collection = await repos.collections.create(WS, {
    name: "Sunsets",
    createdBy: WS,
  })
  for (let i = 0; i < 3; i++) {
    await storeMedia(repos, WS, {
      bytes: new Uint8Array([...TINY_PNG, i]),
      mime: "image/png",
      collectionId: collection.id,
      source: "upload",
      createdBy: WS,
    })
  }
})

describe("/api/v1/batches", () => {
  it("documents the batch routes and maps their scopes", async () => {
    const doc = await (await makeApp().request("/api/v1/openapi.json")).json()
    for (const path of [
      "/api/v1/batches",
      "/api/v1/batches/preview",
      "/api/v1/batches/{id}",
      "/api/v1/batches/{id}/retry",
      "/api/v1/batches/{id}/cancel",
    ]) {
      expect(doc.paths[path], path).toBeTruthy()
    }
    expect(requiredScope("POST", "/batches/preview")).toBe("batches:read")
    expect(requiredScope("POST", "/batches")).toBe("batches:write")
    expect(requiredScope("POST", "/batches/x/cancel")).toBe("batches:write")
    expect(requiredScope("GET", "/batches/x")).toBe("batches:read")
  })

  it("previews without writing, then creates, renders and schedules on SocialBu", async () => {
    const app = makeApp()
    const k = await key()
    const preview = await call(app, "/batches/preview", {
      method: "POST",
      key: k,
      json: body(),
    })
    expect(preview.status).toBe(200)
    const { preview: plan } = await preview.json()
    expect(plan.ok).toBe(true)
    expect(plan.items.map((i: { publishAt: string }) => i.publishAt)).toEqual([
      "2026-10-12T09:00:00.000Z",
      "2026-10-12T18:00:00.000Z",
    ])
    expect((await repos.batches.list(WS)).items).toEqual([])

    const created = await call(app, "/batches", {
      method: "POST",
      key: k,
      json: body({ idempotencyKey: "run-1" }),
    })
    expect(created.status).toBe(201)
    const { batch } = await created.json()
    expect(batch).toMatchObject({
      status: "queued",
      itemCount: 2,
      counts: { total: 2 },
    })
    expect(kicked).toBe(1)

    await drain()
    const got = await (
      await call(app, `/batches/${batch.id}`, { key: k })
    ).json()
    expect(got.batch.status).toBe("completed")
    expect(got.batch.items.map((i: { status: string }) => i.status)).toEqual([
      "scheduled",
      "scheduled",
    ])
    expect(got.batch.items[0].render.coverUrl).toMatch(
      /\/api\/v1\/renders\/.+\/slides\/0$/
    )
    expect(got.batch.items[0].post.providerPostId).toBeTruthy()
    expect(
      mock
        .callsTo("POST", "/posts")
        .map((c) => (c.body as { publish_at: string }).publish_at)
    ).toEqual(["2026-10-12 09:00:00", "2026-10-12 18:00:00"])

    const replay = await call(app, "/batches", {
      method: "POST",
      key: k,
      json: body({ idempotencyKey: "run-1" }),
    })
    expect(replay.status).toBe(200)
    expect((await replay.json()).batch.id).toBe(batch.id)

    const list = await (await call(app, "/batches", { key: k })).json()
    expect(list.batches.map((b: { id: string }) => b.id)).toEqual([batch.id])
    expect(list.batches[0].counts.scheduled).toBe(2)

    const cancel = await (
      await call(app, `/batches/${batch.id}/cancel`, { method: "POST", key: k })
    ).json()
    expect(cancel.canceled).toEqual([0, 1])
    expect(cancel.batch.status).toBe("canceled")
    expect(mock.calls.filter((c) => c.method === "DELETE")).toHaveLength(2)
    const retry = await call(app, `/batches/${batch.id}/retry`, {
      method: "POST",
      key: k,
    })
    expect(retry.status).toBe(409)
  })

  it("rejects an invalid batch with 422 and per-item pointers, creating nothing", async () => {
    const app = makeApp()
    const res = await call(app, "/batches", {
      method: "POST",
      key: await key(),
      json: body({ items: [{ slotValues: { slides: [] }, caption: "x" }] }),
    })
    expect(res.status).toBe(422)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.preview.items[0].errors[0].path).toMatch(
      /^\/items\/0\/slotValues\/slides/
    )
    expect((await repos.batches.list(WS)).items).toEqual([])
  })

  it("accepts a CSV upload with a column mapping", async () => {
    const app = makeApp()
    const form = new FormData()
    form.set(
      "file",
      new Blob(["Image,Text,Post\ncollection:Sunsets,Hello,Caption A\n"], {
        type: "text/csv",
      }),
      "items.csv"
    )
    const { items: _items, ...rest } = body()
    form.set(
      "payload",
      JSON.stringify({
        ...rest,
        mapping: {
          Image: "slides.0.image",
          Text: "slides.0.caption",
          Post: "caption",
        },
      })
    )
    const res = await call(app, "/batches/preview", {
      method: "POST",
      key: await key(),
      body: form,
    })
    const { preview } = await res.json()
    expect(preview.ok).toBe(true)
    expect(preview.items).toEqual([
      expect.objectContaining({ caption: "Caption A", slideCount: 1 }),
    ])
  })

  it("enforces scopes", async () => {
    const app = makeApp()
    const readOnly = await key(["batches:read"])
    expect(
      (
        await call(app, "/batches/preview", {
          method: "POST",
          key: readOnly,
          json: body(),
        })
      ).status
    ).toBe(200)
    expect(
      (
        await call(app, "/batches", {
          method: "POST",
          key: readOnly,
          json: body(),
        })
      ).status
    ).toBe(403)
    const renderOnly = await key(["renders:read"])
    expect((await call(app, "/batches", { key: renderOnly })).status).toBe(403)
  })

  it("finishes with a clear failure per item when SocialBu is not connected", async () => {
    publisher = new NotConfiguredPublisher()
    const app = makeApp()
    const k = await key()
    const created = await call(app, "/batches", {
      method: "POST",
      key: k,
      json: body(),
    })
    expect(created.status).toBe(201)
    expect((await created.json()).warnings[0].code).toBe(
      "publisher.not_connected"
    )
    await drain()
    const { batch } = await (
      await call(
        app,
        `/batches/${(await repos.batches.list(WS)).items[0]!.id}`,
        { key: k }
      )
    ).json()
    expect(batch.status).toBe("failed")
    expect(batch.counts).toMatchObject({ rendered: 2, failed: 2 })
    expect(batch.items[0].error).toMatch(/SocialBu not connected/)
    expect(batch.items[0].render.slides).toHaveLength(1)
  })
})
