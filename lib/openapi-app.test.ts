import JSZip from "jszip"
import { beforeEach, describe, expect, it } from "vitest"

import { TokenBucketRateLimiter } from "@/lib/api-keys"
import { createMemoryRepositories, type Repositories } from "@/lib/data"
import { NotConfiguredPublisher, type Publisher } from "@/lib/publishing/publisher"
import { createOpenApiApp } from "@/lib/openapi-app"
import { TINY_PNG, createFakePublisher, createFakeRenderSpec } from "@/lib/renders/test-fakes"

const WS = "user_ws1"
const OTHER = "user_ws2"

const simpleSpec = (slides = 2) => ({
  version: 1,
  canvas: { preset: "4:5", background: "#101010" },
  slides: Array.from({ length: slides }, (_, i) => ({
    id: `s${i + 1}`,
    layers: [{ id: "t", type: "text", frame: { inset: 40 }, text: `Slide ${i + 1}` }],
  })),
})

let repos: Repositories
let fake: ReturnType<typeof createFakeRenderSpec>
let session: string | null
let publisher: Publisher

function makeApp(overrides: Parameters<typeof createOpenApiApp>[0] = {}) {
  return createOpenApiApp({
    repositories: () => repos,
    renderSpec: fake.renderSpec,
    publisher: () => publisher,
    sessionWorkspaceId: async () => session,
    rateLimiter: new TokenBucketRateLimiter(1000, 1000),
    assetLoader: undefined,
    ...overrides,
  })
}

async function newKey(workspaceId = WS, scopes?: Parameters<Repositories["apiKeys"]["create"]>[1]["scopes"]) {
  const { plaintext } = await repos.apiKeys.create(workspaceId, {
    name: "test",
    scopes: scopes ?? [
      "renders:read",
      "renders:write",
      "templates:read",
      "media:read",
      "media:write",
      "posts:read",
      "posts:write",
    ],
    createdBy: workspaceId,
  })
  return plaintext
}

function call(app: ReturnType<typeof makeApp>, path: string, init: RequestInit & { key?: string; json?: unknown } = {}) {
  const headers = new Headers(init.headers)
  if (init.key) headers.set("authorization", `Bearer ${init.key}`)
  let body = init.body
  if (init.json !== undefined) {
    headers.set("content-type", "application/json")
    body = JSON.stringify(init.json)
  }
  return app.request(`/api/v1${path}`, { ...init, headers, body })
}

beforeEach(() => {
  repos = createMemoryRepositories()
  fake = createFakeRenderSpec()
  session = null
  publisher = new NotConfiguredPublisher()
})

describe("/api/v1 public endpoints", () => {
  it("serves health, the OpenAPI document, the spec schema and fonts without auth", async () => {
    const app = makeApp()
    expect(await (await call(app, "/health")).json()).toMatchObject({ status: "ok" })

    const doc = await (await call(app, "/openapi.json")).json()
    expect(doc.openapi).toBe("3.1.0")
    for (const path of [
      "/api/v1/specs/validate",
      "/api/v1/schema",
      "/api/v1/fonts",
      "/api/v1/templates",
      "/api/v1/templates/{id}",
      "/api/v1/renders",
      "/api/v1/renders/{id}",
      "/api/v1/renders/{id}/slides/{index}",
      "/api/v1/renders/{id}/zip",
      "/api/v1/collections",
      "/api/v1/media",
      "/api/v1/posts",
    ]) {
      expect(doc.paths[path], path).toBeDefined()
    }

    const schema = await (await call(app, "/schema")).json()
    expect(schema.schema.$id).toContain("slideshow-spec-v1")
    expect(schema.issueCodes).toContain("text.overflow")

    const fonts = await (await call(app, "/fonts")).json()
    expect(fonts.families).toContain("Inter")
    expect(fonts.families).toContain("Thumpa")
  })
})

describe("/api/v1 auth", () => {
  it("rejects missing, malformed and revoked keys", async () => {
    const app = makeApp()
    expect((await call(app, "/renders")).status).toBe(401)
    expect((await call(app, "/renders", { key: "lc_000000_nope" })).status).toBe(401)

    const key = await newKey()
    expect((await call(app, "/renders", { key })).status).toBe(200)
    const [stored] = await repos.apiKeys.list(WS)
    await repos.apiKeys.revoke(WS, stored.id)
    expect((await call(app, "/renders", { key })).status).toBe(401)
  })

  it("accepts the Clerk session when no bearer token is sent", async () => {
    session = WS
    const app = makeApp()
    expect((await call(app, "/renders")).status).toBe(200)
  })

  it("enforces key scopes", async () => {
    const key = await newKey(WS, ["renders:read"])
    const app = makeApp()
    expect((await call(app, "/renders", { key })).status).toBe(200)
    const denied = await call(app, "/renders", { key, method: "POST", json: { spec: simpleSpec() } })
    expect(denied.status).toBe(403)
  })

  it("rate limits per key with a token bucket", async () => {
    const key = await newKey()
    let t = 0
    const app = makeApp({ rateLimiter: new TokenBucketRateLimiter(2, 1, () => t) })
    expect((await call(app, "/renders", { key })).status).toBe(200)
    expect((await call(app, "/renders", { key })).status).toBe(200)
    const limited = await call(app, "/renders", { key })
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("1")
    t = 1000
    expect((await call(app, "/renders", { key })).status).toBe(200)
  })
})

describe("/api/v1 specs and templates", () => {
  it("validates specs with inline issues", async () => {
    const key = await newKey()
    const app = makeApp()
    const ok = await (await call(app, "/specs/validate", { key, method: "POST", json: { spec: simpleSpec() } })).json()
    expect(ok).toMatchObject({ ok: true, errors: [] })

    const bad = await (
      await call(app, "/specs/validate", {
        key,
        method: "POST",
        json: { spec: { version: 1, canvas: { preset: "4:5" }, slides: [{ id: "a", layers: [{ id: "x", type: "blob" }] }] } },
      })
    ).json()
    expect(bad.ok).toBe(false)
    expect(bad.errors[0].path).toMatch(/^\/slides\/0\/layers\/0/)
  })

  it("lists starter templates and returns one with its slots", async () => {
    const key = await newKey()
    const app = makeApp()
    const list = await (await call(app, "/templates", { key })).json()
    expect(list.templates.map((t: { id: string }) => t.id)).toEqual([
      "starter-listicle",
      "starter-quote-carousel",
      "starter-collage",
    ])
    const one = await (await call(app, "/templates/starter-collage", { key })).json()
    expect(one.template.slots.photos.type).toBe("list")
    expect((await call(app, "/templates/nope", { key })).status).toBe(404)
  })
})

describe("/api/v1 renders", () => {
  it("renders small specs synchronously and serves slides and a ZIP", async () => {
    const key = await newKey()
    const app = makeApp()
    const response = await call(app, "/renders", {
      key,
      method: "POST",
      json: { spec: simpleSpec(2), title: "Sleep habits #12" },
    })
    expect(response.status).toBe(201)
    const { render } = await response.json()
    expect(render).toMatchObject({ status: "succeeded", slideCount: 2, source: "api", title: "Sleep habits #12" })
    expect(render.slides).toHaveLength(2)
    expect(render.slides[1].url).toBe(`http://localhost/api/v1/renders/${render.id}/slides/1`)
    expect(render.renderHash).toMatch(/^sha256:/)

    const slide = await call(app, `/renders/${render.id}/slides/1`, { key })
    expect(slide.status).toBe(200)
    expect(slide.headers.get("content-type")).toBe("image/png")
    expect(new Uint8Array(await slide.arrayBuffer()).at(-1)).toBe(1)

    const zip = await call(app, `/renders/${render.id}/zip`, { key })
    expect(zip.headers.get("content-type")).toBe("application/zip")
    const archive = await JSZip.loadAsync(await zip.arrayBuffer())
    expect(Object.keys(archive.files).sort()).toEqual(["sleep-habits-12-01.png", "sleep-habits-12-02.png"])

    const got = await (await call(app, `/renders/${render.id}`, { key })).json()
    expect(got.render.resolvedSpec.slides).toHaveLength(2)
  })

  it("queues renders above 10 slides as a render-slideshow job (202)", async () => {
    const key = await newKey()
    const app = makeApp()
    const response = await call(app, "/renders", { key, method: "POST", json: { spec: simpleSpec(11) } })
    expect(response.status).toBe(202)
    const body = await response.json()
    expect(body.render.status).toBe("queued")
    const job = await repos.jobs.get(WS, body.jobId)
    expect(job).toMatchObject({ type: "render-slideshow", payload: { renderId: body.render.id } })
    expect(fake.calls).toHaveLength(0)
  })

  it("honours wait:false and idempotency keys", async () => {
    const key = await newKey()
    const app = makeApp()
    const first = await call(app, "/renders", {
      key,
      method: "POST",
      json: { spec: simpleSpec(1), wait: false, idempotencyKey: "run-1" },
    })
    expect(first.status).toBe(202)
    const again = await call(app, "/renders", {
      key,
      method: "POST",
      json: { spec: simpleSpec(1), wait: false, idempotencyKey: "run-1" },
    })
    expect(again.status).toBe(200)
    expect((await again.json()).render.id).toBe((await first.json()).render.id)
  })

  it("renders a template from {templateId, slots}, picking collection media deterministically", async () => {
    const key = await newKey()
    const collection = await repos.collections.create(WS, { name: "bedroom-aesthetic", createdBy: WS })
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      const media = await repos.media.create(WS, {
        collectionId: collection.id,
        kind: "image",
        fileId: `f${i}`,
        mimeType: "image/png",
        sizeBytes: TINY_PNG.length,
        sha256: `sha-${i}`,
        source: "upload",
        createdBy: WS,
      })
      await repos.blobs.put(WS, "media", `f${i}`, TINY_PNG, "image/png")
      ids.push(media.value.id)
    }
    const app = makeApp()
    const slots = {
      label: "Morning routine",
      photos: [0, 1, 2, 3].map(() => ({ image: { collection: "bedroom-aesthetic", pick: "random", seed: "s" } })),
    }
    const response = await call(app, "/renders", { key, method: "POST", json: { templateId: "starter-collage", slots } })
    expect(response.status).toBe(201)
    const { render } = await response.json()
    expect(render.templateId).toBe("starter-collage")
    const sources = JSON.stringify(render.resolvedSpec)
    expect(ids.some((id) => sources.includes(id))).toBe(true)
  })

  it("returns 422 with JSON pointers for bad slot values", async () => {
    const key = await newKey()
    const app = makeApp()
    const response = await call(app, "/renders", {
      key,
      method: "POST",
      json: { templateId: "starter-collage", slotValues: { label: "x" } },
    })
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.ok).toBe(false)
    expect(body.errors.some((e: { path: string }) => e.path.startsWith("/slotValues"))).toBe(true)
  })

  it("never shows one workspace's render to another", async () => {
    const key = await newKey()
    const otherKey = await newKey(OTHER)
    const app = makeApp()
    const { render } = await (await call(app, "/renders", { key, method: "POST", json: { spec: simpleSpec(1) } })).json()
    expect((await call(app, `/renders/${render.id}`, { key: otherKey })).status).toBe(404)
    expect((await call(app, `/renders/${render.id}/slides/0`, { key: otherKey })).status).toBe(404)
    expect((await call(app, `/renders/${render.id}/zip`, { key: otherKey })).status).toBe(404)
  })
})

describe("/api/v1 media", () => {
  it("uploads to a collection and serves the file only to its workspace", async () => {
    const key = await newKey()
    const otherKey = await newKey(OTHER)
    const app = makeApp()
    const created = await call(app, "/collections", { key, method: "POST", json: { name: "Moodboard" } })
    expect(created.status).toBe(201)
    const { collection } = await created.json()
    expect((await call(app, "/collections", { key, method: "POST", json: { name: "Moodboard" } })).status).toBe(409)

    const form = new FormData()
    form.set("file", new Blob([TINY_PNG], { type: "image/png" }), "pixel.png")
    form.set("collectionId", collection.id)
    const upload = await call(app, "/media", { key, method: "POST", body: form })
    expect(upload.status).toBe(201)
    const { media } = await upload.json()
    expect(media).toMatchObject({ collectionId: collection.id, mimeType: "image/png", width: 1, height: 1 })

    const list = await (await call(app, `/media?collectionId=${collection.id}`, { key })).json()
    expect(list.media.map((m: { id: string }) => m.id)).toEqual([media.id])

    expect((await call(app, `/media/${media.id}/file`, { key })).status).toBe(200)
    expect((await call(app, `/media/${media.id}/file`, { key: otherKey })).status).toBe(404)

    const notImage = new FormData()
    notImage.set("file", new Blob(["hello"], { type: "text/plain" }), "a.txt")
    expect((await call(app, "/media", { key, method: "POST", body: notImage })).status).toBe(415)
  })

  it("refuses URL imports that target private addresses", async () => {
    const key = await newKey()
    const app = makeApp()
    const response = await call(app, "/media", { key, method: "POST", json: { url: "http://127.0.0.1/admin.png" } })
    expect(response.status).toBe(424)
  })
})

describe("/api/v1 publishing", () => {
  it('reports "SocialBu not connected" when the token is missing', async () => {
    const key = await newKey()
    const app = makeApp()
    expect(await (await call(app, "/accounts", { key })).json()).toEqual({
      connected: false,
      message: "SocialBu not connected",
      accounts: [],
    })
    const response = await call(app, "/posts", {
      key,
      method: "POST",
      json: { renderId: "r1", accountIds: ["101"] },
    })
    expect(response.status).toBe(503)
    expect((await response.json()).error).toBe("SocialBu not connected")
  })

  it("uploads slides and schedules one SocialBu post per account, idempotently", async () => {
    // The publishing service (lib/publishing/service.ts) uploads per account
    // (SocialBu upload tokens are single-use) and creates one post per account.
    const fakePublisher = createFakePublisher()
    publisher = fakePublisher.publisher
    const key = await newKey()
    const app = makeApp({ now: () => new Date("2026-10-09T08:00:00Z") })
    const { render } = await (await call(app, "/renders", { key, method: "POST", json: { spec: simpleSpec(3) } })).json()

    const request = {
      renderId: render.id,
      accountIds: ["101", "202"],
      caption: "Night routine",
      publishAt: "2026-10-10T18:00:00Z",
      platformOptions: { tiktok: { privacy_status: "PUBLIC_TO_EVERYONE" } },
      idempotencyKey: "post-1",
    }
    const response = await call(app, "/posts", { key, method: "POST", json: request })
    expect(response.status).toBe(201)
    const { posts } = await response.json()
    expect(posts).toHaveLength(2)
    expect(posts[0]).toMatchObject({ status: "scheduled", publishAt: "2026-10-10T18:00:00.000Z" })
    expect(posts[0].providerPostId).toBeTruthy()
    expect(fakePublisher.uploads).toHaveLength(6)
    expect(fakePublisher.posts).toHaveLength(2)
    expect(fakePublisher.posts[0]).toMatchObject({ accounts: ["101"], media: ["tok-1", "tok-2", "tok-3"] })

    const replay = await call(app, "/posts", { key, method: "POST", json: request })
    expect(replay.status).toBe(201)
    expect(fakePublisher.posts).toHaveLength(2)

    const calendar = await (
      await call(app, "/posts?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z", { key })
    ).json()
    expect(calendar.posts).toHaveLength(2)
    const reminders = await repos.notifications.listDue("2026-10-11T00:00:00Z", 10)
    expect(reminders.map((n) => n.event)).toEqual(["post.upcoming", "post.upcoming"])
  })
})
